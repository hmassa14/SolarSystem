// ffmpeg / ffprobe helpers: binary discovery, probing, scene + silence detection, contact sheets.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function which(name) {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", [name], { encoding: "utf8" });
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim().split(/\r?\n/)[0] : null;
}
function fromPackage(pkg) {
  try { const p = require(pkg); return typeof p === "string" ? p : p?.path ?? null; } catch { return null; }
}
export const FFMPEG = process.env.FFMPEG_PATH || which("ffmpeg") || fromPackage("ffmpeg-static");
export const FFPROBE = process.env.FFPROBE_PATH || which("ffprobe") || fromPackage("ffprobe-static");

export function requireFfmpeg() {
  if (!FFMPEG) throw new Error("ffmpeg not found. Install ffmpeg, set FFMPEG_PATH, or run `npm install` inside the plugin's server/ folder (pulls ffmpeg-static).");
  return FFMPEG;
}
export function requireFfprobe() {
  if (!FFPROBE) throw new Error("ffprobe not found. Install ffmpeg (includes ffprobe), set FFPROBE_PATH, or run `npm install` inside the plugin's server/ folder.");
  return FFPROBE;
}

export function run(bin, args, { maxBuffer = 64 * 1024 * 1024 } = {}) {
  const r = spawnSync(bin, args, { encoding: "utf8", maxBuffer });
  if (r.error) throw r.error;
  return r;
}

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif", ".heic", ".tif", ".tiff"]);
const AUDIO_EXT = new Set([".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".aiff", ".wma"]);
export const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi", ".mts", ".m2ts", ".3gp"]);

export function kindOf(file) {
  const ext = path.extname(file).toLowerCase();
  if (IMAGE_EXT.has(ext)) return "image";
  if (AUDIO_EXT.has(ext)) return "audio";
  if (VIDEO_EXT.has(ext)) return "video";
  return "unknown";
}

/** Probe one media file: duration (s), width, height, fps, hasAudio, rotation, kind. */
export function probe(file) {
  if (!fs.existsSync(file)) throw new Error(`file not found: ${file}`);
  const kind = kindOf(file);
  const r = run(requireFfprobe(), ["-v", "error", "-show_entries", "stream=index,codec_type,width,height,r_frame_rate,duration,side_data_list:stream_tags=rotate:format=duration,size", "-of", "json", file]);
  if (r.status !== 0) throw new Error(`ffprobe failed for ${file}: ${r.stderr}`);
  const info = JSON.parse(r.stdout);
  const v = (info.streams ?? []).find((s) => s.codec_type === "video");
  const a = (info.streams ?? []).find((s) => s.codec_type === "audio");
  let rotation = 0;
  if (v?.tags?.rotate) rotation = Number(v.tags.rotate) || 0;
  for (const sd of v?.side_data_list ?? []) if (sd.rotation != null) rotation = Number(sd.rotation) || rotation;
  let width = v?.width ?? 0, height = v?.height ?? 0;
  if (Math.abs(rotation) % 180 === 90) [width, height] = [height, width];
  let fps = 0;
  if (v?.r_frame_rate) { const [n, d] = v.r_frame_rate.split("/").map(Number); fps = d ? +(n / d).toFixed(3) : n; }
  const duration = kind === "image" ? null : Number(info.format?.duration ?? v?.duration ?? a?.duration ?? 0) || 0;
  return {
    file, kind: kind === "unknown" ? (v ? "video" : a ? "audio" : "unknown") : kind,
    duration, width, height, fps, hasAudio: !!a, hasVideo: !!v, rotation,
    bytes: Number(info.format?.size ?? fs.statSync(file).size),
    orientation: width && height ? (height > width ? "portrait" : width > height ? "landscape" : "square") : null,
  };
}

/** Scene changes: timestamps (s) where the picture changes sharply. threshold 0..1 (0.3–0.5 typical). */
export function sceneChanges(file, { threshold = 0.4, max = 200 } = {}) {
  const r = run(requireFfmpeg(), ["-hide_banner", "-nostats", "-i", file, "-vf", `select='gt(scene,${threshold})',showinfo`, "-an", "-f", "null", "-"]);
  const times = [];
  for (const m of r.stderr.matchAll(/pts_time:\s*([\d.]+)/g)) { times.push(+(+m[1]).toFixed(3)); if (times.length >= max) break; }
  return times;
}

/** Silences: [{start,end,duration}] where audio stays below noiseDb for at least minSec seconds. */
export function silences(file, { noiseDb = -35, minSec = 0.6 } = {}) {
  const r = run(requireFfmpeg(), ["-hide_banner", "-nostats", "-i", file, "-af", `silencedetect=noise=${noiseDb}dB:d=${minSec}`, "-vn", "-f", "null", "-"]);
  const out = [];
  let start = null;
  for (const line of r.stderr.split(/\r?\n/)) {
    const s = line.match(/silence_start:\s*([\d.]+)/); if (s) start = +s[1];
    const e = line.match(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/);
    if (e && start != null) { out.push({ start: +start.toFixed(3), end: +(+e[1]).toFixed(3), duration: +(+e[2]).toFixed(3) }); start = null; }
  }
  return out;
}

/** Mean/peak loudness (dBFS) of a file or a window of it. */
export function loudness(file, { start = null, duration = null } = {}) {
  const args = ["-hide_banner", "-nostats"];
  if (start != null) args.push("-ss", String(start));
  if (duration != null) args.push("-t", String(duration));
  args.push("-i", file, "-af", "volumedetect", "-vn", "-f", "null", "-");
  const r = run(requireFfmpeg(), args);
  const mean = r.stderr.match(/mean_volume:\s*(-?[\d.]+)/), peak = r.stderr.match(/max_volume:\s*(-?[\d.]+)/);
  return { meanDb: mean ? +mean[1] : null, peakDb: peak ? +peak[1] : null };
}

/** Contact sheet: `count` evenly spaced frames tiled into one PNG so the model can look at the footage. */
export function contactSheet(file, outPng, { count = 6, columns = 3, tileWidth = 360 } = {}) {
  const p = probe(file);
  fs.mkdirSync(path.dirname(outPng), { recursive: true });
  const rows = Math.ceil(count / columns);
  if (p.kind === "image") {
    const r = run(requireFfmpeg(), ["-y", "-hide_banner", "-loglevel", "error", "-i", file, "-vf", `scale=${tileWidth}:-2`, "-frames:v", "1", outPng]);
    if (r.status !== 0) throw new Error(r.stderr);
    return { out: outPng, frames: [0], probe: p };
  }
  const dur = p.duration || 1;
  const times = Array.from({ length: count }, (_, i) => +((dur * (i + 0.5)) / count).toFixed(3));
  // select frames nearest each timestamp, then tile
  const sel = times.map((t) => `lt(prev_pts*TB,${t})*gte(pts*TB,${t})`).join("+");
  const vf = `select='${sel}',scale=${tileWidth}:-2,drawbox=0:0:iw:0:black,tile=${columns}x${rows}:padding=4:margin=4:color=#111111`;
  const r = run(requireFfmpeg(), ["-y", "-hide_banner", "-loglevel", "error", "-i", file, "-vf", vf, "-vsync", "vfr", "-frames:v", "1", outPng]);
  if (r.status !== 0 || !fs.existsSync(outPng)) {
    // fallback: fps-based sampling
    const r2 = run(requireFfmpeg(), ["-y", "-hide_banner", "-loglevel", "error", "-i", file, "-vf", `fps=${count}/${dur},scale=${tileWidth}:-2,tile=${columns}x${rows}:padding=4:margin=4:color=#111111`, "-frames:v", "1", outPng]);
    if (r2.status !== 0) throw new Error(r.stderr || r2.stderr);
  }
  return { out: outPng, frames: times, probe: p };
}

/** Single frame at a timestamp. */
export function frameAt(file, sec, outPng, { width = 540 } = {}) {
  fs.mkdirSync(path.dirname(outPng), { recursive: true });
  const r = run(requireFfmpeg(), ["-y", "-hide_banner", "-loglevel", "error", "-ss", String(sec), "-i", file, "-frames:v", "1", "-vf", `scale=${width}:-2`, outPng]);
  if (r.status !== 0) throw new Error(r.stderr);
  return outPng;
}

export function tmpDir(sub = "") {
  const d = path.join(process.env.CAPCUT_WORK_DIR || path.join(os.tmpdir(), "capcut-plugin"), sub);
  fs.mkdirSync(d, { recursive: true });
  return d;
}
