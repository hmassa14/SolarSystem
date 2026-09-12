import type { Shot } from "../types.ts";

interface Props {
  shots: Shot[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRender: (shot: Shot, index: number) => void;
}

export default function FrameGrid({ shots, selectedId, onSelect, onRender }: Props) {
  if (shots.length === 0) {
    return (
      <div className="frames-empty">
        <div className="phone-outline">
          <p>Your storyboard frames will appear here, one 9:16 frame per shot.</p>
          <p className="muted">Add notes on the left, write a brief, then hit <strong>Develop storyboard</strong>.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="frames">
      {shots.map((shot, i) => {
        const st = shot.image.status;
        return (
          <figure
            key={shot.id}
            className={`frame ${selectedId === shot.id ? "selected" : ""} frame-${st}`}
            onClick={() => onSelect(shot.id)}
          >
            <div className="frame-img">
              {st === "done" && shot.image.src ? (
                <img src={shot.image.src} alt={`Frame ${i + 1}: ${shot.title}`} loading="lazy" />
              ) : (
                <div className="frame-placeholder">
                  <span className="frame-num">{String(i + 1).padStart(2, "0")}</span>
                  {st === "loading" && <span className="spinner" aria-label="Rendering" />}
                  {st === "idle" && (
                    <button
                      className="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRender(shot, i);
                      }}
                    >
                      Render
                    </button>
                  )}
                  {st === "error" && <span className="error-text">{shot.image.error ?? "Failed"}</span>}
                </div>
              )}
              <span className="frame-dur">{shot.durationSeconds}s</span>
            </div>
            <figcaption>
              <strong>{String(i + 1).padStart(2, "0")} · {shot.title}</strong>
              <span className="muted">{shot.shotType} · {shot.cameraMovement}</span>
              {shot.onScreenText && <span className="frame-text">“{shot.onScreenText}”</span>}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
