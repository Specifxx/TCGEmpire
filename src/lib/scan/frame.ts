// The live viewfinder's eyes (DECISIONS.md 2026-11-19 "Card scanner v2: live viewfinder"). Pure functions over a small
// grayscale copy of each video frame (about 180 px wide, ~8 a second), so they run in the browser in well under a
// millisecond and are tested in Node. Nothing here sends anything anywhere: only the frame the scanner finally captures
// goes to /api/scan/identify, exactly as a photo did before.
//
// detectCard finds the card anywhere in the picture (owner, 2026-11-19: "it should still be able to auto frame and detect
// a card"): a card's border is a strong straight edge against the table, hand or binder, so the rows and columns with the
// most edge make peaks, and the best card-shaped rectangle on those peaks (63:88, at least a quarter of the frame tall,
// three or four sides on a real edge) is the card. The viewfinder outlines it as it moves and captures it once it holds
// still and sharp. A card turned more than about 10 degrees is not found; the shutter button still takes it.

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

export interface Detection {
  rect: Rect;
  sides: { top: boolean; right: boolean; bottom: boolean; left: boolean };
  /** Mean edge strength over the lit sides. */
  strength: number;
}

function peaks(profile: Float32Array, n: number, gap: number): number[] {
  const idx: number[] = [];
  for (let i = 1; i < profile.length - 1; i++) if (profile[i] >= profile[i - 1] && profile[i] >= profile[i + 1] && profile[i] > 0) idx.push(i);
  idx.sort((a, b) => profile[b] - profile[a]);
  const out: number[] = [];
  for (const i of idx) {
    if (out.every((j) => Math.abs(j - i) >= gap)) out.push(i);
    if (out.length >= n) break;
  }
  return out;
}

/**
 * The card in a grey frame, or null. Axis-aligned rectangles only (a card turned a little still sits on its peaks).
 * `minHeight` is the smallest card worth finding, as a share of the frame's height.
 */
export function detectCard(g: Float32Array, w: number, h: number, opts: { edge?: number; minHeight?: number; aspectTol?: number } = {}): Detection | null {
  const edge = opts.edge ?? FRAME_LIMITS.edge;
  const minH = (opts.minHeight ?? 0.28) * h;
  const tol = opts.aspectTol ?? 0.16;
  const rows = new Float32Array(h);
  const cols = new Float32Array(w);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gy = Math.abs(g[i + w] - g[i - w]);
      const gx = Math.abs(g[i + 1] - g[i - 1]);
      // only steps that clear the edge threshold count, so table grain does not build peaks
      if (gy >= edge) rows[y] += gy;
      if (gx >= edge) cols[x] += gx;
    }
  }
  const gap = Math.max(3, Math.round(h * 0.03));
  const ys = peaks(rows, 12, gap).sort((a, b) => a - b);
  const xs = peaks(cols, 12, gap).sort((a, b) => a - b);
  const found: { det: Detection; score: number; area: number }[] = [];
  for (let a = 0; a < ys.length; a++) {
    for (let b = a + 1; b < ys.length; b++) {
      const rh = ys[b] - ys[a];
      if (rh < minH) continue;
      const want = rh * CARD_ASPECT;
      for (let c = 0; c < xs.length; c++) {
        for (let d = c + 1; d < xs.length; d++) {
          const rw = xs[d] - xs[c];
          if (Math.abs(rw - want) > want * tol) continue;
          const rect = { x: xs[c], y: ys[a], w: rw, h: rh };
          const e = sideEdges(g, w, h, rect, 1);
          const sides = { top: e.top >= edge, right: e.right >= edge, bottom: e.bottom >= edge, left: e.left >= edge };
          const litVals = [e.top, e.right, e.bottom, e.left].filter((v) => v >= edge);
          if (litVals.length < 3) continue;
          // a rectangle is only as real as its faintest lit edge
          const score = Math.min(...litVals);
          found.push({ det: { rect, sides, strength: litVals.reduce((s2, v) => s2 + v, 0) / litVals.length }, score, area: rw * rh });
        }
      }
    }
  }
  if (!found.length) return null;
  // The frame printed inside a card is often a sharper line than the card's own border, so among the rectangles that
  // are nearly as convincing as the best one, the LARGEST is the card.
  const top = Math.max(...found.map((f) => f.score));
  const best = found.filter((f) => f.score >= top * 0.45).sort((p, q) => q.area - p.area)[0];
  return best.det;
}

/** How far a rectangle moved between frames, as a share of its height (0 = not at all). */
export function rectShift(a: Rect | null, b: Rect | null): number {
  if (!a || !b) return 1;
  return (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.x + a.w - b.x - b.w) + Math.abs(a.y + a.h - b.y - b.h)) / 4 / Math.max(1, b.h);
}

export type DetectHint = "find" | "closer" | "steady" | "focus" | "ready";

/** The verdict on one frame with detection: the hint, and whether this frame counts towards auto-capture. */
export function judgeDetection(
  det: Detection | null,
  frameH: number,
  sharpVar: number,
  moved: number,
  shift: number,
  limits = FRAME_LIMITS,
): { hint: DetectHint; ready: boolean } {
  if (!det) return { hint: "find", ready: false };
  if (det.rect.h < frameH * 0.4) return { hint: "closer", ready: false };
  if (moved > limits.still || shift > 0.04) return { hint: "steady", ready: false };
  if (sharpVar < limits.sharp) return { hint: "focus", ready: false };
  return { hint: "ready", ready: true };
}

export const DETECT_COPY: Record<DetectHint, string> = {
  find: "Point the camera at a card",
  closer: "Move a little closer",
  steady: "Hold steady…",
  focus: "Hold still, focusing…",
  ready: "Got it",
};
