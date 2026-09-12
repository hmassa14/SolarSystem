import type { Shot } from "../types.ts";

interface Props {
  shot: Shot;
  index: number;
  total: number;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<Omit<Shot, "id" | "image">>) => void;
  onRender: () => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}

export default function ShotCard({ shot, index, total, selected, onSelect, onChange, onRender, onMove, onRemove }: Props) {
  const busy = shot.image.status === "loading";
  return (
    <article id={`shot-${shot.id}`} className={`shot ${selected ? "selected" : ""}`} onClick={onSelect}>
      <header className="shot-head">
        <span className="shot-num">{String(index + 1).padStart(2, "0")}</span>
        <input
          className="shot-title"
          value={shot.title}
          onChange={(e) => onChange({ title: e.target.value })}
          aria-label="Shot title"
        />
        <div className="shot-actions" onClick={(e) => e.stopPropagation()}>
          <button className="icon-btn" disabled={index === 0} onClick={() => onMove(-1)} aria-label="Move up">↑</button>
          <button className="icon-btn" disabled={index === total - 1} onClick={() => onMove(1)} aria-label="Move down">↓</button>
          <button className="icon-btn" onClick={onRemove} aria-label="Remove shot">×</button>
        </div>
      </header>

      <label className="field">
        <span>What happens</span>
        <textarea rows={2} value={shot.description} onChange={(e) => onChange({ description: e.target.value })} />
      </label>

      <div className="field-row">
        <label className="field">
          <span>Shot type</span>
          <input value={shot.shotType} onChange={(e) => onChange({ shotType: e.target.value })} />
        </label>
        <label className="field">
          <span>Camera</span>
          <input value={shot.cameraMovement} onChange={(e) => onChange({ cameraMovement: e.target.value })} />
        </label>
        <label className="field field-sm">
          <span>Secs</span>
          <input
            type="number"
            min={0}
            step={0.5}
            value={shot.durationSeconds}
            onChange={(e) => onChange({ durationSeconds: Number(e.target.value) })}
          />
        </label>
      </div>

      <div className="field-row">
        <label className="field">
          <span>On-screen text</span>
          <input value={shot.onScreenText} onChange={(e) => onChange({ onScreenText: e.target.value })} />
        </label>
        <label className="field">
          <span>Audio / VO</span>
          <input value={shot.audioNotes} onChange={(e) => onChange({ audioNotes: e.target.value })} />
        </label>
      </div>

      <label className="field field-tips">
        <span>How to film it</span>
        <textarea rows={3} value={shot.filmingTips} onChange={(e) => onChange({ filmingTips: e.target.value })} />
      </label>

      <label className="field">
        <span>Image prompt</span>
        <textarea rows={2} value={shot.imagePrompt} onChange={(e) => onChange({ imagePrompt: e.target.value })} />
      </label>

      <footer className="shot-foot" onClick={(e) => e.stopPropagation()}>
        <button onClick={onRender} disabled={busy}>
          {busy ? "Rendering…" : shot.image.status === "done" ? "Re-render frame" : "Render frame"}
        </button>
        {shot.image.status === "error" && <span className="error-text">{shot.image.error}</span>}
      </footer>
    </article>
  );
}
