import type { StoryboardPlan, StoryboardRequest } from "../../shared/schema.ts";

/**
 * Deterministic stand-in for Claude so the whole UI works with no API key.
 * It stitches the creator's own notes into a generic 6-shot structure.
 */
export function mockStoryboard(req: StoryboardRequest): StoryboardPlan {
  const title = req.title || "Untitled idea";
  const notes = req.notes.filter((n) => n.trim().length > 0);
  const note = (i: number) => notes[i % Math.max(notes.length, 1)] ?? "the main idea";

  return {
    logline: `${title}: a quick, honest walkthrough built from your notes.`,
    hook: `Text overlay in the first second: "${note(0).slice(0, 48)}"`,
    shots: [
      {
        title: "Cold open",
        description: `Tight on the thing the video is about. Bold caption states the hook: "${note(0)}".`,
        shotType: "close-up",
        cameraMovement: "slow push-in",
        durationSeconds: 2,
        onScreenText: note(0).slice(0, 60),
        audioNotes: "Trending sound, drop hits at the cut",
        filmingTips:
          "Phone in one hand, subject 30cm away, window light from the side. Start recording, then push the phone toward the subject over two seconds.",
        imagePrompt: `Close-up of ${note(0)}, dramatic side light, shallow depth of field, bold caption overlay, vertical 9:16 storyboard frame`,
      },
      {
        title: "Talking head setup",
        description: "You, framed chest-up, delivering the one-line promise of the video.",
        shotType: "medium (selfie)",
        cameraMovement: "static",
        durationSeconds: 5,
        onScreenText: "",
        audioNotes: `VO: "${note(1)}"`,
        filmingTips:
          "Prop the phone at eye level (a stack of books works). Face the window. Look at the lens, not the screen. Leave a half-second of silence before and after the line for editing.",
        imagePrompt: "Creator speaking to camera, chest-up selfie framing, soft window light, tidy background, vertical 9:16 storyboard frame",
      },
      {
        title: "Show, don't tell",
        description: `Top-down demonstration of ${note(2)}. Hands in frame.`,
        shotType: "top-down",
        cameraMovement: "static",
        durationSeconds: 8,
        onScreenText: "Step 1",
        audioNotes: "VO continues over the action",
        filmingTips:
          "Phone flat on a shelf edge or held between two mugs pointing straight down. Overhead light off, window light only, to avoid your own shadow. Move slower than feels natural.",
        imagePrompt: `Top-down view of hands demonstrating ${note(2)}, clean surface, natural light, vertical 9:16 storyboard frame`,
      },
      {
        title: "Detail beat",
        description: `Extreme close-up of the most satisfying detail of ${note(3)}.`,
        shotType: "extreme close-up",
        cameraMovement: "handheld drift",
        durationSeconds: 3,
        onScreenText: "",
        audioNotes: "Sound design: the real sound of the action, boosted",
        filmingTips:
          "Tap to focus and hold to lock exposure before you start. Get closer than you think; if the phone won't focus, back off 5cm.",
        imagePrompt: `Extreme close-up macro detail of ${note(3)}, rich texture, warm light, vertical 9:16 storyboard frame`,
      },
      {
        title: "The turn",
        description: `The before/after or the reveal. Whatever ${note(4)} changes, show that change in one frame.`,
        shotType: "wide",
        cameraMovement: "whip pan into frame",
        durationSeconds: 4,
        onScreenText: "Before → After",
        audioNotes: "Beat drop lands on the reveal",
        filmingTips:
          "Film the 'before' and the 'after' from the exact same spot. Mark the floor with tape so the phone returns to the same position. Whip pan starts off-subject and lands on it.",
        imagePrompt: `Wide shot revealing the result of ${note(4)}, split composition suggesting before and after, vertical 9:16 storyboard frame`,
      },
      {
        title: "Close and loop",
        description: "Return to the opening framing so the video loops cleanly. End on the caption that invites a comment.",
        shotType: "close-up",
        cameraMovement: "static",
        durationSeconds: 3,
        onScreenText: "Which one would you try?",
        audioNotes: "Music tails out",
        filmingTips:
          "Recreate shot 1 exactly. Hold the final frame for a full second longer than you want to; TikTok trims the tail.",
        imagePrompt: `Close-up matching the opening frame, question caption overlay, vertical 9:16 storyboard frame`,
      },
    ],
  };
}
