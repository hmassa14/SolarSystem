import type { ShotPlan } from "../shared/schema.ts";

export interface Note {
  id: string;
  text: string;
  createdAt: number;
}

export type ImageStatus = "idle" | "loading" | "done" | "error";

export interface ShotImage {
  status: ImageStatus;
  src?: string;
  provider?: string;
  error?: string;
}

export interface Shot extends ShotPlan {
  id: string;
  image: ShotImage;
}

export interface Storyboard {
  /** The brief the creator hands to the planner. Editable. */
  prompt: string;
  logline: string;
  hook: string;
  shots: Shot[];
  generatedAt: number | null;
  mode: "live" | "mock" | null;
}

export type IdeaStatus = "seed" | "developing" | "ready" | "filmed";

export interface Idea {
  id: string;
  title: string;
  status: IdeaStatus;
  tags: string[];
  notes: Note[];
  storyboard: Storyboard;
  createdAt: number;
  updatedAt: number;
}

export const IDEA_STATUSES: { value: IdeaStatus; label: string }[] = [
  { value: "seed", label: "Seed" },
  { value: "developing", label: "Developing" },
  { value: "ready", label: "Ready to film" },
  { value: "filmed", label: "Filmed" },
];
