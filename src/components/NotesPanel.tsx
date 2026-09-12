import { useState, type KeyboardEvent } from "react";
import type { Idea } from "../types.ts";
import { useIdeas } from "../store/ideas.ts";

export default function NotesPanel({ idea }: { idea: Idea }) {
  const addNote = useIdeas((s) => s.addNote);
  const updateNote = useIdeas((s) => s.updateNote);
  const removeNote = useIdeas((s) => s.removeNote);
  const [draft, setDraft] = useState("");

  function commit() {
    if (!draft.trim()) return;
    addNote(idea.id, draft);
    setDraft("");
  }
  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      commit();
    }
  }

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Notes</h2>
        <span className="count">{idea.notes.length}</span>
      </header>
      <ul className="notes">
        {idea.notes.map((n) => (
          <li key={n.id} className="note">
            <textarea
              value={n.text}
              rows={Math.min(6, Math.max(1, Math.ceil(n.text.length / 48)))}
              onChange={(e) => updateNote(idea.id, n.id, e.target.value)}
              aria-label="Note"
            />
            <button className="icon-btn" aria-label="Delete note" onClick={() => removeNote(idea.id, n.id)}>×</button>
          </li>
        ))}
      </ul>
      <div className="note-add">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          placeholder="Add a note… (⌘/Ctrl + Enter to save)"
          rows={2}
          aria-label="New note"
        />
        <button onClick={commit} disabled={!draft.trim()}>Add</button>
      </div>
    </section>
  );
}
