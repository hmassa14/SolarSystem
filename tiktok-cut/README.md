# tiktok-cut

A Claude Code plugin that cuts vertical short-form video with ffmpeg and previews it in a phone-frame artifact in the side panel.

```
tiktok-cut/
├── .claude-plugin/plugin.json
├── skills/tiktok-cut/SKILL.md      # the workflow Claude follows
├── scripts/render.mjs              # edit.json -> mp4 (+ .ass captions) via ffmpeg
├── scripts/preview.mjs             # edit.json -> preview.html (phone frame, synced caption track)
├── scripts/preview.template.html
└── examples/edit.example.json
```

## Try it

```bash
claude --plugin-dir ./tiktok-cut
```

Then, in Claude Code: "Cut a 20-second TikTok from raw/interview.mp4 with these captions..." and Claude writes `edit.json`, renders, and publishes the preview.

Manual run:

```bash
node tiktok-cut/scripts/render.mjs edit.json
node tiktok-cut/scripts/preview.mjs edit.json cut.mp4 > out/preview.html
```

Requires Node 18+ and ffmpeg (system install, `FFMPEG_PATH`, or `npm i ffmpeg-static ffprobe-static`).
