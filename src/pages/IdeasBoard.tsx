import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useIdeas } from "../store/ideas.ts";
import IdeaCard from "../components/IdeaCard.tsx";
import { IDEA_STATUSES, type IdeaStatus } from "../types.ts";

export default function IdeasBoard() {
  const ideas = useIdeas((s) => s.ideas);
  const addIdea = useIdeas((s) => s.addIdea);
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState<IdeaStatus | "all">("all");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() && !note.trim()) return;
    const idea = addIdea(title || note.slice(0, 40), note);
    setTitle("");
    setNote("");
    navigate(`/nest/${idea.id}`);
  }

  const visible = filter === "all" ? ideas : ideas.filter((i) => i.status === filter);

  return (
    <main className="board">
      <section className="capture">
        <h1>Drop an idea in the nest</h1>
        <p className="lede">
          Capture the half-formed TikTok idea now. Open the nest later to turn notes into a shot-by-shot storyboard
          you can actually film.
        </p>
        <form onSubmit={submit} className="capture-form">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Working title (optional)"
            aria-label="Working title"
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="First note: the hook, the moment, the thing you saw…"
            aria-label="First note"
            rows={3}
          />
          <button type="submit" className="primary">Create nest</button>
        </form>
      </section>

      <section className="nests">
        <div className="nests-head">
          <h2>Nests <span className="count">{ideas.length}</span></h2>
          <div className="filters" role="tablist">
            <button className={filter === "all" ? "chip active" : "chip"} onClick={() => setFilter("all")}>All</button>
            {IDEA_STATUSES.map((s) => (
              <button key={s.value} className={filter === s.value ? "chip active" : "chip"} onClick={() => setFilter(s.value)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        {visible.length === 0 ? (
          <p className="empty">Nothing here yet. Add an idea above.</p>
        ) : (
          <div className="idea-grid">
            {visible.map((idea) => (
              <IdeaCard key={idea.id} idea={idea} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
