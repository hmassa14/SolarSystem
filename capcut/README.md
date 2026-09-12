# capcut — a Claude Code plugin that drives CapCut

Give Claude a folder of raw clips; get back a CapCut draft (a real project in CapCut's project list) with the cut, a hook, captions and music, plus a phone-frame preview you can watch in the side panel before opening CapCut.

```
capcut/
├── .claude-plugin/plugin.json
├── .mcp.json                     # launches the bundled MCP server
├── server/
│   ├── server.mjs                # 28 tools: analyze footage, build/edit drafts, preview, save
│   ├── draft.mjs                 # CapCut draft model (create, load, tracks, segments, validate, save)
│   ├── media.mjs                 # ffmpeg/ffprobe: probe, scene changes, silences, loudness, contact sheets
│   ├── render.mjs                # draft -> mp4 preview render
│   ├── mcp.mjs                   # dependency-free MCP stdio server
│   ├── templates/capcut/         # blank draft skeleton (see templates/NOTICE.md)
│   └── test/run.mjs              # end-to-end smoke test (synthesizes clips, builds a draft, renders, talks MCP)
├── scripts/preview.mjs           # phone-frame preview page from a draft timeline
├── skills/edit-tiktok/           # the editing workflow Claude follows
├── skills/capcut-drafts/         # reference: units, safe zones, save rule, errors
└── agents/tiktok-editor.md       # autonomous editor subagent
```

## Requirements

- CapCut desktop (Windows or macOS) with at least one project opened once, so the drafts folder exists.
- Node 18+.
- ffmpeg and ffprobe on PATH. No ffmpeg? `cd capcut/server && npm install` pulls a static build.

## Install

```bash
claude --plugin-dir ./capcut
```

Then ask: *"Edit a TikTok from ~/Videos/raw-sept-12 about the cleanroom story. Hook on the strongest line, captions, music under it, 30 seconds."*

Claude will scan the folder, look at contact sheets of each clip, plan a beat sheet, build the draft, render a preview to an artifact, and save the draft once CapCut is closed. Open CapCut and the project is in the list.

## Environment variables

| Variable | Purpose |
|---|---|
| `CAPCUT_DRAFTS_DIR` | Drafts folder if CapCut is installed somewhere unusual |
| `CAPCUT_DRAFT_FILE` | Force `draft_content.json` or `draft_info.json` |
| `FFMPEG_PATH`, `FFPROBE_PATH` | Explicit binaries |
| `CAPCUT_WORK_DIR` | Where contact sheets and previews are written (default: system temp) |

## Test

```bash
cd capcut/server && node test/run.mjs
```

Builds a draft from synthetic clips in a temp folder, saves, reloads, renders a preview, and exercises the MCP protocol.

## Status and limits

- Verified: draft JSON structure (matches the conventions used by the open-source CapCutAPI / pyJianYingDraft projects, which CapCut opens), save/reload round trip, preview render, MCP protocol. Not yet verified on this machine: opening a generated draft inside CapCut itself. Do that with a throwaway draft first and keep the `.bak` files.
- CapCut's draft format is proprietary and changes between versions. If a draft refuses to open, restore `*.bak` and file the CapCut version.
- Not supported: effects, transitions, animations, stickers, CapCut auto-captions. Add them in CapCut after the structural edit; they survive later saves.
- The preview render approximates text and skips effects. It is for judging cuts and caption timing.
