import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useIdea, useIdeas } from "../store/ideas.ts";
import { useGenerate } from "../hooks/useGenerate.ts";
import NotesPanel from "../components/NotesPanel.tsx";
import ShotCard from "../components/ShotCard.tsx";
import FrameGrid from "../components/FrameGrid.tsx";
import { IDEA_STATUSES, type IdeaStatus } from "../types.ts";

export default function Nest() {
  const { id } = useParams();
  const idea = useIdea(id);
  const updateIdea = useIdeas((s) => s.updateIdea);
  const setPrompt = useIdeas((s) => s.setPrompt);
  const updateShot = useIdeas((s) => s.updateShot);
  const removeShot = useIdeas((s) => s.removeShot);
  const addShot = useIdeas((s) => s.addShot);
  const moveShot = useIdeas((s) => s.moveShot);
  const [selected, setSelected] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"plan" | "frames">("plan");

  if (!idea) {
    return (
      <main className="board">
        <p className="empty">That nest doesn't exist. <Link to="/">Back to the board</Link></p>
      </main>
    );
  }
  return (
    <NestView
      key={idea.id}
      ideaId={idea.id}
      selected={selected}
      setSelected={setSelected}
      mobileTab={mobileTab}
      setMobileTab={setMobileTab}
      actions={{ updateIdea, setPrompt, updateShot, removeShot, addShot, moveShot }}
    />
  );
}

type Actions = {
  updateIdea: ReturnType<typeof useIdeas.getState>["updateIdea"];
  setPrompt: ReturnType<typeof useIdeas.getState>["setPrompt"];
  updateShot: ReturnType<typeof useIdeas.getState>["updateShot"];
  removeShot: ReturnType<typeof useIdeas.getState>["removeShot"];
  addShot: ReturnType<typeof useIdeas.getState>["addShot"];
  moveShot: ReturnType<typeof useIdeas.getState>["moveShot"];
};

function NestView({
  ideaId,
  selected,
  setSelected,
  mobileTab,
  setMobileTab,
  actions,
}: {
  ideaId: string;
  selected: string | null;
  setSelected: (id: string | null) => void;
  mobileTab: "plan" | "frames";
  setMobileTab: (t: "plan" | "frames") => void;
  actions: Actions;
}) {
  const idea = useIdea(ideaId)!;
  const { planning, error, planStoryboard, renderShot, renderAll } = useGenerate(idea);
  const shots = idea.storyboard.shots;
  const totalSecs = useMemo(() => shots.reduce((a, s) => a + (Number(s.durationSeconds) || 0), 0), [shots]);
  const rendering = shots.some((s) => s.image.status === "loading");

  // Clicking a frame on the right scrolls its shot card into view on the left.
  useEffect(() => {
    if (!selected) return;
    document.getElementById(`shot-${selected}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selected]);

  const promptPlaceholder =
    idea.notes.length > 0
      ? "Brief the director: tone, length, what the viewer should feel, anything the shots must include…"
      : "Add a few notes first, then brief the director here.";

  return (
    <main className="nest">
      <div className="nest-bar">
        <Link to="/" className="back">← Nests</Link>
        <input
          className="nest-title"
          value={idea.title}
          onChange={(e) => actions.updateIdea(idea.id, { title: e.target.value })}
          aria-label="Idea title"
        />
        <select
          className="status-select"
          value={idea.status}
          onChange={(e) => actions.updateIdea(idea.id, { status: e.target.value as IdeaStatus })}
          aria-label="Status"
        >
          {IDEA_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <div className="mobile-tabs" role="tablist">
          <button className={mobileTab === "plan" ? "chip active" : "chip"} onClick={() => setMobileTab("plan")}>Plan</button>
          <button className={mobileTab === "frames" ? "chip active" : "chip"} onClick={() => setMobileTab("frames")}>
            Frames {shots.length > 0 && <span className="count">{shots.length}</span>}
          </button>
        </div>
      </div>

      <div className={`split tab-${mobileTab}`}>
        <aside className="plan">
          <NotesPanel idea={idea} />

          <section className="panel">
            <header className="panel-head">
              <h2>Storyboard brief</h2>
              {idea.storyboard.mode && <span className={`badge ${idea.storyboard.mode === "live" ? "ok" : "warn"}`}>{idea.storyboard.mode}</span>}
            </header>
            <textarea
              className="brief"
              rows={4}
              value={idea.storyboard.prompt}
              onChange={(e) => actions.setPrompt(idea.id, e.target.value)}
              placeholder={promptPlaceholder}
              aria-label="Storyboard brief"
            />
            <div className="row">
              <button className="primary" onClick={planStoryboard} disabled={planning || (idea.notes.length === 0 && !idea.storyboard.prompt.trim())}>
                {planning ? "Planning…" : shots.length ? "Re-develop storyboard" : "Develop storyboard"}
              </button>
              {shots.length > 0 && (
                <button onClick={() => renderAll(shots)} disabled={rendering}>
                  {rendering ? "Rendering…" : "Render all frames"}
                </button>
              )}
            </div>
            {error && <p className="error-text">{error}</p>}
            {shots.length > 0 && (
              <div className="plan-summary">
                <p><strong>Hook:</strong> {idea.storyboard.hook}</p>
                <p><strong>Logline:</strong> {idea.storyboard.logline}</p>
                <p className="muted">{shots.length} shots · ~{totalSecs}s</p>
              </div>
            )}
          </section>

          <section className="panel">
            <header className="panel-head">
              <h2>Shots</h2>
              <button className="ghost" onClick={() => actions.addShot(idea.id)}>+ Add shot</button>
            </header>
            {shots.length === 0 && <p className="muted">No shots yet. Develop the storyboard or add one by hand.</p>}
            <div className="shot-list">
              {shots.map((shot, i) => (
                <ShotCard
                  key={shot.id}
                  shot={shot}
                  index={i}
                  total={shots.length}
                  selected={selected === shot.id}
                  onSelect={() => setSelected(shot.id)}
                  onChange={(patch) => actions.updateShot(idea.id, shot.id, patch)}
                  onRender={() => renderShot(shot, i)}
                  onMove={(dir) => actions.moveShot(idea.id, shot.id, dir)}
                  onRemove={() => actions.removeShot(idea.id, shot.id)}
                />
              ))}
            </div>
          </section>
        </aside>

        <section className="canvas" aria-label="Storyboard frames">
          <FrameGrid shots={shots} selectedId={selected} onSelect={(sid) => { setSelected(sid); setMobileTab("plan"); }} onRender={renderShot} />
        </section>
      </div>
    </main>
  );
}
