#!/usr/bin/env node
// Render a vertical short from an edit JSON.
//   node render.mjs edit.json
// Edit JSON fields (times in seconds, caption/hook times are on the OUTPUT timeline):
//   source, output, size{w,h}, trim{start,end}, speed, crf, hook{text,start,end}, captions[{start,end,text}]
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function findBinary(name, envKey, pkg) {
  if (process.env[envKey]) return process.env[envKey];
  const onPath = spawnSync(process.platform === "win32" ? "where" : "which", [name], { encoding: "utf8" });
  if (onPath.status === 0 && onPath.stdout.trim()) return onPath.stdout.trim().split(/\r?\n/)[0];
  try {
    const p = require(pkg);
    return typeof p === "string" ? p : p.path;
  } catch {
    return null;
  }
}

const ffmpeg = findBinary("ffmpeg", "FFMPEG_PATH", "ffmpeg-static");
const ffprobe = findBinary("ffprobe", "FFPROBE_PATH", "ffprobe-static");
if (!ffmpeg) {
  console.error("ffmpeg not found. Install it, set FFMPEG_PATH, or `npm i ffmpeg-static` next to this script.");
  process.exit(1);
}

const editPath = process.argv[2];
if (!editPath) {
  console.error("usage: node render.mjs edit.json");
  process.exit(1);
}
const edit = JSON.parse(fs.readFileSync(editPath, "utf8"));
const W = edit.size?.w ?? 1080;
const H = edit.size?.h ?? 1920;
const speed = edit.speed ?? 1;
const crf = edit.crf ?? 26;
const trim = edit.trim ?? {};
const out = path.resolve(path.dirname(editPath), edit.output ?? "cut.mp4");
const src = path.resolve(path.dirname(editPath), edit.source);
fs.mkdirSync(path.dirname(out), { recursive: true });

// --- Probe the source for audio and duration ---
let hasAudio = true;
let srcDuration = null;
if (ffprobe) {
  const p = spawnSync(ffprobe, ["-v", "error", "-show_entries", "stream=codec_type:format=duration", "-of", "json", src], { encoding: "utf8" });
  if (p.status === 0) {
    const info = JSON.parse(p.stdout);
    hasAudio = (info.streams ?? []).some((s) => s.codec_type === "audio");
    srcDuration = Number(info.format?.duration) || null;
  }
}

// --- Build the ASS caption file (libass renders it; works in static ffmpeg builds without drawtext) ---
function assTime(sec) {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = (s % 60).toFixed(2).padStart(5, "0");
  return `${h}:${String(m).padStart(2, "0")}:${rest}`;
}
function assEscape(t) {
  return String(t).replace(/\\/g, "\\\\").replace(/\{/g, "(").replace(/\}/g, ")").replace(/\r?\n/g, "\\N");
}
// Margins keep text out of TikTok's own UI: ~14% top (username/sound), ~24% bottom (caption + sound bar),
// and ~14% right rail (like/comment/share).
const capSize = Math.round(H * 0.036);
const hookSize = Math.round(H * 0.042);
const marginV = Math.round(H * 0.25);
const hookMarginV = Math.round(H * 0.16);
const marginR = Math.round(W * 0.15);
const marginL = Math.round(W * 0.06);
const style = edit.style ?? {};
const font = style.font ?? "DejaVu Sans";
const captionColor = style.captionColor ?? "&H00FFFFFF"; // ASS is &HAABBGGRR
const hookColor = style.hookColor ?? "&H0041B4F2"; // amber #F2B441
const ass = [
  "[Script Info]",
  "ScriptType: v4.00+",
  `PlayResX: ${W}`,
  `PlayResY: ${H}`,
  "WrapStyle: 0",
  "ScaledBorderAndShadow: yes",
  "",
  "[V4+ Styles]",
  "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
  `Style: Caption,${font},${capSize},${captionColor},&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,${Math.round(capSize * 0.11)},${Math.round(capSize * 0.06)},2,${marginL},${marginR},${marginV},1`,
  `Style: Hook,${font},${hookSize},${hookColor},&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,${Math.round(hookSize * 0.11)},${Math.round(hookSize * 0.06)},8,${marginL},${marginR},${hookMarginV},1`,
  "",
  "[Events]",
  "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
];
if (edit.hook?.text) {
  ass.push(`Dialogue: 1,${assTime(edit.hook.start ?? 0)},${assTime(edit.hook.end ?? 3)},Hook,,0,0,0,,${assEscape(edit.hook.text)}`);
}
for (const c of edit.captions ?? []) {
  ass.push(`Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Caption,,0,0,0,,${assEscape(c.text)}`);
}
const assPath = out.replace(/\.[^.]+$/, "") + ".captions.ass";
fs.writeFileSync(assPath, ass.join("\n") + "\n");

// --- Filters ---
// subtitles= needs its path escaped for the ffmpeg filter parser (':' and '\' are special).
const assForFilter = assPath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
const vf = [
  speed !== 1 ? `setpts=PTS/${speed}` : null,
  `scale=${W}:${H}:force_original_aspect_ratio=increase`,
  `crop=${W}:${H}`,
  `subtitles='${assForFilter}'`,
  "format=yuv420p",
]
  .filter(Boolean)
  .join(",");

const args = ["-y", "-hide_banner", "-loglevel", "error", "-stats"];
if (trim.start != null) args.push("-ss", String(trim.start));
if (trim.end != null) args.push("-to", String(trim.end));
args.push("-i", src, "-vf", vf, "-r", String(edit.fps ?? 30));
if (hasAudio) {
  const af = [];
  if (speed !== 1) {
    // atempo accepts 0.5..2.0 per stage; chain stages for larger factors.
    let s = speed;
    while (s > 2) { af.push("atempo=2"); s /= 2; }
    while (s < 0.5) { af.push("atempo=0.5"); s /= 0.5; }
    af.push(`atempo=${s}`);
  }
  if (af.length) args.push("-af", af.join(","));
  args.push("-c:a", "aac", "-b:a", "128k");
} else {
  args.push("-an");
}
args.push("-c:v", "libx264", "-preset", "medium", "-crf", String(crf), "-movflags", "+faststart", "-shortest", out);

console.error(`ffmpeg ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(" ")}`);
const r = spawnSync(ffmpeg, args, { stdio: "inherit" });
if (r.status !== 0) process.exit(r.status ?? 1);

// --- Report ---
let outDuration = null;
if (ffprobe) {
  const p = spawnSync(ffprobe, ["-v", "error", "-show_entries", "format=duration,size", "-of", "json", out], { encoding: "utf8" });
  if (p.status === 0) {
    const info = JSON.parse(p.stdout);
    outDuration = Number(info.format?.duration) || null;
    console.log(JSON.stringify({ output: out, captions: assPath, duration: outDuration, bytes: Number(info.format?.size), sourceDuration: srcDuration }, null, 2));
  }
}
