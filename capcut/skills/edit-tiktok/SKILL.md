---
name: edit-tiktok
description: Edit a TikTok (or Reel / Short) in CapCut from a folder of raw clips. Use when the user wants Claude to cut, assemble, caption, or "edit my TikTok" from footage, build a CapCut draft, pick the best moments from many videos, or preview a vertical edit before opening CapCut. Drives the capcut MCP tools (mcp__capcut__*).
---

# Edit a TikTok in CapCut from raw footage

You are the editor. The user hands you a folder of clips and, usually, a rough idea of the video ("the one about X", "a day-in-the-life", "clip the best bit of this interview"). You deliver a CapCut draft they open, tweak if they want, and export.

## Ground rules

- **All times are seconds.** The tools convert to CapCut's units.
- **Close CapCut before saving.** `capcut_save` refuses while CapCut is running because its autosave would overwrite the edit. Tell the user to close it, then save. Do not `force` unless they confirm it is closed.
- **Never touch the raw files.** Drafts reference them in place. Do not move, rename, or re-encode source clips.
- **Look before you cut.** Contact sheets exist so you can actually see the footage. Read them.
- **TikTok shape**: 1080×1920, hook in the first 1.5s, 20 to 45s total unless told otherwise, captions on for anything with speech, nothing important in the bottom 24% or right 15% of the frame (TikTok's UI sits there).

## Workflow

1. **Orient.** `capcut_status` (confirm the drafts folder and ffmpeg). `capcut_scan_folder` on the raw folder. Note total minutes, which clips are portrait vs landscape, which have audio.
2. **Watch the footage.** For each clip that could matter: `capcut_contact_sheet` (6 frames) and Read the PNG. For talking clips: `capcut_silences` to get speech windows; for action or b-roll: `capcut_scene_changes` and `capcut_loudness` on candidate windows. Write yourself a one-line log per clip: what it shows, the best 3 to 8 second window, and a quality note (shaky, dark, dead air).
3. **Plan the cut** before placing anything. Write a beat sheet with a timeline position, source clip, in-point, and duration for each beat: hook (0 to 1.5s, the most striking moment or a punchy line), then 3 to 8 beats, then a payoff or CTA. Choose the hook text and 3 to 7 word caption lines. Show the beat sheet to the user if they are present; otherwise proceed and report it at the end.
4. **Build the draft.** `capcut_create_draft` with a descriptive name (`yyyy-mm-dd-topic`). Then, in timeline order:
   - `capcut_add_video` for each beat on the main track, contiguous from 0s (the main track cannot have gaps). Landscape source on a 9:16 canvas: `fit: "cover"`, and check the contact sheet so the crop keeps the subject centered, else set `posX`.
   - Talking clip's own audio stays; b-roll over a voice: `mute: true`.
   - `capcut_add_text` for the hook (size 14, `posY` 0.55, `durSec` 2 to 3).
   - `capcut_add_captions` for speech (the default track "captions", size 10, sits at `posY` -0.45 which clears TikTok's UI).
   - `capcut_add_audio` for music at volume 0.15 to 0.35 under speech, 0.6 to 0.8 when there is none, `fadeOutSec` 1.
5. **Check.** `capcut_validate`; fix every issue and read the warnings (main-track gaps, overlength).
6. **Preview.** `capcut_preview` renders an mp4 with ffmpeg. Read one frame from it at a caption moment (`capcut_frame`) to confirm text placement. Then publish the phone-frame page: run `node ${CLAUDE_PLUGIN_ROOT}/scripts/preview.mjs <timeline.json> > preview.html` and call the Artifact tool with `files: {"<draft>.mp4": "<preview mp4 path>"}`. Give the user the link so they can watch it on the side.
7. **Save.** Ask the user to close CapCut if it is open, then `capcut_save`. Tell them the draft name; it appears in CapCut's project list on next launch.
8. **Revise on feedback** with `capcut_trim_segment`, `capcut_move_segment`, `capcut_split_segment`, `capcut_delete_segment`, `capcut_set_text`, then preview and save again. Between saves the session keeps edits in memory; `capcut_discard` throws them away.

## Editorial defaults

- Cut on motion or on a word boundary, never mid-word. Use the speech windows from `capcut_silences` as your edges and trim 0.1s inside them.
- Keep every shot 1.5 to 4s unless someone is telling a story; then let a single take run.
- Trim dead air. A pause longer than 0.6s in a talking clip gets cut unless it is a deliberate beat.
- Captions: sentence case, no trailing periods, numbers as digits, one idea per line, on screen 0.8 to 2.5s.
- Prefer the take where the speaker is loudest and steadiest (`capcut_loudness` mean between -20 and -12 dBFS is healthy).
- If the footage does not support the ask (nothing usable for the hook, all clips are dark), say so plainly and propose what to shoot.

## What the preview cannot show

The ffmpeg render skips effects, transitions, animations, stickers and overlay video tracks, and approximates text. It is for judging cuts, pacing and caption timing. Final look is checked in CapCut.
