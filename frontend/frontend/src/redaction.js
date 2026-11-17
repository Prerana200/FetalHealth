// Rectangle maths for the blackout tool. All values are in image pixels.

export const MIN_BOX = 4;

// A rectangle from two opposite corners, whichever way the user dragged.
export function rectFromPoints(a, b) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

// Keeps a rectangle inside the image and rounds it to whole pixels.
export function clampRect(r, W, H) {
  const edge = (v, max) => Math.round(Math.max(0, Math.min(v, max)));
  const x = edge(r.x, W);
  const y = edge(r.y, H);
  return { x, y, w: edge(r.x + r.w, W) - x, h: edge(r.y + r.h, H) - y };
}

export const isUsable = (r) => r.w >= MIN_BOX && r.h >= MIN_BOX;

// A full-width strip across the top or bottom, where names and dates are usually burned in.
export function presetBox(kind, W, H) {
  const h = Math.round(H * 0.12);
  return kind === "top" ? { x: 0, y: 0, w: W, h } : { x: 0, y: H - h, w: W, h };
}