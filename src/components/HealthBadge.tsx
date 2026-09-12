import { useEffect, useState } from "react";
import type { HealthResponse } from "../../shared/schema.ts";
import { api } from "../lib/api.ts";

export default function HealthBadge() {
  const [health, setHealth] = useState<HealthResponse | null | "down">(null);

  useEffect(() => {
    let cancelled = false;
    api
      .health()
      .then((h) => !cancelled && setHealth(h))
      .catch(() => !cancelled && setHealth("down"));
    return () => {
      cancelled = true;
    };
  }, []);

  if (health === null) return <span className="badge muted">connecting…</span>;
  if (health === "down") return <span className="badge danger" title="Start the API with `npm run dev`">API offline</span>;
  return (
    <span className={`badge ${health.ai === "live" ? "ok" : "warn"}`} title={`Planner: ${health.model}\nImages: ${health.imageProvider}`}>
      {health.ai === "live" ? "Claude live" : "Mock mode"} · images: {health.imageProvider}
    </span>
  );
}
