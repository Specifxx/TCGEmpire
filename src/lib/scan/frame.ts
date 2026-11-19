// The live viewfinder's eyes (DECISIONS.md 2026-11-19 "Card scanner v2: live viewfinder"). Pure functions over a small
// grayscale copy of each video frame (about 180 px wide, ~8 a second), so they run in the browser in well under a
// millisecond and are tested in Node. Nothing here sends anything anywhere: only the frame the scanner finally captures
// goes to /api/scan/identify, exactly as a photo did before.
//
// "Aligned" is read from the card's own border: a card held inside the on-screen frame has a strong edge (card against
// table, hand or binder) just inside each side of the guide. Each side lights up on its own, so the visitor sees which
// way to move. Auto-capture needs three sides of four (a thumb or a sleeve's edge can hide one), the picture sharp and
// the phone steady for a moment.

export interface Rect { x: number; y: number; w: number; h: number }

/** A Riftbound card is 63 x 88 mm. */
export const CARD_ASPECT = 63 / 88;

/** Luma from RGBA bytes (ImageData.data). */
export function toGray(rgba: ArrayLike<number>, w: number, h: number): Float32Array {
  const g = new Float32Array(w * h);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) g[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
  return g;
}

/**
 * The guide's rectangle in the video's own pixels, when the video fills its box with object-fit: cover.
 * `guide` is in the box's CSS pixels.
 */
export function guideInVideo(video: { w: number; h: number }, box: { w: number; h: number }, guide: Rect): Rect {
  const k = Math.max(box.w / video.w, box.h / video.h);
  const ox = (video.w * k - box.w) / 2;
  const oy = (video.h * k - box.h) / 2;
  return { x: (guide.x + ox) / k, y: (guide.y + oy) / k, w: guide.w / k, h: guide.h / k };
}

/** The on-screen guide: the largest card-shaped rectangle that leaves a margin in the box. */
export function guideRect(box: { w: number; h: number }, fill = 0.8): Rect {
  let h = box.h * fill;
  let w = h * CARD_ASPECT;
  if (w > box.w * fill) {
    w = box.w * fill;
    h = w / CARD_ASPECT;
  }
  return { x: (box.w - w) / 2, y: (box.h - h) / 2, w, h };
}

export function scaleRect(r: Rect, k: number): Rect {
  return { x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k };
}

const clampI = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));

/** Variance of the Laplacian inside `r`: high when the print is in focus. */
export function sharpness(g: Float32Array, w: number, h: number, r: Rect): number {
  const x0 = clampI(r.x, 1, w - 2), x1 = clampI(r.x + r.w, 1, w - 2);
  const y0 = clampI(r.y, 1, h - 2), y1 = clampI(r.y + r.h, 1, h - 2);
  let n = 0, s = 0, s2 = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * w + x;
      const l = g[i - 1] + g[i + 1] + g[i - w] + g[i + w] - 4 * g[i];
      s += l; s2 += l * l; n++;
    }
  }
  if (!n) return 0;
  const m = s / n;
  return s2 / n - m * m;
}

/** Mean absolute change between two frames of the same size, 0-255. */
export function motion(prev: Float32Array | null, cur: Float32Array): number {
  if (!prev || prev.length !== cur.length) return 255;
  let s = 0;
  for (let i = 0; i < cur.length; i++) s += Math.abs(cur[i] - prev[i]);
  return s / cur.length;
}

export interface SideScores { top: number; right: number; bottom: number; left: number }

/**
 * How strongly each side of `r` sits on an edge, in grey levels per pixel. For each side it takes the strongest
 * step across that side within a band of `band` px either way (the visitor's card is never exactly on the line), in
 * the middle 70% of the side (corners are rounded), and averages it along the side.
 */
export function sideEdges(g: Float32Array, w: number, h: number, r: Rect, band = 0): SideScores {
  const b = band || Math.max(2, Math.round(Math.min(r.w, r.h) * 0.06));
  const at = (x: number, y: number) => g[clampI(y, 0, h - 1) * w + clampI(x, 0, w - 1)];
  const along = (len: number) => {
    const a = Math.round(len * 0.15), z = Math.round(len * 0.85);
    return [a, Math.max(a + 1, z)] as const;
  };
  const horiz = (yLine: number) => {
    const [a, z] = along(r.w);
    let s = 0;
    for (let i = a; i < z; i++) {
      const x = r.x + i;
      let best = 0;
      for (let d = -b; d <= b; d++) best = Math.max(best, Math.abs(at(x, yLine + d + 1) - at(x, yLine + d - 1)));
      s += best;
    }
    return s / (z - a);
  };
  const vert = (xLine: number) => {
    const [a, z] = along(r.h);
    let s = 0;
    for (let i = a; i < z; i++) {
      const y = r.y + i;
      let best = 0;
      for (let d = -b; d <= b; d++) best = Math.max(best, Math.abs(at(xLine + d + 1, y) - at(xLine + d - 1, y)));
      s += best;
    }
    return s / (z - a);
  };
  return { top: horiz(r.y), bottom: horiz(r.y + r.h), left: vert(r.x), right: vert(r.x + r.w) };
}

export type Hint = "find" | "closer" | "steady" | "focus" | "ready";

export interface FrameVerdict {
  sides: { top: boolean; right: boolean; bottom: boolean; left: boolean };
  aligned: number;
  sharp: boolean;
  still: boolean;
  hint: Hint;
}

/** Thresholds, tuned on the synthetic frames in tests/scan-frame.test.ts; the real-phone tally will move them. */
export const FRAME_LIMITS = { edge: 18, sharp: 40, still: 6 } as const;

export function judgeFrame(edges: SideScores, sharpVar: number, moved: number, limits = FRAME_LIMITS): FrameVerdict {
  const sides = { top: edges.top >= limits.edge, right: edges.right >= limits.edge, bottom: edges.bottom >= limits.edge, left: edges.left >= limits.edge };
  const aligned = Number(sides.top) + Number(sides.right) + Number(sides.bottom) + Number(sides.left);
  const sharp = sharpVar >= limits.sharp;
  const still = moved <= limits.still;
  const hint: Hint = aligned < 2 ? "find" : aligned < 3 ? "closer" : !still ? "steady" : !sharp ? "focus" : "ready";
  return { sides, aligned, sharp, still, hint };
}

/** Auto-capture fires after this many "ready" frames in a row (~0.5 s at 8 frames a second). */
export const READY_FRAMES = 4;

export const HINT_COPY: Record<Hint, string> = {
  find: "Fit the card inside the frame",
  closer: "Line up the edges with the frame",
  steady: "Hold steady…",
  focus: "Hold still, focusing…",
  ready: "Got it",
};
