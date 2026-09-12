import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { StoryboardPlan } from "../../shared/schema.ts";
import type { Idea, IdeaStatus, Shot, ShotImage, Storyboard } from "../types.ts";
import { uid } from "../lib/id.ts";

function emptyStoryboard(): Storyboard {
  return { prompt: "", logline: "", hook: "", shots: [], generatedAt: null, mode: null };
}

interface IdeasState {
  ideas: Idea[];
  addIdea: (title: string, firstNote?: string) => Idea;
  removeIdea: (id: string) => void;
  updateIdea: (id: string, patch: Partial<Pick<Idea, "title" | "status" | "tags">>) => void;
  addNote: (ideaId: string, text: string) => void;
  updateNote: (ideaId: string, noteId: string, text: string) => void;
  removeNote: (ideaId: string, noteId: string) => void;
  setPrompt: (ideaId: string, prompt: string) => void;
  applyPlan: (ideaId: string, plan: StoryboardPlan, mode: "live" | "mock") => void;
  updateShot: (ideaId: string, shotId: string, patch: Partial<Omit<Shot, "id" | "image">>) => void;
  removeShot: (ideaId: string, shotId: string) => void;
  addShot: (ideaId: string) => void;
  moveShot: (ideaId: string, shotId: string, direction: -1 | 1) => void;
  setShotImage: (ideaId: string, shotId: string, image: ShotImage) => void;
}

function touch(idea: Idea): Idea {
  return { ...idea, updatedAt: Date.now() };
}

export const useIdeas = create<IdeasState>()(
  persist(
    (set, get) => {
      const patchIdea = (id: string, fn: (idea: Idea) => Idea) =>
        set((s) => ({ ideas: s.ideas.map((i) => (i.id === id ? touch(fn(i)) : i)) }));
      const patchShots = (ideaId: string, fn: (shots: Shot[]) => Shot[]) =>
        patchIdea(ideaId, (i) => ({ ...i, storyboard: { ...i.storyboard, shots: fn(i.storyboard.shots) } }));

      return {
        ideas: [],

        addIdea: (title, firstNote) => {
          const now = Date.now();
          const idea: Idea = {
            id: uid(),
            title: title.trim() || "Untitled idea",
            status: "seed",
            tags: [],
            notes: firstNote?.trim() ? [{ id: uid(), text: firstNote.trim(), createdAt: now }] : [],
            storyboard: emptyStoryboard(),
            createdAt: now,
            updatedAt: now,
          };
          set((s) => ({ ideas: [idea, ...s.ideas] }));
          return idea;
        },

        removeIdea: (id) => set((s) => ({ ideas: s.ideas.filter((i) => i.id !== id) })),

        updateIdea: (id, patch) => patchIdea(id, (i) => ({ ...i, ...patch })),

        addNote: (ideaId, text) => {
          if (!text.trim()) return;
          patchIdea(ideaId, (i) => ({
            ...i,
            status: i.status === "seed" && i.notes.length >= 2 ? "developing" : i.status,
            notes: [...i.notes, { id: uid(), text: text.trim(), createdAt: Date.now() }],
          }));
        },

        updateNote: (ideaId, noteId, text) =>
          patchIdea(ideaId, (i) => ({
            ...i,
            notes: i.notes.map((n) => (n.id === noteId ? { ...n, text } : n)),
          })),

        removeNote: (ideaId, noteId) =>
          patchIdea(ideaId, (i) => ({ ...i, notes: i.notes.filter((n) => n.id !== noteId) })),

        setPrompt: (ideaId, prompt) =>
          patchIdea(ideaId, (i) => ({ ...i, storyboard: { ...i.storyboard, prompt } })),

        applyPlan: (ideaId, plan, mode) =>
          patchIdea(ideaId, (i) => ({
            ...i,
            status: i.status === "seed" ? "developing" : i.status,
            storyboard: {
              ...i.storyboard,
              logline: plan.logline,
              hook: plan.hook,
              shots: plan.shots.map((s) => ({ ...s, id: uid(), image: { status: "idle" } })),
              generatedAt: Date.now(),
              mode,
            },
          })),

        updateShot: (ideaId, shotId, patch) =>
          patchShots(ideaId, (shots) => shots.map((s) => (s.id === shotId ? { ...s, ...patch } : s))),

        removeShot: (ideaId, shotId) => patchShots(ideaId, (shots) => shots.filter((s) => s.id !== shotId)),

        addShot: (ideaId) =>
          patchShots(ideaId, (shots) => [
            ...shots,
            {
              id: uid(),
              title: `Shot ${shots.length + 1}`,
              description: "",
              shotType: "medium",
              cameraMovement: "static",
              durationSeconds: 3,
              onScreenText: "",
              audioNotes: "",
              filmingTips: "",
              imagePrompt: "",
              image: { status: "idle" },
            },
          ]),

        moveShot: (ideaId, shotId, direction) =>
          patchShots(ideaId, (shots) => {
            const idx = shots.findIndex((s) => s.id === shotId);
            const to = idx + direction;
            if (idx < 0 || to < 0 || to >= shots.length) return shots;
            const next = [...shots];
            [next[idx], next[to]] = [next[to], next[idx]];
            return next;
          }),

        setShotImage: (ideaId, shotId, image) =>
          patchShots(ideaId, (shots) => shots.map((s) => (s.id === shotId ? { ...s, image } : s))),
      };

      // `get` is unused today but kept in the closure signature for future derived actions.
      void get;
    },
    {
      name: "storynest.ideas.v1",
      // Don't persist in-flight loading states across reloads.
      partialize: (s) => ({
        ideas: s.ideas.map((i) => ({
          ...i,
          storyboard: {
            ...i.storyboard,
            shots: i.storyboard.shots.map((sh) =>
              sh.image.status === "loading" ? { ...sh, image: { status: "idle" as const } } : sh,
            ),
          },
        })),
      }),
    },
  ),
);

export function useIdea(id: string | undefined): Idea | undefined {
  return useIdeas((s) => s.ideas.find((i) => i.id === id));
}

export function statusLabel(status: IdeaStatus): string {
  return { seed: "Seed", developing: "Developing", ready: "Ready to film", filmed: "Filmed" }[status];
}
