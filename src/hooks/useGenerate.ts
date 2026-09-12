import { useCallback, useState } from "react";
import { api } from "../lib/api.ts";
import { useIdeas } from "../store/ideas.ts";
import type { Idea, Shot } from "../types.ts";

/**
 * Orchestrates the two AI calls for one nest:
 *  - planStoryboard: notes + brief -> shot list (Claude)
 *  - renderShot / renderAll: shot imagePrompt -> frame (image provider)
 */
export function useGenerate(idea: Idea) {
  const applyPlan = useIdeas((s) => s.applyPlan);
  const setShotImage = useIdeas((s) => s.setShotImage);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const planStoryboard = useCallback(async () => {
    setPlanning(true);
    setError(null);
    try {
      const res = await api.storyboard({
        title: idea.title,
        notes: idea.notes.map((n) => n.text),
        prompt: idea.storyboard.prompt,
      });
      applyPlan(idea.id, res.plan, res.mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Storyboard generation failed");
    } finally {
      setPlanning(false);
    }
  }, [idea.id, idea.title, idea.notes, idea.storyboard.prompt, applyPlan]);

  const renderShot = useCallback(
    async (shot: Shot, index: number) => {
      if (!shot.imagePrompt.trim()) {
        setShotImage(idea.id, shot.id, { status: "error", error: "Add an image prompt first" });
        return;
      }
      setShotImage(idea.id, shot.id, { status: "loading" });
      try {
        const res = await api.image({
          prompt: shot.imagePrompt,
          shotTitle: shot.title,
          shotType: shot.shotType,
          index,
        });
        setShotImage(idea.id, shot.id, { status: "done", src: res.src, provider: res.provider });
      } catch (e) {
        setShotImage(idea.id, shot.id, {
          status: "error",
          error: e instanceof Error ? e.message : "Image generation failed",
        });
      }
    },
    [idea.id, setShotImage],
  );

  const renderAll = useCallback(
    async (shots: Shot[], onlyMissing = true) => {
      const targets = shots
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => !onlyMissing || s.image.status !== "done");
      // Sequential on purpose: keeps provider rate limits happy and shows progress.
      for (const { s, i } of targets) await renderShot(s, i);
    },
    [renderShot],
  );

  return { planning, error, planStoryboard, renderShot, renderAll };
}
