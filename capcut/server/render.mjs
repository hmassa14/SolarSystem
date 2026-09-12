// Render an approximation of a CapCut draft to mp4 with ffmpeg so it can be previewed
// without opening CapCut. Covers: the main video track (clips, photos, trims, speed, scale,
// position, volume), extra audio tracks (volume, fades), and text tracks (as burned captions).
// Not covered: effects, transitions, animations, stickers, overlay video tracks (reported back).
import fs from "node:fs";
import path from "node:path";
import { requireFfmpeg, run, probe } from "./media.mjs";

const US = 1e6;
const sec = (u) => u / US;

export function renderDraft(draft, outFile, { width = 720, crf = 27, fps = 30, maxSec = 180 } = {}) {
  const c = draft.content;
  const W = width, H = Math.round((width * draft.height) / draft.width / 2) * 2;
  const total = Math.min(sec(c.duration || 0), maxSec);
  if (total <= 0) throw new Error("draft is empty");
  const skipped = [];
  const inputs = []; // ffmpeg -i args
  const filters = [];
  const addInput = (args) => { inputs.push(args); return inputs.length - 1; };

  // ---- base: main video track ----
  const videoTracks = draft.tracksOf("video").sort((a, b) => draft.trackRenderIndex(a) - draft.trackRenderIndex(b));
  const main = videoTracks[0];
  if (videoTracks.length > 1) skipped.push(`${videoTracks.length - 1} overlay video track(s) not rendered`);
  const segs = [...(main?.segments || [])].sort((a, b) => a.target_timerange.start - b.target_timerange.start);
  const pieces = []; // labels of WxH video pieces in order (gaps filled black)
  const audioMix = []; // labels of audio streams already delayed to timeline position
  let cursor = 0;
  let idx = 0;
  const black = (dur) => { const lbl = `blk${idx++}`; filters.push(`color=c=black:s=${W}x${H}:r=${fps}:d=${dur.toFixed(3)}[${lbl}]`); return lbl; };
  for (const s of segs) {
    const start = sec(s.target_timerange.start), dur = sec(s.target_timerange.duration);
    if (start >= maxSec) break;
    if (start > cursor + 0.001) pieces.push(black(start - cursor));
    const [, m] = draft._findMaterial(s.material_id);
    if (!m || !m.path || !fs.existsSync(m.path)) { skipped.push(`missing media for segment ${s.id}`); pieces.push(black(dur)); cursor = start + dur; continue; }
    const speed = s.speed || 1;
    const srcStart = sec(s.source_timerange?.start || 0);
    const isPhoto = m.type === "photo";
    const i = isPhoto
      ? addInput(["-loop", "1", "-t", dur.toFixed(3), "-i", m.path])
      : addInput(["-ss", srcStart.toFixed(3), "-t", (dur * speed).toFixed(3), "-i", m.path]);
    const sc = s.clip?.scale?.x ?? 1, tx = s.clip?.transform?.x ?? 0, ty = s.clip?.transform?.y ?? 0, alpha = s.clip?.alpha ?? 1;
    // CapCut scale 1 = fit inside canvas; transform units = half canvas
    const lbl = `v${idx++}`;
    const chain = [
      `[${i}:v]`,
      speed !== 1 && !isPhoto ? `setpts=PTS/${speed},` : "",
      `scale=w='min(${W}/iw\\,${H}/ih)*iw*${sc}':h='min(${W}/iw\\,${H}/ih)*ih*${sc}':eval=init,format=rgba`,
      alpha < 1 ? `,colorchannelmixer=aa=${alpha}` : "",
      `,fps=${fps}[${lbl}c]`,
    ].join("");
    filters.push(chain);
    filters.push(`color=c=black:s=${W}x${H}:r=${fps}:d=${dur.toFixed(3)}[${lbl}b]`);
    filters.push(`[${lbl}b][${lbl}c]overlay=x='(W-w)/2+${(tx * W) / 2}':y='(H-h)/2-${(ty * H) / 2}':shortest=1:eof_action=pass,trim=duration=${dur.toFixed(3)},setpts=PTS-STARTPTS[${lbl}]`);
    pieces.push(lbl);
    const vol = s.volume ?? 1;
    if (!isPhoto && vol > 0 && probeHasAudio(m.path)) {
      const al = `a${idx++}`;
      filters.push(`[${i}:a]${speed !== 1 ? atempo(speed) + "," : ""}volume=${vol},atrim=duration=${dur.toFixed(3)},asetpts=PTS-STARTPTS,adelay=${Math.round(start * 1000)}|${Math.round(start * 1000)}[${al}]`);
      audioMix.push(al);
    }
    cursor = start + dur;
  }
  if (cursor < total) pieces.push(black(total - cursor));
  if (!pieces.length) pieces.push(black(total));
  filters.push(`${pieces.map((p) => `[${p}]`).join("")}concat=n=${pieces.length}:v=1:a=0,trim=duration=${total.toFixed(3)}[vbase]`);

  // ---- audio tracks ----
  for (const tr of draft.tracksOf("audio")) {
    for (const s of tr.segments || []) {
      const start = sec(s.target_timerange.start), dur = sec(s.target_timerange.duration);
      if (start >= maxSec) continue;
      const [, m] = draft._findMaterial(s.material_id);
      if (!m?.path || !fs.existsSync(m.path)) { skipped.push(`missing audio for segment ${s.id}`); continue; }
      const speed = s.speed || 1;
      const i = addInput(["-ss", sec(s.source_timerange?.start || 0).toFixed(3), "-t", (dur * speed).toFixed(3), "-i", m.path]);
      let fade = "";
      for (const id of s.extra_material_refs || []) { const [k, f] = draft._findMaterial(id); if (k === "audio_fades") { if (f.fade_in_duration) fade += `,afade=t=in:st=0:d=${sec(f.fade_in_duration)}`; if (f.fade_out_duration) fade += `,afade=t=out:st=${(dur - sec(f.fade_out_duration)).toFixed(3)}:d=${sec(f.fade_out_duration)}`; } }
      const al = `a${idx++}`;
      filters.push(`[${i}:a]${speed !== 1 ? atempo(speed) + "," : ""}volume=${s.volume ?? 1}${fade},atrim=duration=${dur.toFixed(3)},asetpts=PTS-STARTPTS,adelay=${Math.round(start * 1000)}|${Math.round(start * 1000)}[${al}]`);
      audioMix.push(al);
    }
  }

  // ---- text tracks -> ASS ----
  const assPath = outFile.replace(/\.[^.]+$/, "") + ".captions.ass";
  const ass = buildAss(draft, W, H);
  fs.writeFileSync(assPath, ass.text);
  const assFilter = ass.count ? `,subtitles='${assPath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'")}'` : "";
  filters.push(`[vbase]format=yuv420p${assFilter}[vout]`);
  let aout = null;
  if (audioMix.length) { aout = "aout"; filters.push(`${audioMix.map((a) => `[${a}]`).join("")}amix=inputs=${audioMix.length}:normalize=0:dropout_transition=0,atrim=duration=${total.toFixed(3)}[aout]`); }

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const graphFile = outFile.replace(/\.[^.]+$/, "") + ".filtergraph.txt";
  fs.writeFileSync(graphFile, filters.join(";\n"));
  const args = ["-y", "-hide_banner", "-loglevel", "error", ...inputs.flat(), "-filter_complex_script", graphFile, "-map", "[vout]"];
  if (aout) args.push("-map", "[aout]", "-c:a", "aac", "-b:a", "128k"); else args.push("-an");
  args.push("-r", String(fps), "-c:v", "libx264", "-preset", "veryfast", "-crf", String(crf), "-movflags", "+faststart", "-t", total.toFixed(3), outFile);
  const r = run(requireFfmpeg(), args);
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr.slice(-2000)}`);
  const bytes = fs.statSync(outFile).size;
  const timelineFile = outFile.replace(/\.[^.]+$/, "") + ".timeline.json";
  fs.writeFileSync(timelineFile, JSON.stringify({ ...draft.timeline(), preview: { file: path.basename(outFile), width: W, height: H, skipped } }, null, 2));
  return { out: outFile, timeline: timelineFile, captions: assPath, width: W, height: H, durationSec: +total.toFixed(3), bytes, skipped, textLines: ass.count,
    next: `Publish a phone-frame preview: node <plugin>/scripts/preview.mjs "${timelineFile}" > preview.html, then Artifact with files {"${path.basename(outFile)}": "${outFile}"}` };
}

function probeHasAudio(file) { try { return probe(file).hasAudio; } catch { return false; } }
function atempo(speed) { const parts = []; let s = speed; while (s > 2) { parts.push("atempo=2"); s /= 2; } while (s < 0.5) { parts.push("atempo=0.5"); s /= 0.5; } parts.push(`atempo=${s}`); return parts.join(","); }

function assTime(s) { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return `${h}:${String(m).padStart(2, "0")}:${(s % 60).toFixed(2).padStart(5, "0")}`; }
function assColor(rgb, alpha = 1) { const [r, g, b] = rgb.map((v) => Math.round(v * 255)); const a = Math.round((1 - alpha) * 255); return `&H${hex(a)}${hex(b)}${hex(g)}${hex(r)}`; }
const hex = (n) => n.toString(16).padStart(2, "0").toUpperCase();

export function buildAss(draft, W, H) {
  const lines = ["[Script Info]", "ScriptType: v4.00+", `PlayResX: ${W}`, `PlayResY: ${H}`, "WrapStyle: 0", "ScaledBorderAndShadow: yes", "",
    "[V4+ Styles]", "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,DejaVu Sans,40,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,1,5,20,20,20,1`, "",
    "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"];
  let count = 0;
  const textTracks = draft.tracksOf("text").sort((a, b) => draft.trackRenderIndex(a) - draft.trackRenderIndex(b));
  textTracks.forEach((tr, layer) => {
    for (const s of tr.segments || []) {
      const [, m] = draft._findMaterial(s.material_id);
      if (!m) continue;
      let text = "", size = 10, color = [1, 1, 1], alpha = 1, bold = true, stroke = null;
      try { const c = JSON.parse(m.content); text = c.text; const st = c.styles?.[0] || {}; size = st.size ?? size; color = st.fill?.content?.solid?.color ?? color; alpha = st.fill?.content?.solid?.alpha ?? 1; bold = st.bold ?? true; stroke = st.strokes?.[0] ?? null; } catch { continue; }
      // CapCut text size is relative to canvas height; ~size 10 reads as ~5% of height.
      const px = Math.round((size / 10) * H * 0.05);
      const sc = s.clip?.scale?.x ?? 1;
      const x = Math.round(W / 2 + ((s.clip?.transform?.x ?? 0) * W) / 2);
      const y = Math.round(H / 2 - ((s.clip?.transform?.y ?? 0) * H) / 2);
      const outline = stroke ? Math.max(1, Math.round(px * 0.08)) : 0;
      const oc = stroke ? assColor(stroke.content?.solid?.color ?? [0, 0, 0], stroke.content?.solid?.alpha ?? 1) : "&H00000000";
      const wrapW = Math.round(W * (m.line_max_width ?? 0.82));
      const esc = String(text).replace(/\\/g, "\\\\").replace(/\{/g, "(").replace(/\}/g, ")").replace(/\r?\n/g, "\\N");
      const tag = `{\\an5\\pos(${x},${y})\\fs${Math.round(px * sc)}\\b${bold ? 1 : 0}\\1c${assColor(color, alpha)}\\3c${oc}\\bord${outline}\\q2}`;
      lines.push(`Dialogue: ${layer},${assTime(sec(s.target_timerange.start))},${assTime(sec(s.target_timerange.start + s.target_timerange.duration))},Default,,0,0,0,,${tag}${wrap(esc, wrapW, px * sc)}`);
      count++;
    }
  });
  return { text: lines.join("\n") + "\n", count };
}
// crude word wrap so long captions don't run off the phone
function wrap(text, maxPx, px) {
  const maxChars = Math.max(8, Math.floor(maxPx / (px * 0.55)));
  const words = text.split(" "); const out = []; let line = "";
  for (const w of words) { if ((line + " " + w).trim().length > maxChars && line) { out.push(line); line = w; } else line = (line + " " + w).trim(); }
  if (line) out.push(line);
  return out.join("\\N");
}
