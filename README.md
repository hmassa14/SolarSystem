# StoryNest

Curate TikTok video ideas as **nests**, then open a nest to develop it into a
shot-by-shot **storyboard** you can actually film. The storyboard brief and
shot list live on the left; a 9:16 frame for each shot renders on the right.

Built as a responsive web app (works on a phone browser) with React + Vite,
plus a small Node API that talks to Claude for planning and to a pluggable
image provider for frames.

## Quick start

```bash
npm install
npm run dev
```

- Web app: http://localhost:5173
- API: http://localhost:8787 (the Vite dev server proxies `/api` to it)

With no API keys the app runs in **mock mode**: storyboards come from a
canned planner and frames are labeled SVG placeholders, so the whole flow
works end to end before you wire up real services.

## Turning on Claude

```bash
cp .env.example .env
# then set ANTHROPIC_API_KEY=sk-ant-...
```

Restart `npm run dev`. The badge in the top bar switches to "Claude live".
The planner uses `claude-opus-5` by default (override with `CLAUDE_MODEL`),
adaptive thinking, structured output validated by the shared zod schema, and
server-side refusal fallbacks so a declined request is retried on Anthropic's
recommended fallback model instead of failing.

## Adding a real image provider

Frames are generated through `server/images/provider.ts`, which is a tiny
interface. Only a `mock` provider ships today.

1. Create `server/images/<vendor>.ts` exporting an `ImageProvider`.
2. Register it in the `registry` in `server/images/index.ts`.
3. Set `IMAGE_PROVIDER=<vendor>` in `.env`.

Each request carries the shot's `imagePrompt` (always ending in
"vertical 9:16 storyboard frame"), its title, shot type, and index.

## How it's organized

```
index.html, vite.config.ts     Vite entry
src/
  pages/IdeasBoard.tsx         The board: capture an idea, browse nests
  pages/Nest.tsx               One nest: notes + brief + shots (left), frames (right)
  components/                  IdeaCard, NotesPanel, ShotCard, FrameGrid, HealthBadge
  hooks/useGenerate.ts         Calls the API for planning and per-shot rendering
  store/ideas.ts               zustand store, persisted to localStorage
  types.ts                     Idea / Note / Storyboard / Shot types
shared/schema.ts               zod schemas shared by client and server;
                               also Claude's structured-output format
server/
  index.ts                     Express API (+ serves dist/ in production)
  ai/storyboard.ts             Claude planner (mock fallback when no key)
  ai/prompt.ts                 Frozen system prompt (cache-friendly)
  ai/mockStoryboard.ts         Canned 6-shot plan built from your notes
  images/                      Image provider interface + mock renderer
legacy/solar-system/           The original CSS solar-system demo this repo held
```

## Scripts

| Command             | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Web + API with hot reload                      |
| `npm run typecheck` | Type-check client and server                   |
| `npm run build`     | Production build to `dist/`                    |
| `npm start`         | Run the API and serve `dist/` from one process |

## API

| Route                  | Body                                        | Returns                          |
| ---------------------- | ------------------------------------------- | -------------------------------- |
| `GET /api/health`      |                                             | `{ ai, model, imageProvider }`   |
| `POST /api/storyboard` | `{ title, notes: string[], prompt }`        | `{ plan: StoryboardPlan, mode }` |
| `POST /api/image`      | `{ prompt, shotTitle, shotType, index }`    | `{ src, provider }`              |

## What's next

- A real image provider adapter.
- Export a nest as a shot list (PDF or plain text) to take on set.
- Reference-photo upload per shot, so frames can match your actual space.
- Sync ideas beyond localStorage (a backend or file export/import).
