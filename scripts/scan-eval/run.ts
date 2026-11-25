// Card scanner accuracy eval (DECISIONS.md 2026-11-19 "Card scanner beta"). Runs in GitHub Actions only
// (scan-eval.yml): the card image CDNs are not reachable from the agents' container.
//
// For a fixed, seeded sample of Riftbound cards it downloads the official image, makes phone-photo versions of it
// (tilted on a table, glare, dim light, a foil-like sheen, far away and small), and sends every image through the
// SAME code production runs (lib/scan/read.ts, then lib/scan/match.ts against the whole catalogue). It reports
// what fraction came back as the right printing, the right card name, inside the "Wrong card?" picker, and how
// often a WRONG card came back marked "Match" (the number that matters most). Real numbers only: every figure in
// the summary is counted from results.json.
//
//   ANTHROPIC_API_KEY=… npx tsx scripts/scan-eval/run.ts     (EVAL_CARDS=100, EVAL_COMPARE=1 adds Sonnet 5.5 on the hard cases)
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { normName, type ScanCatalogCard } from "../../src/lib/scan/match";
import { SCAN_MODEL } from "../../src/lib/scan/read";
import { identifyCard } from "../../src/lib/scan/identify";

type Card = ScanCatalogCard & { externalId: string; imageUrl: string | null; orientation: string | null; type: string; rarity: string; isOvernumbered: boolean };
const ROOT = process.cwd();
const OUT = join(ROOT, "scripts/scan-eval/results");
const catalog: Card[] = JSON.parse(readFileSync(join(ROOT, "data/public/cards.json"), "utf8"));
// What production matches against (lib/scan/catalog.ts): the thumbnail stands in for the image in the twin check.
const scanCatalog: ScanCatalogCard[] = catalog.map((c) => ({ ...c, imageUrl: (c as Card & { imageThumbUrl?: string | null }).imageThumbUrl ?? c.imageUrl }));
const N = Number(process.env.EVAL_CARDS || 100);
const COMPARE = process.env.EVAL_COMPARE === "1";
const client = new Anthropic({ maxRetries: 3, timeout: 60_000 });

// ── the sample: seeded, stratified ──────────────────────────────────────────
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
}
const rand = rng(20261119);
const pick = <T,>(xs: T[], n: number) => [...xs].sort(() => rand() - 0.5).slice(0, n);
const suffix = (c: Card) => (c.collectorNumber.match(/^\d+([a-z*]?)/)?.[1] ?? "");
const withImg = catalog.filter((c) => c.imageUrl);
const strata: Record<string, Card[]> = {
  base: withImg.filter((c) => !c.isPromo && !suffix(c) && c.orientation !== "landscape" && c.type !== "Rune"),
  "alt art": withImg.filter((c) => /^[abc]$/.test(suffix(c))),
  "overnumbered / signature": withImg.filter((c) => suffix(c) === "*" || c.isOvernumbered),
  promo: withImg.filter((c) => c.isPromo),
  battlefield: withImg.filter((c) => c.orientation === "landscape"),
  rune: withImg.filter((c) => c.type === "Rune"),
};
const share: Record<string, number> = { base: 0.4, "alt art": 0.2, "overnumbered / signature": 0.12, promo: 0.13, battlefield: 0.1, rune: 0.05 };
const sample: { card: Card; stratum: string }[] = [];
for (const [k, xs] of Object.entries(strata)) for (const card of pick(xs, Math.round(N * share[k]))) sample.push({ card, stratum: k });

// ── phone-photo conditions ──────────────────────────────────────────────────
const W = 1024;
async function table(card: Buffer, opts: { angle: number; scale: number; bg: string }) {
  const meta = await sharp(card).metadata();
  const landscape = (meta.width ?? 1) > (meta.height ?? 1);
  const canvasW = landscape ? W : Math.round(W * 0.75);
  const canvasH = landscape ? Math.round(W * 0.75) : W;
  const target = Math.round(Math.max(canvasW, canvasH) * opts.scale);
  const rotated = await sharp(card).resize(landscape ? target : null, landscape ? null : target).rotate(opts.angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const rm = await sharp(rotated).metadata();
  const bg = await sharp({ create: { width: canvasW, height: canvasH, channels: 3, background: opts.bg } })
    .composite([{ input: Buffer.from(`<svg width="${canvasW}" height="${canvasH}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.35"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`) }])
    .png()
    .toBuffer();
  const left = Math.max(0, Math.round((canvasW - (rm.width ?? 0)) / 2 + (rand() - 0.5) * canvasW * 0.04));
  const top = Math.max(0, Math.round((canvasH - (rm.height ?? 0)) / 2 + (rand() - 0.5) * canvasH * 0.04));
  return sharp(bg).composite([{ input: rotated, left: Math.min(left, canvasW - 1), top: Math.min(top, canvasH - 1) }]).png().toBuffer();
}
const svg = (w: number, h: number, body: string) => Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`);
const jpeg = (b: Buffer | ReturnType<typeof sharp>, q: number) => (Buffer.isBuffer(b) ? sharp(b) : b).resize(W, W, { fit: "inside" }).jpeg({ quality: q }).toBuffer();

const CONDITIONS: Record<string, (img: Buffer) => Promise<Buffer>> = {
  clean: (img) => jpeg(img, 85),
  "tilted on a table": async (img) => jpeg(sharp(await table(img, { angle: -7, scale: 0.78, bg: "#6b4f3a" })).blur(0.6), 72),
  glare: async (img) => {
    const t = await table(img, { angle: 4, scale: 0.78, bg: "#2f3b45" });
    const m = await sharp(t).metadata();
    const w = m.width!, h = m.height!;
    const glare = svg(w, h, `<defs><radialGradient id="r" cx="0.62" cy="0.38" r="0.32"><stop offset="0" stop-color="#fff" stop-opacity="0.92"/><stop offset="0.55" stop-color="#fff" stop-opacity="0.45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#r)"/>`);
    return jpeg(sharp(t).composite([{ input: glare }]), 72);
  },
  "dim light": async (img) => jpeg(sharp(await table(img, { angle: 3, scale: 0.78, bg: "#3a3a3a" })).modulate({ brightness: 0.42, saturation: 0.8 }).blur(1.1), 55),
  "foil sheen": async (img) => {
    const t = await table(img, { angle: -3, scale: 0.78, bg: "#1f1f24" });
    const m = await sharp(t).metadata();
    const w = m.width!, h = m.height!;
    const foil = svg(w, h, `<defs><linearGradient id="f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff3cac"/><stop offset="0.3" stop-color="#ffd23c"/><stop offset="0.55" stop-color="#3cffb4"/><stop offset="0.8" stop-color="#3c8cff"/><stop offset="1" stop-color="#b43cff"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#f)" opacity="0.38"/>`);
    return jpeg(sharp(t).composite([{ input: foil, blend: "soft-light" }, { input: foil, blend: "over", top: 0, left: 0 }]).modulate({ brightness: 1.05 }), 72);
  },
  "far and small": async (img) => jpeg(sharp(await table(img, { angle: 12, scale: 0.42, bg: "#7a6a55" })).blur(0.5), 70),
};
const HARD = ["dim light", "far and small", "glare"];

// ── run ─────────────────────────────────────────────────────────────────────
interface Row { twinCheck?: string; calls?: number; card: string; externalId: string; stratum: string; condition: string; model: string; read: unknown; bestId: string | null; bestExt: string | null; confidence: string; exact: boolean; sameArt: boolean; nameRight: boolean; inPicker: boolean; ms: number; costUsd: number; error?: string }
const byId = new Map(catalog.map((c) => [c.id, c]));
async function fetchImage(url: string): Promise<Buffer | null> {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (r.ok) return Buffer.from(await r.arrayBuffer());
    } catch { /* retry */ }
  }
  return null;
}
async function pool<T>(xs: T[], n: number, f: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < xs.length) await f(xs[i++]); }));
}

async function main() {
  mkdirSync(join(OUT, "samples"), { recursive: true });
  const rows: Row[] = [];
  const skipped: string[] = [];
  const jobs: { card: Card; stratum: string; condition: string; model: string; img: Buffer }[] = [];
  let sampleShots = 0;
  for (const { card, stratum } of sample) {
    const raw = await fetchImage(card.imageUrl!);
    if (!raw) { skipped.push(card.externalId); continue; }
    for (const [cond, make] of Object.entries(CONDITIONS)) {
      const img = await make(raw);
      jobs.push({ card, stratum, condition: cond, model: SCAN_MODEL, img });
      if (COMPARE && HARD.includes(cond) && jobs.filter((j) => j.model !== SCAN_MODEL).length < 120) jobs.push({ card, stratum, condition: cond, model: "claude-sonnet-5-5", img });
      if (sampleShots < 12 && (stratum === "base" || stratum === "alt art")) {
        writeFileSync(join(OUT, "samples", `${card.externalId}-${cond.replace(/\W+/g, "-")}.jpg`), await sharp(img).resize(360, 360, { fit: "inside" }).jpeg({ quality: 70 }).toBuffer());
      }
    }
    sampleShots++;
  }
  console.log(`cards ${sample.length - skipped.length} (skipped ${skipped.length}), images ${jobs.length}`);
  let done = 0;
  await pool(jobs, 6, async (j) => {
    const truth = j.card;
    try {
      const m = await identifyCard(client, j.img.toString("base64"), scanCatalog, { model: j.model });
      const r = { reading: m.reading, ms: m.ms };
      const best = m.bestId ? byId.get(m.bestId) : undefined;
      const exact = m.bestId === truth.id;
      const sameArt = exact || (!!best && !!best.imageUrl && best.imageUrl === truth.imageUrl);
      rows.push({
        card: truth.name, externalId: truth.externalId, stratum: j.stratum, condition: j.condition, model: j.model, read: r.reading,
        bestId: m.bestId, bestExt: best?.externalId ?? null, confidence: m.confidence, exact, sameArt,
        nameRight: !!best && normName(best.name) === normName(truth.name),
        inPicker: exact || m.alternateIds.includes(truth.id), ms: r.ms, costUsd: m.costUsd, twinCheck: m.twinCheck, calls: m.calls,
      });
    } catch (e) {
      rows.push({ card: truth.name, externalId: truth.externalId, stratum: j.stratum, condition: j.condition, model: j.model, read: null, bestId: null, bestExt: null, confidence: "error", exact: false, sameArt: false, nameRight: false, inPicker: false, ms: 0, costUsd: 0, error: String((e as Error).message).slice(0, 200) });
    }
    if (++done % 50 === 0) console.log(`${done}/${jobs.length}`);
  });
  writeFileSync(join(OUT, "results.json"), JSON.stringify({ at: new Date().toISOString(), skipped, rows }, null, 1));
  writeFileSync(join(OUT, "summary.md"), summarise(rows, skipped));
  console.log(readFileSync(join(OUT, "summary.md"), "utf8"));
}

function pct(n: number, d: number) { return d ? `${((100 * n) / d).toFixed(1)}%` : "n/a"; }
function table2(title: string, groups: Map<string, Row[]>) {
  let s = `\n### ${title}\n\n| | images | right printing | right card (any printing) | in the "Wrong card?" picker | wrong card marked "Match" |\n|---|---:|---:|---:|---:|---:|\n`;
  for (const [k, rs] of groups) {
    s += `| ${k} | ${rs.length} | ${pct(rs.filter((r) => r.sameArt).length, rs.length)} | ${pct(rs.filter((r) => r.nameRight).length, rs.length)} | ${pct(rs.filter((r) => r.inPicker || r.sameArt).length, rs.length)} | ${pct(rs.filter((r) => r.confidence === "high" && !r.sameArt).length, rs.length)} |\n`;
  }
  return s;
}
function groupBy(rows: Row[], f: (r: Row) => string) {
  const m = new Map<string, Row[]>();
  for (const r of rows) m.set(f(r), [...(m.get(f(r)) ?? []), r]);
  return m;
}
function summarise(all: Row[], skipped: string[]) {
  const h = all.filter((r) => r.model === SCAN_MODEL);
  const ms = h.filter((r) => r.ms).map((r) => r.ms).sort((a, b) => a - b);
  const q = (p: number) => ms[Math.min(ms.length - 1, Math.floor(p * ms.length))] ?? 0;
  const cost = all.reduce((s, r) => s + r.costUsd, 0);
  let s = `# Card scanner accuracy, ${new Date().toISOString().slice(0, 10)}\n\n`;
  s += `${h.length} images of ${new Set(h.map((r) => r.externalId)).size} Riftbound cards through ${SCAN_MODEL} + our matcher (${skipped.length} cards skipped: image would not download). Errors: ${h.filter((r) => r.error).length}.\n\n`;
  s += `"Right printing" counts a twin with the identical picture (a promo and its booster card share art) as right: the photo cannot tell them apart and the picker offers both.\n`;
  s += table2("All images", new Map([["all", h]]));
  s += table2("By photo condition", groupBy(h, (r) => r.condition));
  s += table2("By kind of card", groupBy(h, (r) => r.stratum));
  const conf = groupBy(h, (r) => r.confidence);
  s += `\n### When the page says…\n\n| confidence | images | share of scans | right printing |\n|---|---:|---:|---:|\n`;
  for (const k of ["high", "medium", "low", "none", "error"]) { const rs = conf.get(k) ?? []; if (rs.length) s += `| ${k} | ${rs.length} | ${pct(rs.length, h.length)} | ${pct(rs.filter((r) => r.sameArt).length, rs.length)} |\n`; }
  const tw = groupBy(h, (r) => r.twinCheck ?? "none");
  s += `\n### Look-alike printings (second call comparing pictures)\n\n| twin check | images | right printing |\n|---|---:|---:|\n`;
  for (const [k, rs] of tw) s += `| ${k} | ${rs.length} | ${pct(rs.filter((r) => r.sameArt).length, rs.length)} |\n`;
  s += `\nLatency (model calls, both steps): median ${(q(0.5) / 1000).toFixed(2)} s, 90th percentile ${(q(0.9) / 1000).toFixed(2)} s. Cost of this whole run: US$${cost.toFixed(3)}; per Haiku scan US$${(h.reduce((a, r) => a + r.costUsd, 0) / Math.max(1, h.length)).toFixed(5)}.\n`;
  const son = all.filter((r) => r.model !== SCAN_MODEL);
  if (son.length) {
    const keys = new Set(son.map((r) => `${r.externalId}|${r.condition}`));
    const hh = h.filter((r) => keys.has(`${r.externalId}|${r.condition}`));
    s += table2("Haiku 5.5 vs Sonnet 5.5 on the same hard images", new Map([["Haiku 5.5", hh], ["Sonnet 5.5", son]]));
  }
  const wrong = h.filter((r) => r.confidence === "high" && !r.sameArt).slice(0, 25);
  if (wrong.length) {
    s += `\n### Wrong cards marked "Match" (up to 25)\n\n| truth | condition | returned | read |\n|---|---|---|---|\n`;
    for (const r of wrong) s += `| ${r.externalId} ${r.card} | ${r.condition} | ${r.bestExt} | ${JSON.stringify(r.read).replace(/\|/g, "/").slice(0, 160)} |\n`;
  }
  return s;
}

async function dry() {
  // EVAL_DRY=1: draw every condition from a made-up card picture, no network and no model call.
  mkdirSync(join(OUT, "dry"), { recursive: true });
  const fake = await sharp({ create: { width: 744, height: 1039, channels: 3, background: "#c8a24a" } })
    .composite([{ input: svg(744, 1039, `<rect x="30" y="30" width="684" height="979" fill="#223"/><text x="60" y="110" font-size="56" fill="#fff">Blazing Scorcher</text><text x="60" y="1000" font-size="30" fill="#fff">OGN · 001/298</text>`) }])
    .png().toBuffer();
  for (const [cond, make] of Object.entries(CONDITIONS)) writeFileSync(join(OUT, "dry", `${cond.replace(/\W+/g, "-")}.jpg`), await make(fake));
  console.log("dry run written");
}

(process.env.EVAL_DRY === "1" ? dry() : main()).catch((e) => { console.error(e); process.exit(1); });
