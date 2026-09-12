// Self-contained smoke test: synthesizes clips with ffmpeg, builds a draft, saves, reloads, renders a preview,
// then drives the real MCP server over stdio. Run: node test/run.mjs   (uses a temp drafts folder)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(HERE, "..");
const work = fs.mkdtempSync(path.join(os.tmpdir(), "capcut-test-"));
process.env.CAPCUT_DRAFTS_DIR = path.join(work, "drafts");
process.env.CAPCUT_WORK_DIR = path.join(work, "work");
fs.mkdirSync(process.env.CAPCUT_DRAFTS_DIR, { recursive: true });

const { requireFfmpeg, run, probe, silences, sceneChanges, contactSheet } = await import(path.join(SERVER, "media.mjs"));
const { Draft, listDrafts } = await import(path.join(SERVER, "draft.mjs"));
const { renderDraft } = await import(path.join(SERVER, "render.mjs"));
const ff = requireFfmpeg();
const raw = path.join(work, "raw"); fs.mkdirSync(raw);
const mk = (args) => { const r = run(ff, ["-y", "-hide_banner", "-loglevel", "error", ...args]); if (r.status !== 0) throw new Error(r.stderr); };
// portrait talking-head stand-in with speech-like bursts and pauses
mk(["-f", "lavfi", "-i", "testsrc2=s=720x1280:d=10:r=30", "-f", "lavfi", "-i", "sine=f=220:d=10,volume='if(lt(mod(t,4),2.5),1,0)':eval=frame", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(raw, "a-portrait.mp4")]);
// landscape b-roll with a hard scene change at 3s
mk(["-f", "lavfi", "-i", "color=c=#1b2a49:s=1280x720:d=3:r=30", "-f", "lavfi", "-i", "color=c=#f2b441:s=1280x720:d=3:r=30", "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0,format=yuv420p[v]", "-map", "[v]", "-c:v", "libx264", "-preset", "veryfast", path.join(raw, "b-landscape.mp4")]);
mk(["-f", "lavfi", "-i", "sine=f=110:d=15,tremolo=f=3:d=0.5,volume=0.3", "-c:a", "libmp3lame", path.join(raw, "music.mp3")]);
mk(["-f", "lavfi", "-i", "color=c=#7a2e5c:s=1080x1080:d=1", "-frames:v", "1", path.join(raw, "still.png")]);

let n = 0; const ok = (name) => { n++; console.log(`  ok ${n}. ${name}`); };
console.log("media analysis");
const pa = probe(path.join(raw, "a-portrait.mp4")); assert.equal(pa.orientation, "portrait"); assert.equal(pa.hasAudio, true); assert.ok(Math.abs(pa.duration - 10) < 0.2); ok("probe portrait clip");
const sil = silences(path.join(raw, "a-portrait.mp4"), { noiseDb: -30, minSec: 0.5 }); assert.ok(sil.length >= 2, `expected pauses, got ${JSON.stringify(sil)}`); ok(`silences found (${sil.length})`);
const sc = sceneChanges(path.join(raw, "b-landscape.mp4"), { threshold: 0.3 }); assert.ok(sc.some((t) => Math.abs(t - 3) < 0.2), `expected a cut near 3s, got ${sc}`); ok("scene change detected at 3s");
const sheet = contactSheet(path.join(raw, "a-portrait.mp4"), path.join(work, "sheet.png"), { count: 6 }); assert.ok(fs.existsSync(sheet.out)); ok("contact sheet written");

console.log("draft build");
const d = Draft.create("test-short", {});
assert.equal(d.width, 1080); assert.equal(d.height, 1920); ok("draft created 1080x1920");
const v1 = d.addVideo(path.join(raw, "a-portrait.mp4"), { atSec: 0, srcStartSec: 1, durSec: 4 });
const v2 = d.addVideo(path.join(raw, "b-landscape.mp4"), { atSec: 4, srcStartSec: 2.5, durSec: 2, fit: "cover", mute: true });
const v3 = d.addImage(path.join(raw, "still.png"), { atSec: 6, durSec: 1.5, fit: "cover" });
assert.ok(v2.source.scale > 1.5, "landscape cover scale should enlarge"); ok("video, cover b-roll, still placed");
assert.throws(() => d.addVideo(path.join(raw, "a-portrait.mp4"), { atSec: 3, durSec: 2 }), /overlaps/); ok("overlap rejected");
assert.throws(() => d.addVideo(path.join(raw, "a-portrait.mp4"), { atSec: 20, srcStartSec: 9, durSec: 5 }), /runs past the end/); ok("out-of-range trim rejected");
d.addAudio(path.join(raw, "music.mp3"), { atSec: 0, durSec: 7.5, volume: 0.4, fadeOutSec: 1 });
const hook = d.addText("I let Claude cut this", { atSec: 0, durSec: 2.5, size: 14, color: "#F2B441", posY: 0.55 });
const caps = d.addCaptions([{ start: 0.2, end: 1.8, text: "first line of the story" }, { start: 1.8, end: 3.5, text: "second line lands here" }, { start: 4, end: 6, text: "b-roll with a cover crop" }]);
assert.equal(caps.added, 3); ok("hook + 3 captions on separate text tracks");
const split = d.splitSegment(v1.segmentId, 2); ok("split main clip at 2s");
d.trimSegment(split.right, { durSec: 1.5 }); // shorten right half
const tl = d.timeline();
assert.equal(tl.tracks.filter((t) => t.type === "text").length, 2); ok("timeline reads back");
const val = d.validate();
assert.ok(val.ok, JSON.stringify(val));
assert.ok(val.warnings.some((w) => /gap/.test(w)), "trim should create a main-track gap warning"); ok("validate flags the gap");
const gapSeg = split.right; d.moveSegment(v2.segmentId, 3.5); d.moveSegment(v3.segmentId, 5.5); // close it
const saved = d.save({ force: true }); ok(`saved -> ${path.basename(saved.files[0])}`);
const again = new Draft("test-short"); const tl2 = again.timeline();
assert.equal(tl2.tracks.length, tl.tracks.length); assert.equal(tl2.durationSec, 7.5); ok("reloads from disk with same tracks");
const raw2 = JSON.parse(fs.readFileSync(again.file, "utf8"));
assert.equal(raw2.materials.videos.length, 3); assert.equal(raw2.materials.texts.length, 4); assert.equal(raw2.materials.audios.length, 1);
for (const tr of raw2.tracks) for (const sg of tr.segments) { assert.ok(sg.material_id && sg.target_timerange && Array.isArray(sg.extra_material_refs)); assert.ok(raw2.materials.speeds.some((m) => sg.extra_material_refs.includes(m.id)), "every segment refs a speed material"); }
const meta = JSON.parse(fs.readFileSync(again.metaFile, "utf8")); assert.equal(meta.draft_name, "test-short"); assert.equal(meta.tm_duration, raw2.duration); ok("draft json + meta are structurally consistent");
assert.ok(listDrafts().drafts.some((x) => x.name === "test-short")); ok("listed in drafts folder");

console.log("preview render");
const prev = renderDraft(again, path.join(work, "preview.mp4"), { width: 540 });
assert.ok(fs.existsSync(prev.out) && prev.bytes > 20000, JSON.stringify(prev)); assert.equal(prev.textLines, 4);
const pp = probe(prev.out); assert.equal(pp.width, 540); assert.equal(pp.height, 960); assert.ok(Math.abs(pp.duration - 7.5) < 0.3, `preview duration ${pp.duration}`); assert.equal(pp.hasAudio, true); ok(`preview mp4 ${pp.width}x${pp.height} ${pp.duration}s`);

console.log("mcp over stdio");
const child = spawn(process.execPath, [path.join(SERVER, "server.mjs")], { env: process.env, stdio: ["pipe", "pipe", "pipe"] });
let buf = ""; const pending = new Map(); let nextId = 1;
child.stdout.on("data", (chunk) => { buf += chunk; let i; while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue; const msg = JSON.parse(line); pending.get(msg.id)?.(msg); pending.delete(msg.id); } });
const call = (method, params) => new Promise((res) => { const id = nextId++; pending.set(id, res); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
const init = await call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
assert.equal(init.result.serverInfo.name, "capcut"); ok("initialize");
child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
const list = await call("tools/list", {}); assert.ok(list.result.tools.length >= 20); assert.ok(list.result.tools.every((t) => t.inputSchema.type === "object")); ok(`tools/list (${list.result.tools.length} tools)`);
const st = await call("tools/call", { name: "capcut_status", arguments: {} }); assert.equal(st.result.isError, false); assert.ok(JSON.parse(st.result.content[0].text).ffmpeg); ok("capcut_status");
const rd = await call("tools/call", { name: "capcut_read_draft", arguments: { draft: "test-short" } }); assert.equal(JSON.parse(rd.result.content[0].text).durationSec, 7.5); ok("capcut_read_draft");
const bad = await call("tools/call", { name: "capcut_read_draft", arguments: { draft: "nope" } }); assert.equal(bad.result.isError, true); ok("errors are reported, not thrown");
const scan = await call("tools/call", { name: "capcut_scan_folder", arguments: { folder: raw } }); assert.equal(JSON.parse(scan.result.content[0].text).count, 4); ok("capcut_scan_folder");
child.kill();
console.log(`\nall ${n} checks passed. work dir: ${work}`);
