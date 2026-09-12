#!/usr/bin/env node
// Build the phone-frame preview page from a draft timeline written by capcut_preview.
//   node preview.mjs <name>.timeline.json > preview.html
// Publish with the Artifact tool, passing the mp4 as a supporting file under the name the page expects
// (timeline.preview.file, e.g. {"my-draft.mp4": "/path/to/my-draft.mp4"}).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const tlPath = process.argv[2];
if (!tlPath) { console.error("usage: node preview.mjs <draft>.timeline.json > preview.html"); process.exit(1); }
const tl = JSON.parse(fs.readFileSync(tlPath, "utf8"));
const template = fs.readFileSync(path.join(here, "preview.template.html"), "utf8");
const clips = [], lines = [];
for (const tr of tl.tracks) {
  for (const s of tr.segments) {
    if (tr.type === "text") lines.push({ start: s.atSec, end: s.endSec, text: s.label, kind: tr.name === "captions" ? "caption" : "hook" });
    else clips.push({ track: tr.name, type: tr.type, label: s.label, start: s.atSec, end: s.endSec, srcStart: s.srcStartSec, speed: s.speed, volume: s.volume, scale: s.scale });
  }
}
const data = {
  title: tl.name, video: tl.preview?.file ?? `${tl.name}.mp4`, durationSec: tl.durationSec, canvas: tl.canvas, fps: tl.fps,
  lines: lines.sort((a, b) => a.start - b.start), clips: clips.sort((a, b) => a.start - b.start), skipped: tl.preview?.skipped ?? [],
};
const json = JSON.stringify(data).replace(/<\//g, "<\\/");
process.stdout.write(template.replace("__EDIT_JSON__", json).replace(/__TITLE__/g, esc(data.title)));
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
