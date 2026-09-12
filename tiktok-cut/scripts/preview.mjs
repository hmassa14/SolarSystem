#!/usr/bin/env node
// Build a phone-frame preview page for a rendered short.
//   node preview.mjs edit.json [video-file-name] > preview.html
// The page references the video by the relative name given (default: basename of edit.output),
// so publish it with that file alongside: Artifact files {"cut.mp4": "out/cut.mp4"}.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const editPath = process.argv[2];
if (!editPath) {
  console.error("usage: node preview.mjs edit.json [video-file-name]");
  process.exit(1);
}
const edit = JSON.parse(fs.readFileSync(editPath, "utf8"));
const videoName = process.argv[3] ?? path.basename(edit.output ?? "cut.mp4");
const template = fs.readFileSync(path.join(here, "preview.template.html"), "utf8");
const data = {
  title: edit.title ?? "Untitled cut",
  video: videoName,
  size: edit.size ?? { w: 1080, h: 1920 },
  trim: edit.trim ?? {},
  speed: edit.speed ?? 1,
  source: edit.source,
  output: edit.output ?? "cut.mp4",
  hook: edit.hook ?? null,
  captions: edit.captions ?? [],
};
// Escape "</script" so the JSON can never close the script tag.
const json = JSON.stringify(data).replace(/<\//g, "<\\/");
process.stdout.write(template.replace("__EDIT_JSON__", json).replace(/__TITLE__/g, escapeHtml(data.title)));

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
