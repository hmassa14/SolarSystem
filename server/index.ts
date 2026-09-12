import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { ImageRequestSchema, StoryboardRequestSchema, type HealthResponse } from "../shared/schema.ts";
import { CLAUDE_MODEL, planStoryboard, resolveAiMode, StoryboardError } from "./ai/storyboard.ts";
import { resolveImageProvider } from "./images/index.ts";

const app = express();
app.use(express.json({ limit: "1mb" }));

const imageProvider = resolveImageProvider();

app.get("/api/health", (_req, res) => {
  const body: HealthResponse = {
    ok: true,
    ai: resolveAiMode(),
    model: CLAUDE_MODEL,
    imageProvider: imageProvider.name,
  };
  res.json(body);
});

app.post("/api/storyboard", async (req, res) => {
  const parsed = StoryboardRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid storyboard request", issues: parsed.error.issues });
    return;
  }
  try {
    res.json(await planStoryboard(parsed.data));
  } catch (err) {
    if (err instanceof StoryboardError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    console.error("[storyboard]", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Storyboard generation failed" });
  }
});

app.post("/api/image", async (req, res) => {
  const parsed = ImageRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid image request", issues: parsed.error.issues });
    return;
  }
  try {
    res.json(await imageProvider.generate(parsed.data));
  } catch (err) {
    console.error("[image]", err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Image generation failed" });
  }
});

// In production, serve the built web app from the same process.
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, "../dist");
if (process.env.NODE_ENV === "production" && existsSync(dist)) {
  app.use(express.static(dist));
  app.get("/{*splat}", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => {
  console.log(`StoryNest API on http://localhost:${port}  (ai=${resolveAiMode()}, images=${imageProvider.name})`);
});
