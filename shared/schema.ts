import { z } from "zod";

/**
 * Shared contract between the web app and the API server.
 * The zod schemas double as Claude's structured-output format, so every
 * field is required (structured outputs reject optional/nullable fields).
 */

export const ShotPlanSchema = z.object({
  title: z.string().describe("Short label for the shot, e.g. 'Cold open: the messy desk'"),
  description: z
    .string()
    .describe("What the viewer sees and what happens on screen during this shot"),
  shotType: z
    .string()
    .describe("Framing: wide, medium, close-up, extreme close-up, POV, over-the-shoulder, top-down, selfie"),
  cameraMovement: z
    .string()
    .describe("Static, handheld, slow push-in, whip pan, orbit, tilt up, tracking, etc."),
  durationSeconds: z.number().describe("Approximate on-screen duration in seconds"),
  onScreenText: z.string().describe("Caption or text overlay for this shot; empty string if none"),
  audioNotes: z
    .string()
    .describe("Voiceover line, dialogue, or sound cue; empty string if none"),
  filmingTips: z
    .string()
    .describe("Practical, concrete advice for actually filming this on a phone: lighting, angle, props, timing"),
  imagePrompt: z
    .string()
    .describe("A self-contained prompt for an image model to render this single frame, vertical 9:16"),
});

export const StoryboardPlanSchema = z.object({
  logline: z.string().describe("One-sentence summary of the video"),
  hook: z.string().describe("The first 1-2 seconds: what stops the scroll"),
  shots: z.array(ShotPlanSchema).describe("Ordered shot list, typically 4-8 shots"),
});

export type ShotPlan = z.infer<typeof ShotPlanSchema>;
export type StoryboardPlan = z.infer<typeof StoryboardPlanSchema>;

export const StoryboardRequestSchema = z.object({
  title: z.string(),
  notes: z.array(z.string()),
  prompt: z.string(),
});
export type StoryboardRequest = z.infer<typeof StoryboardRequestSchema>;

export interface StoryboardResponse {
  plan: StoryboardPlan;
  mode: "live" | "mock";
}

export const ImageRequestSchema = z.object({
  prompt: z.string(),
  shotTitle: z.string(),
  shotType: z.string(),
  index: z.number().int().nonnegative(),
});
export type ImageRequest = z.infer<typeof ImageRequestSchema>;

export interface ImageResponse {
  /** data: URI or https URL of the rendered frame */
  src: string;
  provider: string;
}

export interface HealthResponse {
  ok: true;
  ai: "live" | "mock";
  model: string;
  imageProvider: string;
}
