// The live viewfinder's frame checks (lib/scan/frame.ts, DECISIONS.md 2026-11-19 "Card scanner v2"), on synthetic
// frames: a card-coloured rectangle on a table, moved, blurred and shaken.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CARD_ASPECT, guideInVideo, guideRect, judgeFrame, motion, sharpness, sideEdges, toGray, type Rect } from "../src/lib/scan/frame";

const W = 180, H = 240;
const box = { w: W, h: H };
const guide = guideRect(box);

/** A frame: table grey 60, a card of grey 200 at `card`, with printed detail (stripes) inside, optional blur. */
function frame(card: Rect | null, opts: { blur?: number; noise?: number; seed?: number } = {}): Float32Array {
  const g = new Float32Array(W * H).fill(60);
  let s = opts.seed ?? 1;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  if (card) {
    for (let y = Math.round(card.y); y < Math.round(card.y + card.h); y++)
      for (let x = Math.round(card.x); x < Math.round(card.x + card.w); x++)
        if (x >= 0 && y >= 0 && x < W && y < H) g[y * W + x] = (Math.floor((y - card.y) / 4) + Math.floor((x - card.x) / 3)) % 2 ? 200 : 120;
  }
  if (opts.noise) for (let i = 0; i < g.length; i++) g[i] += (rnd() - 0.5) * opts.noise;
  for (let pass = 0; pass < (opts.blur ?? 0); pass++) {
    const c = g.slice();
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      g[i] = (c[i] * 4 + c[i - 1] + c[i + 1] + c[i - W] + c[i + W]) / 8;
    }
  }
  return g;
}

const judge = (g: Float32Array, prev: Float32Array | null = g) => judgeFrame(sideEdges(g, W, H, guide), sharpness(g, W, H, guide), motion(prev, g));

test("the guide is card-shaped and centred", () => {
  assert.ok(Math.abs(guide.w / guide.h - CARD_ASPECT) < 1e-9);
  assert.ok(Math.abs(guide.x * 2 + guide.w - W) < 1e-9 && Math.abs(guide.y * 2 + guide.h - H) < 1e-9);
  assert.ok(guide.w <= W * 0.8 + 1e-9 && guide.h <= H * 0.8 + 1e-9);
});

test("a card inside the frame, sharp and still, is ready", () => {
  const v = judge(frame(guide));
  assert.equal(v.aligned, 4);
  assert.equal(v.hint, "ready");
});

test("a card a little off the line still counts; a card well off it does not", () => {
  const near = { ...guide, x: guide.x + 3, y: guide.y - 2 };
  assert.equal(judge(frame(near)).hint, "ready");
  const small = { x: guide.x + guide.w * 0.25, y: guide.y + guide.h * 0.25, w: guide.w * 0.5, h: guide.h * 0.5 };
  assert.equal(judge(frame(small)).hint, "find");
});

test("an empty table never captures", () => {
  assert.equal(judge(frame(null, { noise: 6 })).hint, "find");
});

test("a thumb over one side still captures; two sides off asks to line up", () => {
  const g = frame(guide);
  // a thumb (table-grey) over the bottom edge
  for (let y = Math.round(guide.y + guide.h - 12); y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = 60;
  const v = judge(g);
  assert.equal(v.sides.bottom, false);
  assert.equal(v.hint, "ready");
  const shifted = { ...guide, x: guide.x + guide.w * 0.3, y: guide.y + guide.h * 0.2 };
  assert.ok(["find", "closer"].includes(judge(frame(shifted)).hint));
});

test("a shaking phone waits, a blurred one waits for focus", () => {
  const a = frame(guide);
  const b = frame({ ...guide, x: guide.x + 4 });
  assert.equal(judge(b, a).hint, "steady");
  assert.equal(judge(frame(guide, { blur: 20 })).hint, "focus");
});

test("guideInVideo maps the on-screen frame onto the video's own pixels (object-fit: cover)", () => {
  // 1280x720 landscape video shown in a 300x400 portrait box: scale 400/720, the sides are cropped
  const r = guideInVideo({ w: 1280, h: 720 }, { w: 300, h: 400 }, { x: 0, y: 0, w: 300, h: 400 });
  assert.ok(Math.abs(r.h - 720) < 1e-6);
  assert.ok(Math.abs(r.x - (1280 - 300 * 720 / 400) / 2) < 1e-6);
});

test("the viewfinder only asks for the camera on /scan and still never calls eBay", () => {
  const cfg = readFileSync(join(process.cwd(), "next.config.js"), "utf8");
  assert.match(cfg, /camera=\(\), microphone=\(\), geolocation=\(\)/, "every other page keeps the camera off");
  assert.match(cfg, /source: "\/:page\(scan\)", headers: \[\{ key: "Permissions-Policy", value: "camera=\(self\)/);
  for (const f of ["src/lib/scan/frame.ts", "src/components/scan/CardScanner.tsx", "src/components/scan/Viewfinder.tsx"]) {
    const src = readFileSync(join(process.cwd(), f), "utf8");
    assert.doesNotMatch(src, /api\.ebay|lib\/ebay|EBAY_/i, f);
  }
});

// ── detection: the card anywhere in the picture (owner, 2026-11-19: "auto frame and detect a card") ──
import { detectCard, judgeDetection, rectShift } from "../src/lib/scan/frame";
import sharp from "sharp";

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

test("detectCard finds a card off-centre, at different sizes, and nothing on an empty table", () => {
  for (const [cx, cy, ch] of [[90, 120, 180], [60, 100, 120], [120, 140, 150], [90, 120, 205]] as const) {
    const cw = ch * CARD_ASPECT;
    const card = { x: cx - cw / 2, y: cy - ch / 2, w: cw, h: ch };
    const d = detectCard(frame(card, { noise: 8 }), W, H);
    assert.ok(d, `card at ${cx},${cy} h${ch}`);
    assert.ok(near(d.rect.y, card.y, 4) && near(d.rect.h, card.h, 6) && near(d.rect.x, card.x, 4) && near(d.rect.w, card.w, 6), JSON.stringify({ d: d.rect, card }));
  }
  assert.equal(detectCard(frame(null, { noise: 8 }), W, H), null);
});

async function realFrame(file: string, card: Rect, opts: { blur?: number } = {}): Promise<Float32Array> {
  // a wood-ish table with grain, the real card image composited at `card` (analysis pixels, scaled up 4x)
  const k = 4, TW = W * k, TH = H * k;
  const raw = Buffer.alloc(TW * TH * 3);
  let s = 3;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < TW * TH; i++) {
    const n = (rnd() - 0.5) * 22 + Math.sin((i % TW) / 11 + Math.floor(i / TW) / 50) * 8;
    raw[i * 3] = 112 + n; raw[i * 3 + 1] = 84 + n; raw[i * 3 + 2] = 62 + n;
  }
  const art = await sharp(file).resize(Math.round(card.w * k), Math.round(card.h * k)).toBuffer();
  let img = sharp(await sharp(raw, { raw: { width: TW, height: TH, channels: 3 } }).composite([{ input: art, left: Math.round(card.x * k), top: Math.round(card.y * k) }]).png().toBuffer()).resize(W, H);
  if (opts.blur) img = img.blur(opts.blur);
  const { data } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return toGray(data, W, H);
}

test("detectCard frames real Riftbound card images on a grainy table", async () => {
  const dir = join(process.cwd(), "public/card-art");
  const files = ["ogn-007-298-868b5cd63536371d-480w.webp", "ogn-001-298-8de89b4b8fb3186d-480w.webp", "ogn-004-298-e3bced44dfd99515-480w.webp"];
  for (const [i, f] of files.entries()) {
    const ch = [170, 140, 200][i];
    const cw = ch * CARD_ASPECT;
    const card = { x: [20, 70, 45][i], y: [30, 60, 20][i], w: cw, h: ch };
    const g = await realFrame(join(dir, f), card);
    const d = detectCard(g, W, H);
    assert.ok(d, f);
    assert.ok(rectShift(d.rect, card) < 0.04, `${f}: ${JSON.stringify(d.rect)} vs ${JSON.stringify(card)}`);
    const v = judgeDetection(d, H, sharpness(g, W, H, d.rect), 0, 0);
    assert.equal(v.hint, "ready", f);
    const blurred = await realFrame(join(dir, f), card, { blur: 4 });
    const db = detectCard(blurred, W, H);
    if (db) assert.equal(judgeDetection(db, H, sharpness(blurred, W, H, db.rect), 0, 0).hint, "focus", `${f} blurred`);
  }
});

test("judgeDetection: too small asks to come closer, moving asks to hold steady", () => {
  const det = { rect: { x: 10, y: 10, w: 40, h: 56 }, sides: { top: true, right: true, bottom: true, left: true }, strength: 50 };
  assert.equal(judgeDetection(det, 240, 500, 0, 0).hint, "closer");
  const big = { ...det, rect: { x: 10, y: 10, w: 120, h: 168 } };
  assert.equal(judgeDetection(big, 240, 500, 20, 0).hint, "steady");
  assert.equal(judgeDetection(big, 240, 500, 0, 0.1).hint, "steady");
  assert.equal(judgeDetection(big, 240, 500, 0, 0).hint, "ready");
  assert.equal(judgeDetection(null, 240, 500, 0, 0).hint, "find");
});
