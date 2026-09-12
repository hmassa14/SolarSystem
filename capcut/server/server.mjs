#!/usr/bin/env node
// capcut MCP server: lets Claude create and edit real CapCut desktop drafts, analyze raw footage,
// and render a preview without opening CapCut. Times at the tool boundary are seconds.
import fs from "node:fs";
import path from "node:path";
import { McpServer, S } from "./mcp.mjs";
import { Draft, listDrafts, draftsDir, capcutRunning } from "./draft.mjs";
import { probe, sceneChanges, silences, loudness, contactSheet, frameAt, tmpDir, kindOf, VIDEO_EXT, FFMPEG, FFPROBE } from "./media.mjs";
import { renderDraft } from "./render.mjs";

const open = new Map(); // draft name -> Draft with unsaved edits
const get = (name) => { if (!open.has(name)) open.set(name, new Draft(name)); return open.get(name); };

const place = {
  atSec: S.num("start time on the timeline, seconds"),
  durSec: S.num("duration on the timeline, seconds (default: rest of the source)"),
  srcStartSec: S.num("in-point inside the source file, seconds (default 0)"),
  speed: S.num("playback speed, 1 = normal (default 1)"),
  volume: S.num("0..1 (default 1)"),
  track: S.str("track name or id; a track is created when omitted"),
  trackIndex: S.int("track index from capcut_read_draft"),
};
const transform = {
  scale: S.num("uniform scale, 1 = fit inside canvas"),
  posX: S.num("horizontal offset in half-canvas units: -1 left edge, 0 center, 1 right edge"),
  posY: S.num("vertical offset in half-canvas units: -1 bottom, 0 center, 1 top"),
  rotation: S.num("degrees clockwise"),
  opacity: S.num("0..1"),
};
const textStyle = {
  size: S.num("CapCut text size (default 10; 8 small caption, 14 big hook)"),
  color: S.str("#RRGGBB fill (default #FFFFFF)"),
  bold: S.bool("default true"),
  align: S.int("0 left, 1 center, 2 right (default 1)"),
  stroke: S.bool("black outline behind the text (default true)"),
  strokeColor: S.str("#RRGGBB outline color"),
  background: S.str("#RRGGBB box behind the text (omit for none)"),
  posX: S.num("horizontal offset in half-canvas units (default 0)"),
  posY: S.num("vertical offset in half-canvas units (default -0.45, above TikTok's bottom UI); hooks look right near 0.55"),
  scale: S.num("scale (default 1)"),
  track: S.str("text track name; created if missing"),
  trackIndex: S.int("track index"),
};

const s = new McpServer({ name: "capcut", version: "0.2.0" });

// ---------- discovery ----------
s.tool("capcut_status", "Where drafts live, whether CapCut is running, and whether ffmpeg/ffprobe were found. Call first.", S.obj({}), async () => ({
  draftsDir: draftsDir(), draftsDirExists: fs.existsSync(draftsDir()), capcutRunning: capcutRunning(), platform: process.platform,
  ffmpeg: FFMPEG || null, ffprobe: FFPROBE || null, workDir: tmpDir(), openSessions: [...open.keys()],
}));
s.tool("capcut_list_drafts", "List CapCut drafts (name, duration, canvas, last modified, locked).", S.obj({}), async () => listDrafts());
s.tool("capcut_read_draft", "Read a draft's canvas, tracks and segments (ids, times, sources). Reflects unsaved session edits.", S.obj({ draft: S.str("draft folder name") }, ["draft"]), async ({ draft }) => get(draft).timeline());
s.tool("capcut_create_draft", "Create a new empty draft in the CapCut drafts folder. Default canvas is 1080x1920 (TikTok).",
  S.obj({ name: S.str("folder/draft name, e.g. 'tiktok-2026-09-12-hook'"), width: S.int("canvas width (default 1080)"), height: S.int("canvas height (default 1920)"), fps: S.int("default 30") }, ["name"]),
  async ({ name, width, height, fps }) => { const d = Draft.create(name, { width, height, fps }); open.set(name, d); return { created: name, dir: d.dir, file: d.file, canvas: { width: d.width, height: d.height } }; });

// ---------- footage analysis ----------
s.tool("capcut_scan_folder", "Inventory a folder of raw clips: duration, orientation, resolution, audio, size. Use before deciding what to cut.",
  S.obj({ folder: S.str("absolute path"), recursive: S.bool("default false") }, ["folder"]),
  async ({ folder, recursive }) => {
    if (!fs.existsSync(folder)) throw new Error(`folder not found: ${folder}`);
    const files = [];
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (recursive) walk(p); } else if (kindOf(p) !== "unknown" && !e.name.startsWith(".")) files.push(p); } };
    walk(folder);
    files.sort();
    const out = [], errors = [];
    for (const f of files) { try { const p = probe(f); out.push({ file: f, kind: p.kind, durationSec: p.duration, width: p.width, height: p.height, orientation: p.orientation, fps: p.fps, hasAudio: p.hasAudio, mb: +(p.bytes / 1e6).toFixed(1) }); } catch (e) { errors.push({ file: f, error: e.message }); } }
    const totalSec = out.reduce((n, x) => n + (x.durationSec || 0), 0);
    return { folder, count: out.length, totalSec: +totalSec.toFixed(1), files: out, errors };
  });
s.tool("capcut_probe", "Details for one media file (duration, size, fps, audio, orientation).", S.obj({ file: S.str("absolute path") }, ["file"]), async ({ file }) => probe(file));
s.tool("capcut_contact_sheet", "Tile evenly spaced frames from a clip into one PNG so you can LOOK at the footage (then Read the PNG). Returns the image path and the timestamps of each tile.",
  S.obj({ file: S.str("absolute path"), count: S.int("frames (default 6)"), columns: S.int("default 3"), out: S.str("output png path (default: work dir)") }, ["file"]),
  async ({ file, count, columns, out }) => contactSheet(file, out || path.join(tmpDir("sheets"), path.basename(file) + ".sheet.png"), { count, columns }));
s.tool("capcut_frame", "Grab one frame at a timestamp as PNG (to check a specific moment).", S.obj({ file: S.str("absolute path"), sec: S.num("timestamp"), out: S.str("output png path") }, ["file", "sec"]),
  async ({ file, sec: t, out }) => ({ out: frameAt(file, t, out || path.join(tmpDir("frames"), `${path.basename(file)}.${t}.png`)) }));
s.tool("capcut_scene_changes", "Timestamps where the picture changes sharply (camera moves, cuts, new subject). Good candidate cut points.",
  S.obj({ file: S.str("absolute path"), threshold: S.num("0..1, default 0.4 (lower = more cuts)") }, ["file"]),
  async ({ file, threshold }) => ({ file, sceneChangesSec: sceneChanges(file, { threshold }) }));
s.tool("capcut_silences", "Find silent stretches (dead air, pauses) to cut around. Also returns speech windows = the gaps between silences.",
  S.obj({ file: S.str("absolute path"), noiseDb: S.num("silence threshold dBFS, default -35"), minSec: S.num("minimum silence length, default 0.6") }, ["file"]),
  async ({ file, noiseDb, minSec }) => {
    const p = probe(file); const sil = silences(file, { noiseDb, minSec });
    const speech = []; let t = 0;
    for (const sl of sil) { if (sl.start - t > 0.25) speech.push({ start: +t.toFixed(3), end: sl.start, duration: +(sl.start - t).toFixed(3) }); t = sl.end; }
    if (p.duration - t > 0.25) speech.push({ start: +t.toFixed(3), end: +p.duration.toFixed(3), duration: +(p.duration - t).toFixed(3) });
    return { file, durationSec: p.duration, silences: sil, speech };
  });
s.tool("capcut_loudness", "Mean/peak loudness (dBFS) of a file or a window. Use to find the energetic moment or to match levels.",
  S.obj({ file: S.str("absolute path"), startSec: S.num("window start"), durSec: S.num("window length") }, ["file"]),
  async ({ file, startSec, durSec }) => ({ file, ...loudness(file, { start: startSec, duration: durSec }) }));

// ---------- building the edit (session edits; capcut_save persists) ----------
s.tool("capcut_add_video", "Place a video clip on the timeline. fit:'cover' fills a 9:16 canvas with landscape footage (crops sides).",
  S.obj({ draft: S.str("draft name"), file: S.str("absolute path to the clip"), ...place, ...transform, fit: S.str("'cover' or 'contain' (default contain)"), mute: S.bool("drop the clip's own audio") }, ["draft", "file", "atSec"]),
  async (a) => get(a.draft).addVideo(a.file, a));
s.tool("capcut_add_image", "Place a still image (default 4s).", S.obj({ draft: S.str("draft name"), file: S.str("absolute path"), ...place, ...transform, fit: S.str("'cover' or 'contain'") }, ["draft", "file", "atSec"]),
  async (a) => get(a.draft).addImage(a.file, a));
s.tool("capcut_add_audio", "Place music or a voiceover on an audio track.", S.obj({ draft: S.str("draft name"), file: S.str("absolute path"), ...place, fadeInSec: S.num("fade in"), fadeOutSec: S.num("fade out") }, ["draft", "file", "atSec"]),
  async (a) => get(a.draft).addAudio(a.file, a));
s.tool("capcut_add_text", "Add one text overlay (hook, title, label).", S.obj({ draft: S.str("draft name"), text: S.str("the text"), atSec: S.num("start"), durSec: S.num("duration (default 3)"), ...textStyle }, ["draft", "text", "atSec"]),
  async (a) => get(a.draft).addText(a.text, a));
s.tool("capcut_add_captions", "Add many timed caption lines at once on one text track (default track 'captions'). Keep lines to 3 to 7 words.",
  S.obj({ draft: S.str("draft name"), captions: S.arr(S.obj({ start: S.num("seconds"), end: S.num("seconds"), text: S.str("line") }, ["start", "end", "text"]), "timed lines"), ...textStyle }, ["draft", "captions"]),
  async (a) => get(a.draft).addCaptions(a.captions, a));
s.tool("capcut_add_track", "Add a track (video | audio | text). Extra video tracks sit on top of earlier ones.", S.obj({ draft: S.str("draft name"), type: S.str("video | audio | text"), name: S.str("track name") }, ["draft", "type"]),
  async ({ draft, type, name }) => get(draft).addTrack(type, name));
s.tool("capcut_move_segment", "Move a segment to a new start time (and optionally another track of the same type).", S.obj({ draft: S.str("draft name"), segmentId: S.str("from capcut_read_draft"), atSec: S.num("new start"), track: S.str("track name"), trackIndex: S.int("track index") }, ["draft", "segmentId", "atSec"]),
  async ({ draft, segmentId, atSec, track, trackIndex }) => get(draft).moveSegment(segmentId, atSec, { track, trackIndex }));
s.tool("capcut_trim_segment", "Change a segment's start, duration or source in-point.", S.obj({ draft: S.str("draft name"), segmentId: S.str("segment id"), atSec: S.num("new start"), durSec: S.num("new duration"), srcStartSec: S.num("new in-point in the source") }, ["draft", "segmentId"]),
  async ({ draft, segmentId, atSec, durSec, srcStartSec }) => get(draft).trimSegment(segmentId, { atSec, durSec, srcStartSec }));
s.tool("capcut_split_segment", "Split a segment at a timeline time into two.", S.obj({ draft: S.str("draft name"), segmentId: S.str("segment id"), atSec: S.num("timeline time inside the segment") }, ["draft", "segmentId", "atSec"]),
  async ({ draft, segmentId, atSec }) => get(draft).splitSegment(segmentId, atSec));
s.tool("capcut_delete_segment", "Remove a segment.", S.obj({ draft: S.str("draft name"), segmentId: S.str("segment id") }, ["draft", "segmentId"]),
  async ({ draft, segmentId }) => get(draft).deleteSegment(segmentId));
s.tool("capcut_set_props", "Change scale, position, rotation, opacity, volume, speed or visibility of a segment.",
  S.obj({ draft: S.str("draft name"), segmentId: S.str("segment id"), ...transform, scaleX: S.num(""), scaleY: S.num(""), volume: S.num("0..1"), speed: S.num("playback speed"), visible: S.bool("") }, ["draft", "segmentId"]),
  async (a) => get(a.draft).setProps(a.segmentId, a));
s.tool("capcut_set_text", "Change the words, size or color of an existing text segment.", S.obj({ draft: S.str("draft name"), segmentId: S.str("segment id"), text: S.str("new text"), size: S.num(""), color: S.str("#RRGGBB") }, ["draft", "segmentId"]),
  async ({ draft, segmentId, text, size, color }) => get(draft).setText(segmentId, text, { size, color }));

// ---------- check, preview, persist ----------
s.tool("capcut_validate", "Check the in-session draft: overlaps, missing media, main-track gaps, length.", S.obj({ draft: S.str("draft name") }, ["draft"]), async ({ draft }) => get(draft).validate());
s.tool("capcut_preview", "Render the draft (unsaved edits included) to an mp4 with ffmpeg so it can be watched before opening CapCut. Effects/transitions are not rendered; text is approximated. Publish the result in a phone-frame artifact.",
  S.obj({ draft: S.str("draft name"), out: S.str("output mp4 path (default: work dir)"), width: S.int("preview width, default 720"), maxSec: S.num("cap length, default 180") }, ["draft"]),
  async ({ draft, out, width, maxSec }) => renderDraft(get(draft), out || path.join(tmpDir("previews"), `${draft}.mp4`), { width, maxSec }));
s.tool("capcut_save", "Write session edits to the draft on disk (backs up the previous file). Refuses while CapCut is running unless force:true.",
  S.obj({ draft: S.str("draft name"), force: S.bool("save even if CapCut appears to be running") }, ["draft"]),
  async ({ draft, force }) => { const r = get(draft).save({ force }); open.delete(draft); return r; });
s.tool("capcut_discard", "Drop unsaved session edits for a draft.", S.obj({ draft: S.str("draft name") }, ["draft"]), async ({ draft }) => { open.delete(draft); return { discarded: draft }; });
s.tool("capcut_delete_draft", "Delete a draft folder permanently. Only for drafts this session created by mistake.", S.obj({ draft: S.str("draft name"), confirm: S.bool("must be true") }, ["draft", "confirm"]),
  async ({ draft, confirm }) => { if (!confirm) throw new Error("pass confirm:true"); open.delete(draft); return new Draft(draft).deleteDraft(); });

s.listen();
process.stderr.write(`[capcut] ready. drafts: ${draftsDir()} ffmpeg: ${FFMPEG ? "ok" : "MISSING"}\n`);
