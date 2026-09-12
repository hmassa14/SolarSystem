// CapCut desktop draft model: create drafts from a blank skeleton, load existing ones,
// add/edit tracks and segments, validate, and save safely.
// Times at this API boundary are SECONDS; CapCut stores microseconds.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { probe, kindOf } from "./media.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.join(HERE, "templates", "capcut");
export const US = 1e6;
const us = (sec) => Math.round(sec * US);
const sec = (u) => +(u / US).toFixed(3);
export const uid = () => crypto.randomUUID().toUpperCase();
const clone = (o) => JSON.parse(JSON.stringify(o));

// ---- where CapCut keeps drafts ----
const STD_WIN = path.join(os.homedir(), "AppData", "Local", "CapCut", "User Data", "Projects", "com.lveditor.draft");
const STD_MAC = path.join(os.homedir(), "Movies", "CapCut", "User Data", "Projects", "com.lveditor.draft");
export function draftsDir() {
  const c = [process.env.CAPCUT_DRAFTS_DIR, STD_WIN, STD_MAC].filter(Boolean);
  for (const d of c) { try { if (fs.statSync(d).isDirectory()) return d; } catch {} }
  return process.env.CAPCUT_DRAFTS_DIR || (process.platform === "win32" ? STD_WIN : STD_MAC);
}
// Windows CapCut names the timeline file draft_content.json; macOS names it draft_info.json.
function timelineFileFor(dir) {
  if (process.env.CAPCUT_DRAFT_FILE) return path.join(dir, process.env.CAPCUT_DRAFT_FILE);
  for (const n of ["draft_content.json", "draft_info.json"]) if (fs.existsSync(path.join(dir, n))) return path.join(dir, n);
  // new draft: look at sibling drafts to match this install, else platform default
  try {
    for (const sib of fs.readdirSync(path.dirname(dir))) {
      for (const n of ["draft_content.json", "draft_info.json"]) if (fs.existsSync(path.join(path.dirname(dir), sib, n))) return path.join(dir, n);
    }
  } catch {}
  return path.join(dir, process.platform === "win32" ? "draft_content.json" : "draft_info.json");
}

export function capcutRunning() {
  try {
    if (process.platform === "win32") return /CapCut\.exe/i.test(spawnSync("tasklist", ["/FI", "IMAGENAME eq CapCut.exe", "/NH"], { encoding: "utf8" }).stdout);
    if (process.platform === "darwin") return spawnSync("pgrep", ["-x", "CapCut"], { encoding: "utf8" }).status === 0;
  } catch {}
  return false;
}

export function listDrafts() {
  const root = draftsDir();
  let names = [];
  try { names = fs.readdirSync(root); } catch { return { draftsDir: root, drafts: [], note: "drafts folder not found; set CAPCUT_DRAFTS_DIR" }; }
  const drafts = [];
  for (const name of names) {
    const dir = path.join(root, name);
    let tl;
    try { if (!fs.statSync(dir).isDirectory()) continue; tl = timelineFileFor(dir); if (!fs.existsSync(tl)) continue; } catch { continue; }
    let durationSec = null, canvas = null, modified = null;
    try { const c = JSON.parse(fs.readFileSync(tl, "utf8")); durationSec = sec(c.duration || 0); canvas = c.canvas_config && `${c.canvas_config.width}x${c.canvas_config.height}`; modified = fs.statSync(tl).mtime.toISOString(); } catch {}
    drafts.push({ name, durationSec, canvas, modified, locked: fs.existsSync(path.join(dir, ".locked")) });
  }
  drafts.sort((a, b) => (b.modified || "").localeCompare(a.modified || ""));
  return { draftsDir: root, drafts };
}

const TRACK_BASE_RENDER = { video: 0, audio: 0, text: 15000, sticker: 14000, effect: 10000, filter: 11000 };

export class Draft {
  static create(name, { width = 1080, height = 1920, fps = 30 } = {}) {
    if (!name || /[\\/:*?"<>|]/.test(name)) throw new Error("draft name must be a plain folder name");
    const root = draftsDir();
    const dir = path.join(root, name);
    if (fs.existsSync(dir)) throw new Error(`draft already exists: ${dir}`);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of fs.readdirSync(TEMPLATE_DIR)) {
      if (f === "draft_info.json" || f === "draft_meta_info.json") continue;
      fs.cpSync(path.join(TEMPLATE_DIR, f), path.join(dir, f), { recursive: true });
    }
    const now = Date.now();
    const content = JSON.parse(fs.readFileSync(path.join(TEMPLATE_DIR, "draft_info.json"), "utf8"));
    content.id = uid(); content.name = name; content.fps = fps; content.duration = 0;
    content.canvas_config = { background: null, height, ratio: "original", width };
    content.create_time = Math.floor(now / 1000); content.update_time = Math.floor(now / 1000);
    content.tracks = [];
    const meta = JSON.parse(fs.readFileSync(path.join(TEMPLATE_DIR, "draft_meta_info.json"), "utf8"));
    meta.draft_id = content.id; meta.draft_name = name; meta.draft_fold_path = dir; meta.draft_root_path = root;
    meta.tm_draft_create = now * 1000; meta.tm_draft_modified = now * 1000; meta.tm_duration = 0; meta.draft_cover = "";
    const tl = timelineFileFor(dir);
    fs.writeFileSync(tl, JSON.stringify(content));
    fs.writeFileSync(path.join(dir, "draft_meta_info.json"), JSON.stringify(meta));
    return new Draft(name);
  }

  constructor(name) {
    this.name = name;
    this.dir = path.join(draftsDir(), name);
    this.file = timelineFileFor(this.dir);
    if (!fs.existsSync(this.file)) throw new Error(`draft not found: ${name} (looked in ${this.dir})`);
    this.content = JSON.parse(fs.readFileSync(this.file, "utf8"));
    this.metaFile = path.join(this.dir, "draft_meta_info.json");
    this.meta = fs.existsSync(this.metaFile) ? JSON.parse(fs.readFileSync(this.metaFile, "utf8")) : null;
    this.content.materials = this.content.materials || {};
    this.content.tracks = this.content.tracks || [];
  }
  get width() { return this.content.canvas_config?.width || 1080; }
  get height() { return this.content.canvas_config?.height || 1920; }
  _mats(key) { return (this.content.materials[key] = this.content.materials[key] || []); }
  _findMaterial(id) {
    for (const k of Object.keys(this.content.materials)) {
      const arr = this.content.materials[k];
      if (Array.isArray(arr)) { const m = arr.find((x) => x && x.id === id); if (m) return [k, m]; }
    }
    return [null, null];
  }

  // ---------- tracks ----------
  tracksOf(type) { return this.content.tracks.filter((t) => t.type === type); }
  trackRenderIndex(track) {
    const fromSegs = (track.segments || []).map((s) => s.render_index).filter((x) => x != null);
    if (fromSegs.length) return Math.max(...fromSegs);
    const same = this.tracksOf(track.type);
    return (TRACK_BASE_RENDER[track.type] ?? 0) + same.indexOf(track);
  }
  addTrack(type = "video", name) {
    const same = this.tracksOf(type);
    const track = { attribute: 0, flag: 0, id: uid(), is_default_name: !name, name: name || (same.length ? `${type} ${same.length + 1}` : type), segments: [], type };
    this.content.tracks.push(track);
    this._sortTracks();
    return { trackIndex: this.content.tracks.indexOf(track), trackId: track.id, name: track.name, type };
  }
  _sortTracks() { this.content.tracks.sort((a, b) => this.trackRenderIndex(a) - this.trackRenderIndex(b)); }
  _resolveTrack({ track, trackIndex } = {}, type) {
    if (trackIndex != null) { const t = this.content.tracks[trackIndex]; if (!t) throw new Error(`no track at index ${trackIndex}`); return t; }
    if (track) { const t = this.content.tracks.find((x) => x.name === track || x.id === track); if (!t) throw new Error(`no track named ${track}`); return t; }
    const same = this.tracksOf(type);
    if (same.length) return same[0];
    this.addTrack(type);
    return this.tracksOf(type)[0];
  }
  _place(trackObj, seg) {
    const a = seg.target_timerange.start, b = a + seg.target_timerange.duration;
    for (const s of trackObj.segments) {
      const x = s.target_timerange.start, y = x + s.target_timerange.duration;
      if (a < y && x < b) throw new Error(`segment overlaps existing segment ${s.id} on track "${trackObj.name}" (${sec(x)}s to ${sec(y)}s). Use another track or a different time.`);
    }
    seg.render_index = this.trackRenderIndex(trackObj);
    trackObj.segments.push(seg);
    trackObj.segments.sort((p, q) => p.target_timerange.start - q.target_timerange.start);
    this._recalcDuration();
  }

  _placeOrRollback(trackObj, seg) {
    try { this._place(trackObj, seg); }
    catch (e) {
      for (const id of [seg.material_id, ...(seg.extra_material_refs || [])]) { const [k] = this._findMaterial(id); if (k) this.content.materials[k] = this.content.materials[k].filter((m) => m.id !== id); }
      throw e;
    }
  }

  // ---------- segment JSON ----------
  _speed(speed) { const m = { curve_speed: null, id: uid(), mode: 0, speed, type: "speed" }; this._mats("speeds").push(m); return m.id; }
  _baseSegment(materialId, atUs, durUs) {
    return {
      enable_adjust: true, enable_color_correct_adjust: false, enable_color_curves: true, enable_color_match_adjust: false,
      enable_color_wheels: true, enable_lut: true, enable_smart_color_adjust: false, last_nonzero_volume: 1.0, reverse: false,
      track_attribute: 0, track_render_index: 0, visible: true,
      id: uid(), material_id: materialId, target_timerange: { start: atUs, duration: durUs },
      common_keyframes: [], keyframe_refs: [],
    };
  }
  _clip(p = {}) {
    return { alpha: p.opacity ?? 1.0, flip: { horizontal: false, vertical: false }, rotation: p.rotation ?? 0.0,
      scale: { x: p.scaleX ?? p.scale ?? 1.0, y: p.scaleY ?? p.scale ?? 1.0 }, transform: { x: p.posX ?? 0.0, y: p.posY ?? 0.0 } };
  }

  // ---------- add media ----------
  addVideo(file, o = {}) { return this._addVisualMedia(file, o); }
  addImage(file, o = {}) { return this._addVisualMedia(file, { ...o, image: true }); }
  _addVisualMedia(file, o) {
    file = path.resolve(file);
    const info = probe(file);
    const isPhoto = o.image || info.kind === "image";
    const speed = o.speed ?? 1;
    const srcStart = us(o.srcStartSec ?? 0);
    let dur;
    if (o.durSec != null) dur = us(o.durSec);
    else if (isPhoto) dur = us(4);
    else dur = Math.max(0, Math.round((us(info.duration) - srcStart) / speed));
    if (dur <= 0) throw new Error(`nothing to place: source in-point ${o.srcStartSec}s is past the end of ${path.basename(file)} (${info.duration}s)`);
    if (!isPhoto && srcStart + dur * speed > us(info.duration) + 1000) throw new Error(`clip runs past the end of ${path.basename(file)}: in ${o.srcStartSec ?? 0}s + ${sec(dur * speed)}s > ${info.duration}s`);
    const mat = {
      audio_fade: null, category_id: "", category_name: "local", check_flag: 63487,
      crop: { upper_left_x: 0, upper_left_y: 0, upper_right_x: 1, upper_right_y: 0, lower_left_x: 0, lower_left_y: 1, lower_right_x: 1, lower_right_y: 1 },
      crop_ratio: "free", crop_scale: 1.0, duration: isPhoto ? 10800 * US : us(info.duration), height: info.height || 1080,
      id: uid(), local_material_id: "", material_id: "", material_name: path.basename(file), media_path: "",
      path: file.replace(/\\/g, "/"), remote_url: null, type: isPhoto ? "photo" : "video", width: info.width || 1920,
    };
    mat.material_id = mat.id;
    this._mats("videos").push(mat);
    // fit: "cover" fills the 9:16 canvas (crops sides of landscape footage); "contain" (CapCut default) letterboxes.
    let scale = o.scale ?? 1;
    if (o.fit === "cover" && info.width && info.height) {
      const contain = Math.min(this.width / info.width, this.height / info.height);
      const cover = Math.max(this.width / info.width, this.height / info.height);
      scale = +(cover / contain).toFixed(4) * (o.scale ?? 1);
    }
    const seg = this._baseSegment(mat.id, us(o.atSec ?? 0), dur);
    Object.assign(seg, {
      source_timerange: { start: srcStart, duration: Math.round(dur * speed) }, speed, volume: o.volume ?? 1.0,
      extra_material_refs: [this._speed(speed)], clip: this._clip({ ...o, scale }), uniform_scale: { on: true, value: 1.0 },
      hdr_settings: { intensity: 1.0, mode: 1, nits: 1000 },
    });
    if (o.mute) seg.volume = 0;
    const track = this._resolveTrack(o, "video");
    this._placeOrRollback(track, seg);
    return { segmentId: seg.id, track: track.name, atSec: sec(seg.target_timerange.start), durSec: sec(dur), endSec: sec(seg.target_timerange.start + dur), source: { file, kind: mat.type, width: info.width, height: info.height, scale } };
  }
  addAudio(file, o = {}) {
    file = path.resolve(file);
    const info = probe(file);
    if (!info.hasAudio) throw new Error(`${path.basename(file)} has no audio stream`);
    const speed = o.speed ?? 1;
    const srcStart = us(o.srcStartSec ?? 0);
    const dur = o.durSec != null ? us(o.durSec) : Math.max(0, Math.round((us(info.duration) - srcStart) / speed));
    if (dur <= 0) throw new Error("audio in-point is past the end of the file");
    const mat = {
      app_id: 0, category_id: "", category_name: "local", check_flag: 1, copyright_limit_type: "none", duration: us(info.duration),
      effect_id: "", formula_id: "", id: uid(), intensifies_path: "", is_ai_clone_tone: false, is_text_edit_overdub: false, is_ugc: false,
      local_material_id: "", music_id: "", name: path.basename(file), path: file.replace(/\\/g, "/"), remote_url: null, query: "", request_id: "",
      resource_id: "", search_id: "", source_from: "", source_platform: 0, team_id: "", text_id: "", tone_category_id: "", tone_category_name: "",
      tone_effect_id: "", tone_effect_name: "", tone_platform: "", tone_second_category_id: "", tone_second_category_name: "", tone_speaker: "",
      tone_type: "", type: "extract_music", video_id: "", wave_points: [],
    };
    mat.local_material_id = mat.id; mat.music_id = mat.id;
    this._mats("audios").push(mat);
    const seg = this._baseSegment(mat.id, us(o.atSec ?? 0), dur);
    Object.assign(seg, { source_timerange: { start: srcStart, duration: Math.round(dur * speed) }, speed, volume: o.volume ?? 1.0, extra_material_refs: [this._speed(speed)], clip: null, hdr_settings: null });
    if (o.fadeInSec || o.fadeOutSec) {
      const fade = { id: uid(), fade_in_duration: us(o.fadeInSec ?? 0), fade_out_duration: us(o.fadeOutSec ?? 0), fade_type: 0, type: "audio_fade" };
      this._mats("audio_fades").push(fade); seg.extra_material_refs.push(fade.id);
    }
    const track = this._resolveTrack(o, "audio");
    this._placeOrRollback(track, seg);
    return { segmentId: seg.id, track: track.name, atSec: sec(seg.target_timerange.start), durSec: sec(dur), endSec: sec(seg.target_timerange.start + dur) };
  }

  // ---------- text ----------
  addText(text, o = {}) {
    if (!text) throw new Error("text is required");
    const size = o.size ?? 10;
    const color = hexToRgb(o.color ?? "#FFFFFF");
    const style = {
      fill: { alpha: 1.0, content: { render_type: "solid", solid: { alpha: o.alpha ?? 1.0, color } } },
      range: [0, text.length], size, bold: o.bold ?? true, italic: !!o.italic, underline: false,
      strokes: o.stroke === false ? [] : [{ content: { solid: { alpha: 1.0, color: hexToRgb(o.strokeColor ?? "#000000") } }, width: (o.strokeWidth ?? 40) / 100 * 0.2 }],
    };
    if (o.font) style.font = { id: "", path: o.font };
    const contentJson = { styles: [style], text };
    let checkFlag = 7; if (style.strokes.length) checkFlag |= 8; if (o.background) checkFlag |= 16;
    const mat = {
      id: uid(), content: JSON.stringify(contentJson), typesetting: 0, alignment: o.align ?? 1,
      letter_spacing: (o.letterSpacing ?? 0) * 0.05, line_spacing: 0.02 + (o.lineSpacing ?? 0) * 0.05,
      line_feed: 1, line_max_width: o.maxWidth ?? 0.82, force_apply_line_max_width: false, check_flag: checkFlag, type: "text",
      fixed_width: -1, fixed_height: -1,
    };
    if (o.background) Object.assign(mat, {
      background_style: 0, background_color: o.background, background_alpha: o.backgroundAlpha ?? 1.0, background_round_radius: o.backgroundRadius ?? 0.2,
      background_height: 0.14, background_width: 0.14, background_horizontal_offset: 0, background_vertical_offset: 0,
    });
    this._mats("texts").push(mat);
    const dur = us(o.durSec ?? 3);
    const seg = this._baseSegment(mat.id, us(o.atSec ?? 0), dur);
    Object.assign(seg, { source_timerange: null, speed: 1.0, volume: 1.0, extra_material_refs: [this._speed(1.0)], clip: this._clip({ ...o, scale: o.scale ?? 1 }), uniform_scale: { on: true, value: 1.0 } });
    if (o.posY == null) seg.clip.transform.y = -0.45; // above TikTok's bottom UI by default
    const track = this._resolveTrack(o, "text");
    this._placeOrRollback(track, seg);
    return { segmentId: seg.id, track: track.name, atSec: sec(seg.target_timerange.start), durSec: sec(dur), text };
  }
  addCaptions(captions, o = {}) {
    if (!Array.isArray(captions) || !captions.length) throw new Error("captions must be a non-empty array of {start,end,text}");
    let trackName;
    if (o.trackIndex != null) { const t = this.content.tracks[o.trackIndex]; if (!t || t.type !== "text") throw new Error(`track ${o.trackIndex} is not a text track`); trackName = t.name; }
    else {
      const name = o.track ?? "captions";
      let t = this.content.tracks.find((x) => x.type === "text" && (x.name === name || x.id === name));
      if (!t) { this.addTrack("text", name); t = this.content.tracks.find((x) => x.type === "text" && x.name === name); }
      trackName = t.name;
    }
    const out = [];
    for (const c of captions) {
      if (c.end <= c.start) throw new Error(`caption "${c.text}" ends before it starts`);
      out.push(this.addText(c.text, { ...o, trackIndex: undefined, track: trackName, atSec: c.start, durSec: +(c.end - c.start).toFixed(3) }));
    }
    return { added: out.length, track: trackName, first: out[0], last: out[out.length - 1] };
  }

  // ---------- edit ----------
  _find(segId) { for (const tr of this.content.tracks) { const s = (tr.segments || []).find((x) => x.id === segId); if (s) return { tr, s }; } throw new Error(`segment not found: ${segId}`); }
  moveSegment(segId, atSec, { track, trackIndex } = {}) {
    const { tr, s } = this._find(segId);
    tr.segments = tr.segments.filter((x) => x.id !== segId);
    s.target_timerange.start = us(atSec);
    const dest = track != null || trackIndex != null ? this._resolveTrack({ track, trackIndex }, tr.type) : tr;
    if (dest.type !== tr.type) { tr.segments.push(s); throw new Error(`cannot move a ${tr.type} segment onto a ${dest.type} track`); }
    try { this._place(dest, s); } catch (e) { tr.segments.push(s); throw e; }
    return { segmentId: segId, track: dest.name, atSec: sec(s.target_timerange.start), durSec: sec(s.target_timerange.duration) };
  }
  trimSegment(segId, { atSec, durSec, srcStartSec } = {}) {
    const { tr, s } = this._find(segId);
    tr.segments = tr.segments.filter((x) => x.id !== segId);
    const before = clone(s);
    if (atSec != null) s.target_timerange.start = us(atSec);
    if (durSec != null) { s.target_timerange.duration = us(durSec); if (s.source_timerange) s.source_timerange.duration = Math.round(us(durSec) * (s.speed || 1)); }
    if (srcStartSec != null && s.source_timerange) s.source_timerange.start = us(srcStartSec);
    try { this._place(tr, s); } catch (e) { Object.assign(s, before); tr.segments.push(s); throw e; }
    return { segmentId: segId, atSec: sec(s.target_timerange.start), durSec: sec(s.target_timerange.duration), srcStartSec: s.source_timerange ? sec(s.source_timerange.start) : null };
  }
  splitSegment(segId, atSec) {
    const { tr, s } = this._find(segId);
    const at = us(atSec), t0 = s.target_timerange.start, d = s.target_timerange.duration;
    if (at <= t0 || at >= t0 + d) throw new Error(`split point ${atSec}s is outside the segment (${sec(t0)}s to ${sec(t0 + d)}s)`);
    const left = at - t0;
    const right = clone(s); right.id = uid();
    right.extra_material_refs = (s.extra_material_refs || []).map((id) => { const [k, m] = this._findMaterial(id); if (!m) return id; const c = clone(m); c.id = uid(); this._mats(k).push(c); return c.id; });
    s.target_timerange.duration = left;
    right.target_timerange = { start: at, duration: d - left };
    if (s.source_timerange) {
      const sp = s.speed || 1;
      s.source_timerange.duration = Math.round(left * sp);
      right.source_timerange = { start: s.source_timerange.start + Math.round(left * sp), duration: Math.round((d - left) * sp) };
    }
    tr.segments.push(right);
    tr.segments.sort((p, q) => p.target_timerange.start - q.target_timerange.start);
    return { left: segId, right: right.id, atSec };
  }
  deleteSegment(segId) {
    const { tr, s } = this._find(segId);
    tr.segments = tr.segments.filter((x) => x.id !== segId);
    // drop the material and its refs if nothing else uses them
    const used = new Set(); for (const t of this.content.tracks) for (const x of t.segments) { used.add(x.material_id); for (const r of x.extra_material_refs || []) used.add(r); }
    for (const id of [s.material_id, ...(s.extra_material_refs || [])]) if (!used.has(id)) { const [k] = this._findMaterial(id); if (k) this.content.materials[k] = this.content.materials[k].filter((m) => m.id !== id); }
    this._recalcDuration();
    return { deleted: segId, track: tr.name };
  }
  setProps(segId, p = {}) {
    const { s } = this._find(segId);
    if (s.clip) {
      if (p.scale != null) s.clip.scale = { x: p.scale, y: p.scale };
      if (p.scaleX != null) s.clip.scale.x = p.scaleX;
      if (p.scaleY != null) s.clip.scale.y = p.scaleY;
      if (p.posX != null) s.clip.transform.x = p.posX;
      if (p.posY != null) s.clip.transform.y = p.posY;
      if (p.rotation != null) s.clip.rotation = p.rotation;
      if (p.opacity != null) s.clip.alpha = p.opacity;
    }
    if (p.volume != null) s.volume = p.volume;
    if (p.visible != null) s.visible = p.visible;
    if (p.speed != null && s.source_timerange) {
      s.speed = p.speed;
      s.target_timerange.duration = Math.round(s.source_timerange.duration / p.speed);
      for (const id of s.extra_material_refs || []) { const [k, m] = this._findMaterial(id); if (k === "speeds") m.speed = p.speed; }
      this._recalcDuration();
    }
    return { segmentId: segId, applied: Object.keys(p).filter((k) => p[k] != null) };
  }
  setText(segId, text, o = {}) {
    const { s } = this._find(segId);
    const [k, m] = this._findMaterial(s.material_id);
    if (k !== "texts") throw new Error("not a text segment");
    const c = JSON.parse(m.content);
    if (text != null) { c.text = text; for (const st of c.styles) st.range = [0, text.length]; }
    if (o.size != null) c.styles[0].size = o.size;
    if (o.color) c.styles[0].fill.content.solid.color = hexToRgb(o.color);
    m.content = JSON.stringify(c);
    return { segmentId: segId, text: c.text };
  }
  _recalcDuration() { let max = 0; for (const tr of this.content.tracks) for (const s of tr.segments || []) max = Math.max(max, s.target_timerange.start + s.target_timerange.duration); this.content.duration = max; }

  // ---------- read ----------
  timeline() {
    const c = this.content;
    return {
      name: this.name, file: this.file, durationSec: sec(c.duration || 0), fps: c.fps, canvas: { width: this.width, height: this.height },
      locked: fs.existsSync(path.join(this.dir, ".locked")), capcutRunning: capcutRunning(),
      tracks: c.tracks.map((tr, i) => ({
        index: i, type: tr.type, name: tr.name, renderIndex: this.trackRenderIndex(tr),
        segments: (tr.segments || []).map((s) => {
          const [k, m] = this._findMaterial(s.material_id);
          let label = m?.material_name || m?.name || m?.type || k;
          if (k === "texts") { try { label = JSON.parse(m.content).text; } catch {} }
          return { id: s.id, kind: k, label, atSec: sec(s.target_timerange.start), durSec: sec(s.target_timerange.duration), endSec: sec(s.target_timerange.start + s.target_timerange.duration),
            srcStartSec: s.source_timerange ? sec(s.source_timerange.start) : null, speed: s.speed ?? 1, volume: s.volume ?? 1,
            scale: s.clip?.scale?.x ?? null, pos: s.clip ? [s.clip.transform.x, s.clip.transform.y] : null, path: m?.path ?? null };
        }),
      })),
    };
  }

  // ---------- validate ----------
  validate() {
    const issues = [], warnings = [];
    const ids = new Set(); let dup = 0;
    for (const k of Object.keys(this.content.materials)) for (const m of this.content.materials[k] || []) { if (m && ids.has(m.id)) dup++; if (m) ids.add(m.id); }
    if (dup) issues.push(`${dup} duplicate material id(s)`);
    for (const tr of this.content.tracks) {
      const ss = [...(tr.segments || [])].sort((a, b) => a.target_timerange.start - b.target_timerange.start);
      for (let i = 1; i < ss.length; i++) if (ss[i].target_timerange.start < ss[i - 1].target_timerange.start + ss[i - 1].target_timerange.duration) issues.push(`overlap on track "${tr.name}" at ${sec(ss[i].target_timerange.start)}s`);
      for (const s of ss) { const [k, m] = this._findMaterial(s.material_id); if (!m) issues.push(`segment ${s.id} points at a missing material`); else if ((k === "videos" || k === "audios") && m.path && !fs.existsSync(m.path)) issues.push(`missing media file: ${m.path}`); }
    }
    const main = this.tracksOf("video")[0];
    if (main && main.segments.length) {
      const ss = [...main.segments].sort((a, b) => a.target_timerange.start - b.target_timerange.start);
      if (ss[0].target_timerange.start !== 0) warnings.push(`main video track starts at ${sec(ss[0].target_timerange.start)}s; CapCut snaps the main track to 0s`);
      for (let i = 1; i < ss.length; i++) { const gap = ss[i].target_timerange.start - (ss[i - 1].target_timerange.start + ss[i - 1].target_timerange.duration); if (gap > 1000) warnings.push(`gap of ${sec(gap)}s in the main video track at ${sec(ss[i - 1].target_timerange.start + ss[i - 1].target_timerange.duration)}s; CapCut closes gaps on the main track`); }
    } else if (!main) warnings.push("no video track yet");
    if (this.content.duration > 180 * US) warnings.push(`draft is ${sec(this.content.duration)}s; TikTok performs best under 60s`);
    return { ok: issues.length === 0, issues, warnings, durationSec: sec(this.content.duration || 0) };
  }

  // ---------- save ----------
  save({ force = false } = {}) {
    if (!force) {
      if (fs.existsSync(path.join(this.dir, ".locked"))) throw new Error("draft is open in CapCut (.locked present). Close CapCut, then save. Pass force:true only if you are sure it is closed.");
      if (capcutRunning()) throw new Error("CapCut is running; its autosave would overwrite this edit. Close CapCut, then save (or pass force:true).");
    }
    const v = this.validate();
    if (!v.ok) throw new Error(`refusing to save with issues: ${v.issues.join("; ")}`);
    this.content.update_time = Math.floor(Date.now() / 1000);
    const json = JSON.stringify(this.content);
    const targets = new Set([this.file]);
    for (const n of ["draft_content.json", "draft_info.json"]) { const p = path.join(this.dir, n); if (fs.existsSync(p)) targets.add(p); }
    for (const t of targets) { try { fs.copyFileSync(t, t + ".bak"); } catch {} fs.writeFileSync(t + ".tmp", json); fs.renameSync(t + ".tmp", t); }
    if (this.meta) {
      this.meta.tm_draft_modified = Date.now() * 1000; this.meta.tm_duration = this.content.duration; this.meta.draft_timeline_materials_size_ = json.length;
      this.meta.draft_fold_path = this.meta.draft_fold_path || this.dir; this.meta.draft_root_path = this.meta.draft_root_path || draftsDir(); this.meta.draft_name = this.meta.draft_name || this.name;
      fs.writeFileSync(this.metaFile + ".tmp", JSON.stringify(this.meta)); fs.renameSync(this.metaFile + ".tmp", this.metaFile);
    }
    return { saved: this.name, files: [...targets], durationSec: v.durationSec, warnings: v.warnings };
  }
  deleteDraft() { fs.rmSync(this.dir, { recursive: true, force: true }); return { deleted: this.name }; }
}

export function hexToRgb(hex) { const h = String(hex).replace("#", ""); if (h.length !== 6) throw new Error(`color must be #RRGGBB, got ${hex}`); return [0, 2, 4].map((i) => +(parseInt(h.slice(i, i + 2), 16) / 255).toFixed(4)); }
export { sec, us, kindOf };
