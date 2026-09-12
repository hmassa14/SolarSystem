---
name: tiktok-cut
description: Cut a vertical short (TikTok, Reels, Shorts) from a source video with ffmpeg and show it in a phone-frame preview artifact. Use when the user asks to edit, trim, caption, or preview a TikTok / short-form / 9:16 video, or wants to see a video "on the phone" in the side panel.
---

# TikTok cut

Turn a source clip into a 9:16 short from a small edit JSON, render it with ffmpeg, and publish a phone-frame preview so the user can watch it in the side panel without leaving the conversation.

## What the user gives you

- A source video file (any aspect ratio; it is scaled and center-cropped to 9:16).
- What they want said on screen: a hook line, captions, or a transcript to chunk.
- Optionally: where to trim, a speed, target size.

If there is no source video yet, say so and offer to run the flow on a synthetic test clip:

```
ffmpeg -f lavfi -i "gradients=s=1080x1920:d=12:r=30" -f lavfi -i "sine=f=196:d=12,volume=0.25" -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest raw/source.mp4
```

## Steps

1. **Write `edit.json`** next to the source, using `examples/edit.example.json` in this plugin as the shape. Times in `trim` are on the source timeline. Times in `hook` and `captions` are on the output timeline (after trim and speed). Keep caption lines to 4 to 7 words so they read at phone size; chunk a transcript on natural pauses.
2. **Render**: `node ${CLAUDE_PLUGIN_ROOT}/scripts/render.mjs edit.json`. It writes the mp4 plus a sidecar `.captions.ass` and prints duration and byte size as JSON. Captions and the hook are placed inside TikTok's safe area (clear of the top account line, the right rail, and the bottom caption block) automatically.
3. **Look once**: pull one frame from a captioned moment (`ffmpeg -ss <t> -i out/cut.mp4 -frames:v 1 frame.png`) and Read it to confirm the text landed where you expect.
4. **Preview**: `node ${CLAUDE_PLUGIN_ROOT}/scripts/preview.mjs edit.json cut.mp4 > out/preview.html`, then publish with the Artifact tool, passing the video as a supporting file so the page can play it:
   `files: {"cut.mp4": "out/cut.mp4"}`. Keep the mp4 under 15 MB (the artifact limit for a binary file). 720×1280 at CRF 26 to 28 keeps a 60-second clip well under that; render the final 1080×1920 master separately for upload.
5. **Iterate**: edit `edit.json`, re-run render and preview, republish to the same artifact path. The open preview updates in place.
6. **Deliver**: when the cut is approved, render the upload master at `"size": {"w":1080,"h":1920}`, `"crf": 20`, and send it with SendUserFile.

## ffmpeg

`render.mjs` looks for ffmpeg in this order: the `FFMPEG_PATH` env var, `ffmpeg` on PATH, then the `ffmpeg-static` npm package. If none is found, run `npm i ffmpeg-static ffprobe-static` in the working folder or point `FFMPEG_PATH` at a binary. The captions use libass (the `subtitles` filter), which static builds ship even when `drawtext` is missing.

## Guardrails

- Never overwrite the source. Outputs go to `out/`.
- Read the render JSON: if duration is 0 or bytes are tiny, the trim range was outside the source.
- A hook longer than about 8 words wraps to three lines at 1080 wide. Shorten it instead of shrinking the font.
- If the user's source is landscape, the center crop will lose the sides. Say so and offer a `crop` offset or a blurred-background pad if the framing matters.
