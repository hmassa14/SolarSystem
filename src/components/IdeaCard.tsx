import { Link } from "react-router-dom";
import type { Idea } from "../types.ts";
import { statusLabel, useIdeas } from "../store/ideas.ts";

export default function IdeaCard({ idea }: { idea: Idea }) {
  const removeIdea = useIdeas((s) => s.removeIdea);
  const shots = idea.storyboard.shots;
  const framed = shots.filter((s) => s.image.status === "done").length;
  const cover = shots.find((s) => s.image.status === "done")?.image.src;

  return (
    <article className={`idea-card status-${idea.status}`}>
      <Link to={`/nest/${idea.id}`} className="idea-card-link">
        <div className="idea-cover" style={cover ? { backgroundImage: `url("${cover}")` } : undefined}>
          {!cover && <span className="idea-cover-empty">{shots.length ? `${shots.length} shots planned` : "no storyboard yet"}</span>}
        </div>
        <div className="idea-body">
          <div className="idea-title-row">
            <h3>{idea.title}</h3>
            <span className={`pill pill-${idea.status}`}>{statusLabel(idea.status)}</span>
          </div>
          <p className="idea-meta">
            {idea.notes.length} note{idea.notes.length === 1 ? "" : "s"}
            {shots.length > 0 && <> · {framed}/{shots.length} frames</>}
          </p>
          {idea.notes[0] && <p className="idea-preview">{idea.notes[0].text}</p>}
        </div>
      </Link>
      <button
        className="icon-btn idea-delete"
        aria-label={`Delete ${idea.title}`}
        onClick={() => {
          if (confirm(`Delete "${idea.title}" and its storyboard?`)) removeIdea(idea.id);
        }}
      >
        ×
      </button>
    </article>
  );
}
