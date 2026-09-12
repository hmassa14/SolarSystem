---
name: capcut-drafts
description: Reference for working with CapCut desktop drafts through the capcut MCP tools: where drafts live, the save rule, coordinates and units, text sizing, and how to fix common problems. Use when inspecting or editing an existing CapCut project, debugging a draft that will not open, or when a capcut tool returns an error.
---

# CapCut drafts: how the tools map to CapCut

## Where things are

- Drafts: one folder per project under the CapCut drafts directory (`capcut_status` shows it). Windows: `%LOCALAPPDATA%\CapCut\User Data\Projects\com.lveditor.draft`. macOS: `~/Movies/CapCut/User Data/Projects/com.lveditor.draft`. Override with the `CAPCUT_DRAFTS_DIR` environment variable.
- The timeline file is `draft_content.json` (Windows) or `draft_info.json` (macOS). The tools detect which one the install uses; `CAPCUT_DRAFT_FILE` overrides.
- Every save first copies the previous file to `*.bak`. If a draft stops opening in CapCut after an edit, restore the `.bak` and report what was written.

## The save rule

CapCut autosaves open projects on a timer. Writing a draft while CapCut has it open loses the edit, and can leave the project half-written. `capcut_save` therefore refuses when CapCut is running or the draft has a `.locked` file. Close CapCut, save, reopen.

## Units and coordinates

- Times: seconds everywhere in the tools.
- Position: `posX`, `posY` in half-canvas units. (0,0) is the center; x runs -1 (left edge) to 1 (right edge); y runs -1 (bottom) to 1 (top).
- Scale: 1 = the clip fitted inside the canvas. `fit: "cover"` on add computes the scale that fills the canvas.
- Track order: later video tracks render on top of earlier ones. Text tracks are always above video.
- Text size: CapCut's own unit. 8 reads as a small caption, 10 a normal caption, 14 a hook, 18 a title. Long hooks wrap at 82% of the canvas width.

## Safe zones for TikTok

Bottom 24% (caption, sound, profile), right 15% (like, comment, share), top 12% (Following / For You). Default caption `posY` -0.45 and hook `posY` 0.55 clear them at any size up to 14.

## Common errors

- `segment overlaps existing segment`: same track, overlapping times. Move it, trim the neighbour, or add a track (`capcut_add_track`).
- `clip runs past the end of <file>`: `srcStartSec + durSec × speed` exceeds the file. Re-probe and shorten.
- `main video track starts at Xs` / `gap in the main video track`: CapCut snaps the bottom video track to a contiguous run from 0s. Close the gap or move the clip to a second video track.
- `ffmpeg not found`: install ffmpeg, set `FFMPEG_PATH`, or `npm install` inside the plugin's `server/` folder to pull a static build.
- Draft opens but media shows as missing: paths are absolute; the raw files moved. Put them back or re-add the clips.

## Not supported yet

Effects, filters, transitions, keyframe animation, stickers, and CapCut's own auto-captions. Add those in CapCut after the structural edit. Existing ones in a draft are preserved on save.
