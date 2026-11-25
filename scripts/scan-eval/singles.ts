// Card scanner accuracy eval for TCG Singles DB (DECISIONS.md 2026-11-20 "Card scanner for TCG Singles DB"). GitHub Actions
// only (singles-scan-eval.yml): the card image CDN is not reachable from the agents' container.
//
// Per game (Pokémon, Yu-Gi-Oh!, One Piece) it measures IMAGE COVERAGE (how many cards have a downloadable TCGplayer picture,
// placeholders counted out) and ACCURACY: for a fixed, seeded sample of cards it makes phone-photo versions of the official
// picture and sends each through the SAME code production runs: Rift's readAnyCard (lib/scan/read.ts), then TCG Singles DB's
// own matcher (src/lib/scan/match.ts in a checkout of Specifxx/tcgsinglesdb at SINGLES_DIR) against the game's whole catalogue.
// "Found" = the right TCGplayer product is the match or in the pick list; "wrong match" = a different card returned as THE match.
// A game passes at found >= 95% and wrong match <= 1%. Real numbers only: every figure is counted from results.json.
//
//   ANTHROPIC_API_KEY=… SINGLES_DIR=../tcgsinglesdb npx tsx scripts/scan-eval/singles.ts   (EVAL_CARDS=150 a game)
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readAnyCard, scanCostUsd, SCAN_MODEL } from "../../src/lib/scan/read";

const SINGLES = resolve(process.env.SINGLES_DIR || "../tcgsinglesdb");
const OUT = join(process.cwd(), "scripts/scan-eval/results-singles");
const GAMES = (process.env.EVAL_GAMES || "pokemon,yugioh,one-piece").split(",");
const N = Number(process.env.EVAL_CARDS || 150);
const COVER_N = Number(process.env.COVER_CARDS || 1000);
const PASS_FOUND = 0.95;
const PASS_WRONG = 0.01;
const client = new Anthropic({ maxRetries: 3, timeout: 60_000 });

type Row = { id: number; set: string; setName: string; setAbbr: string | null; s: string; n: string; no: string; v: number };
type Result = { kind: "match" | "pick" | "none"; ids: number[]; why: string };
type Matcher = {
  matchScan: (r: unknown, c: Row[]) => Result;
  numberKey: (s: string) => string | null;
};
let M: Matcher;

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
}
const rand = rng(20261120);
const pick = <T,>(xs: T[], n: number) => [...xs].sort(() => rand() - 0.5).slice(0, n);
const img = (id: number, big = true) => `https://tcgplayer-cdn.tcgplayer.com/product/${id}_${big ? "in_1000x1000" : "200w"}.jpg`;

function catalog(game: string): Row[] {
  const sets = new Map<string, { name: string; abbr: string | null }>(
    (JSON.parse(readFileSync(join(SINGLES, `data/cards/${game}/sets.json`), "utf8")).sets as { slug: string; name: string; abbr: string | null }[]).map((s) => [s.slug, s]),
  );
  return (JSON.parse(readFileSync(join(SINGLES, `data/cards/${game}/search.json`), "utf8")) as [string, string, string, string, number, number, number][]).map(
    ([set, s, n, no, v, , id]) => ({ id, set, setName: sets.get(set)?.name ?? set, setAbbr: sets.get(set)?.abbr ?? null, s, n, no, v }),
  );
}

async function fetchBuf(url: string): Promise<{ status: number; buf: Buffer | null }> {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "tcgsinglesdb-scan-eval (+https://tcgsinglesdb.com)" } });
      if (r.ok) return { status: r.status, buf: Buffer.from(await r.arrayBuffer()) };
      if (r.status === 403 || r.status === 404) return { status: r.status, buf: null };
    } catch {
      /* retry */
    }
  }
  return { status: 0, buf: null };
}
async function pool<T>(xs: T[], n: number, f: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < xs.length) await f(xs[i++]); }));
}

// ── phone-photo conditions (as scripts/scan-eval/run.ts) ───────────────────
const W = 1024;
async function table(card: Buffer, opts: { angle: number; scale: number; bg: string }) {
  const meta = await sharp(card).metadata();
  const landscape = (meta.width ?? 1) > (meta.height ?? 1);
  const canvasW = landscape ? W : Math.round(W * 0.75);
  const canvasH = landscape ? Math.round(W * 0.75) : W;
  const target = Math.round(Math.max(canvasW, canvasH) * opts.scale);
  const rotated = await sharp(card).resize(landscape ? target : null, landscape ? null : target).rotate(opts.angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const rm = await sharp(rotated).metadata();
  const bg = await sharp({ create: { width: canvasW, height: canvasH, channels: 3, background: opts.bg } }).png().toBuffer();
  const left = Math.max(0, Math.round((canvasW - (rm.width ?? 0)) / 2 + (rand() - 0.5) * canvasW * 0.04));
  const top = Math.max(0, Math.round((canvasH - (rm.height ?? 0)) / 2 + (rand() - 0.5) * canvasH * 0.04));
  return sharp(bg).composite([{ input: rotated, left: Math.min(left, canvasW - 1), top: Math.min(top, canvasH - 1) }]).png().toBuffer();
}
const svg = (w: number, h: number, body: string) => Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`);
const jpeg = (b: Buffer | ReturnType<typeof sharp>, q: number) => (Buffer.isBuffer(b) ? sharp(b) : b).resize(W, W, { fit: "inside" }).jpeg({ quality: q }).toBuffer();
const CONDITIONS: Record<string, (img: Buffer) => Promise<Buffer>> = {
  "tilted on a table": async (i) => jpeg(sharp(await table(i, { angle: -7, scale: 0.78, bg: "#6b4f3a" })).blur(0.6), 72),
  glare: async (i) => {
    const t = await table(i, { angle: 4, scale: 0.78, bg: "#2f3b45" });
    const m = await sharp(t).metadata();
    const g = svg(m.width!, m.height!, `<defs><radialGradient id="r" cx="0.62" cy="0.38" r="0.32"><stop offset="0" stop-color="#fff" stop-opacity="0.92"/><stop offset="0.55" stop-color="#fff" stop-opacity="0.45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#r)"/>`);
    return jpeg(sharp(t).composite([{ input: g }]), 72);
  },
  "dim light": async (i) => jpeg(sharp(await table(i, { angle: 3, scale: 0.78, bg: "#3a3a3a" })).modulate({ brightness: 0.42, saturation: 0.8 }).blur(1.1), 55),
  "foil sheen": async (i) => {
    const t = await table(i, { angle: -3, scale: 0.78, bg: "#1f1f24" });
    const m = await sharp(t).metadata();
    const f = svg(m.width!, m.height!, `<defs><linearGradient id="f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff3cac"/><stop offset="0.3" stop-color="#ffd23c"/><stop offset="0.55" stop-color="#3cffb4"/><stop offset="0.8" stop-color="#3c8cff"/><stop offset="1" stop-color="#b43cff"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#f)" opacity="0.38"/>`);
    return jpeg(sharp(t).composite([{ input: f, blend: "soft-light" }]).modulate({ brightness: 1.05 }), 72);
  },
  "far and small": async (i) => jpeg(sharp(await table(i, { angle: 12, scale: 0.42, bg: "#7a6a55" })).blur(0.5), 70),
};

// ── image coverage ─────────────────────────────────────────────────────────
async function coverage(game: string, cat: Row[]) {
  const priced = cat.filter((c) => c.v >= 100);
  const sample = [...pick(priced, Math.round(COVER_N * 0.7)).map((c) => ({ c, tier: "US$1+" })), ...pick(cat, Math.round(COVER_N * 0.3)).map((c) => ({ c, tier: "any" }))];
  const got: { tier: string; status: number; hash: string | null }[] = [];
  await pool(sample, 8, async ({ c, tier }) => {
    const r = await fetchBuf(img(c.id, false));
    got.push({ tier, status: r.status, hash: r.buf ? createHash("md5").update(r.buf).digest("hex") : null });
  });
  // A picture many different cards share is TCGplayer's placeholder, not the card.
  const freq = new Map<string, number>();
  for (const g of got) if (g.hash) freq.set(g.hash, (freq.get(g.hash) ?? 0) + 1);
  const placeholder = new Set([...freq].filter(([, n]) => n >= 3).map(([h]) => h));
  const by = (tier: string) => {
    const xs = got.filter((g) => tier === "all" || g.tier === tier);
    const real = xs.filter((g) => g.hash && !placeholder.has(g.hash)).length;
    return { checked: xs.length, real, placeholder: xs.filter((g) => g.hash && placeholder.has(g.hash)).length, missing: xs.filter((g) => !g.hash).length, share: xs.length ? real / xs.length : 0 };
  };
  return { cards: cat.length, priced: priced.length, withNumber: cat.filter((c) => !!M.numberKey(c.no)).length, usd1: by("US$1+"), any: by("any"), placeholders: placeholder.size };
}

// ── accuracy ───────────────────────────────────────────────────────────────
interface Out { game: string; id: number; n: string; no: string; stratum: string; condition: string; read: unknown; kind: string; ids: number[]; found: boolean; top: boolean; wrongMatch: boolean; pickSize: number; ms: number; costUsd: number; error?: string }

async function accuracy(game: string, cat: Row[]): Promise<{ rows: Out[]; skipped: number }> {
  const counts = new Map<string, number>();
  for (const c of cat) { const k = M.numberKey(c.no); if (k) counts.set(k, (counts.get(k) ?? 0) + 1); }
  const numbered = cat.filter((c) => M.numberKey(c.no));
  const strata: [string, Row[], number][] = [
    ["US$1+", numbered.filter((c) => c.v >= 100 && counts.get(M.numberKey(c.no)!) === 1), 0.45],
    ["look-alike", numbered.filter((c) => c.v >= 100 && counts.get(M.numberKey(c.no)!)! > 1), 0.4],
    ["any", numbered, 0.15],
  ];
  const sample: { c: Row; stratum: string }[] = [];
  const seen = new Set<number>();
  for (const [k, xs, share] of strata) for (const c of pick(xs.filter((x) => !seen.has(x.id)), Math.round(N * share))) { seen.add(c.id); sample.push({ c, stratum: k }); }
  const jobs: { c: Row; stratum: string; condition: string; img: Buffer }[] = [];
  let skipped = 0;
  for (const { c, stratum } of sample) {
    const r = await fetchBuf(img(c.id));
    if (!r.buf) { skipped++; continue; }
    for (const [cond, make] of Object.entries(CONDITIONS)) jobs.push({ c, stratum, condition: cond, img: await make(r.buf) });
  }
  const rows: Out[] = [];
  let done = 0;
  await pool(jobs, 6, async (j) => {
    try {
      const r = await readAnyCard(client, j.img.toString("base64"), game);
      const m = M.matchScan(r.reading, cat);
      rows.push({
        game, id: j.c.id, n: j.c.n, no: j.c.no, stratum: j.stratum, condition: j.condition, read: r.reading, kind: m.kind, ids: m.ids.slice(0, 12),
        found: m.ids.includes(j.c.id), top: m.ids[0] === j.c.id, wrongMatch: m.kind === "match" && m.ids[0] !== j.c.id, pickSize: m.kind === "pick" ? m.ids.length : 0,
        ms: r.ms, costUsd: scanCostUsd(r.usage),
      });
    } catch (e) {
      rows.push({ game, id: j.c.id, n: j.c.n, no: j.c.no, stratum: j.stratum, condition: j.condition, read: null, kind: "error", ids: [], found: false, top: false, wrongMatch: false, pickSize: 0, ms: 0, costUsd: 0, error: String((e as Error).message).slice(0, 200) });
    }
    if (++done % 100 === 0) console.log(`${game} ${done}/${jobs.length}`);
  });
  return { rows, skipped };
}

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "n/a");
function tableOf(title: string, groups: Map<string, Out[]>) {
  let s = `\n#### ${title}\n\n| | images | found (match or in picker) | right card first | wrong card as THE match | none |\n|---|---:|---:|---:|---:|---:|\n`;
  for (const [k, rs] of groups) s += `| ${k} | ${rs.length} | ${pct(rs.filter((r) => r.found).length, rs.length)} | ${pct(rs.filter((r) => r.top).length, rs.length)} | ${pct(rs.filter((r) => r.wrongMatch).length, rs.length)} | ${pct(rs.filter((r) => r.kind === "none").length, rs.length)} |\n`;
  return s;
}
const groupBy = (rows: Out[], f: (r: Out) => string) => {
  const m = new Map<string, Out[]>();
  for (const r of rows) m.set(f(r), [...(m.get(f(r)) ?? []), r]);
  return m;
};

async function main() {
  M = (await import(join(SINGLES, "src/lib/scan/match.ts"))) as Matcher;
  mkdirSync(OUT, { recursive: true });
  const verdicts: Record<string, unknown> = {};
  let md = `# TCG Singles DB card scanner: image coverage and accuracy, ${new Date().toISOString().slice(0, 10)}\n\nModel ${SCAN_MODEL} (one read a photo) + TCG Singles DB's matcher. Pass: found >= ${PASS_FOUND * 100}% and wrong match <= ${PASS_WRONG * 100}%.\n`;
  for (const game of GAMES) {
    const cat = catalog(game);
    const cov = await coverage(game, cat);
    const { rows, skipped } = await accuracy(game, cat);
    const ok = rows.filter((r) => !r.error);
    const found = ok.filter((r) => r.found).length / Math.max(1, rows.length);
    const wrong = ok.filter((r) => r.wrongMatch).length / Math.max(1, rows.length);
    const pass = rows.length >= 100 && found >= PASS_FOUND && wrong <= PASS_WRONG;
    const ps = rows.filter((r) => r.pickSize).map((r) => r.pickSize).sort((a, b) => a - b);
    const ms = ok.map((r) => r.ms).sort((a, b) => a - b);
    verdicts[game] = {
      pass, images: rows.length, cards: new Set(rows.map((r) => r.id)).size, skippedNoImage: skipped, errors: rows.length - ok.length,
      found: Number(found.toFixed(4)), wrongMatch: Number(wrong.toFixed(4)), top: Number((ok.filter((r) => r.top).length / Math.max(1, rows.length)).toFixed(4)),
      matchShare: Number((ok.filter((r) => r.kind === "match").length / Math.max(1, rows.length)).toFixed(4)), pickMedian: ps[ps.length >> 1] ?? 0,
      medianMs: ms[ms.length >> 1] ?? 0, costUsd: Number(rows.reduce((s, r) => s + r.costUsd, 0).toFixed(4)), coverage: cov,
    };
    writeFileSync(join(OUT, `${game}.json`), JSON.stringify({ at: new Date().toISOString(), model: SCAN_MODEL, verdict: verdicts[game], rows }, null, 1));
    md += `\n## ${game}: ${pass ? "PASS" : "NOT YET"}\n\nImage coverage: ${pct(cov.usd1.real, cov.usd1.checked)} of ${cov.usd1.checked} sampled US$1+ cards and ${pct(cov.any.real, cov.any.checked)} of ${cov.any.checked} sampled cards of any price have a real picture (placeholders ${cov.usd1.placeholder + cov.any.placeholder}, missing ${cov.usd1.missing + cov.any.missing}). ${cov.withNumber} of ${cov.cards} cards carry a printed number.\n\n`;
    md += `${rows.length} images of ${new Set(rows.map((r) => r.id)).size} cards (${skipped} sampled cards had no picture). Errors ${rows.length - ok.length}. Median model time ${((ms[ms.length >> 1] ?? 0) / 1000).toFixed(2)} s. Picker median ${ps[ps.length >> 1] ?? 0} printings.\n`;
    md += tableOf("All", new Map([["all", rows]]));
    md += tableOf("By condition", groupBy(rows, (r) => r.condition));
    md += tableOf("By kind of card", groupBy(rows, (r) => r.stratum));
    const wr = rows.filter((r) => r.wrongMatch || (!r.found && !r.error)).slice(0, 20);
    if (wr.length) {
      md += `\n#### Misses (up to 20)\n\n| truth | number | condition | result | read |\n|---|---|---|---|---|\n`;
      for (const r of wr) md += `| ${r.n} | ${r.no} | ${r.condition} | ${r.kind}${r.wrongMatch ? " WRONG" : ""} | ${JSON.stringify(r.read).replace(/\|/g, "/").slice(0, 180)} |\n`;
    }
  }
  writeFileSync(join(OUT, "verdict.json"), JSON.stringify({ at: new Date().toISOString(), model: SCAN_MODEL, passFound: PASS_FOUND, passWrong: PASS_WRONG, games: verdicts }, null, 1));
  writeFileSync(join(OUT, "summary.md"), md);
  console.log(md);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
