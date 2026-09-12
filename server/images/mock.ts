import type { ImageProvider } from "./provider.ts";

const PALETTES = [
  ["#ff2d55", "#ff9500"],
  ["#5e5ce6", "#32ade6"],
  ["#30d158", "#64d2ff"],
  ["#ffd60a", "#ff375f"],
  ["#bf5af2", "#ff2d55"],
  ["#0a84ff", "#5e5ce6"],
];

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function wrap(text: string, max = 26, lines = 5): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max) {
      out.push(cur.trim());
      cur = w;
    } else cur = (cur + " " + w).trim();
    if (out.length === lines) break;
  }
  if (cur && out.length < lines) out.push(cur);
  return out;
}

/**
 * Renders a labeled 9:16 SVG frame from the shot's image prompt.
 * No network, no keys; lets the UI be developed end to end.
 */
export const mockImageProvider: ImageProvider = {
  name: "mock",
  async generate(req) {
    const [a, b] = PALETTES[req.index % PALETTES.length];
    const lines = wrap(req.prompt.replace(/vertical 9:16 storyboard frame\.?$/i, "").trim());
    const textEls = lines
      .map((l, i) => `<text x="40" y="${560 + i * 44}" font-size="30" fill="rgba(255,255,255,.92)">${esc(l)}</text>`)
      .join("");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960" viewBox="0 0 540 960">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect width="540" height="960" fill="url(#g)"/>
<rect x="24" y="24" width="492" height="912" rx="28" fill="rgba(0,0,0,.35)" stroke="rgba(255,255,255,.35)" stroke-width="2"/>
<text x="40" y="96" font-size="72" font-weight="800" fill="#fff" font-family="ui-sans-serif,system-ui">${String(req.index + 1).padStart(2, "0")}</text>
<text x="40" y="150" font-size="26" fill="rgba(255,255,255,.75)" font-family="ui-sans-serif,system-ui">${esc(req.shotType.toUpperCase())}</text>
<text x="40" y="500" font-size="40" font-weight="700" fill="#fff" font-family="ui-sans-serif,system-ui">${esc(req.shotTitle.slice(0, 22))}</text>
<g font-family="ui-sans-serif,system-ui">${textEls}</g>
<text x="40" y="900" font-size="22" fill="rgba(255,255,255,.55)" font-family="ui-sans-serif,system-ui">mock frame · swap IMAGE_PROVIDER for real renders</text>
</svg>`;
    return {
      src: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
      provider: "mock",
    };
  },
};
