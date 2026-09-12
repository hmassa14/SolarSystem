import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { StoryboardPlanSchema, type StoryboardRequest, type StoryboardResponse } from "../../shared/schema.ts";
import { STORYBOARD_SYSTEM_PROMPT, buildUserMessage } from "./prompt.ts";
import { mockStoryboard } from "./mockStoryboard.ts";

export const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5";

export type AiMode = "live" | "mock";

export function resolveAiMode(): AiMode {
  const forced = process.env.AI_MODE;
  if (forced === "live" || forced === "mock") return forced;
  return process.env.ANTHROPIC_API_KEY ? "live" : "mock";
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  // Zero-arg constructor resolves ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN,
  // or an `ant auth login` profile. Never hardcode a key here.
  client ??= new Anthropic();
  return client;
}

export async function planStoryboard(req: StoryboardRequest): Promise<StoryboardResponse> {
  if (resolveAiMode() === "mock") {
    return { plan: mockStoryboard(req), mode: "mock" };
  }

  const response = await getClient().beta.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    // Server-side refusal fallback: if a safety classifier declines, the API
    // re-runs on Anthropic's recommended fallback model inside the same call.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: zodOutputFormat(StoryboardPlanSchema),
    },
    system: [
      { type: "text", text: STORYBOARD_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: buildUserMessage(req) }],
  });

  if (response.stop_reason === "refusal") {
    const why = response.stop_details?.type === "refusal" ? response.stop_details.explanation : "";
    throw new StoryboardError(`Claude declined to plan this storyboard. ${why ?? ""}`.trim(), 422);
  }
  if (response.stop_reason === "max_tokens") {
    throw new StoryboardError("Storyboard response was cut off; try a shorter brief.", 502);
  }

  const text = response.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");

  const parsed = StoryboardPlanSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    throw new StoryboardError("Claude returned a storyboard in an unexpected shape.", 502);
  }
  return { plan: parsed.data, mode: "live" };
}

export class StoryboardError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}
