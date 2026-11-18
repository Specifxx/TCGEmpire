// Riftbound coverage audit (owner, 2026-11-18: "If a card page is missing, stale,
// or slow, it won't rank no matter what else you do").
//
// Read-only. No database: it reads the public snapshot (data/public/) that the
// site itself serves, TCGplayer's own Riftbound catalogue, and the live site, so
// it costs the Neon compute cap nothing. Run weekly by coverage-audit.yml.
//
// It answers four questions, each with real numbers:
//   1. MISSING  Which priced TCGplayer Riftbound singles have no card page here?
//               (the importer's own matcher, buildTcgplayerRows, over the snapshot)
//   2. UNPRICED Which of our cards does no TCGplayer product land on?
//   3. STALE    Which stores have not been read for 48 hours? When was the snapshot made?
//   4. SLOW     Do a sample of card, set and pre-order pages answer 200, quickly,
//               from the CDN? Is every card in the sitemap?
//
// RED (exit 1, GitHub emails the owner): a released set's priced single with no
// page, a card page that does not answer 200, or a snapshot over 48 hours old.
// Everything else is reported in the job summary.
//
//   npx tsx scripts/coverage-audit.ts            (SITE=https://riftcompare.com)
//   SKIP_LIVE=1 npx tsx scripts/coverage-audit.ts
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { buildTcgplayerRows, fetchTcgplayerProducts, isPromoProduct, type TcgMatchCard, type TcgProduct } from "../src/lib/tcgplayer";
import { SETS, streetDateStartMs } from "../src/lib/constants";

const SITE = (process.env.SITE || "https://riftcompare.com").replace(/\/$/, "");
const HOUR = 3_600_000;
const now = Date.now();

type PubCard = TcgMatchCard & { slug: string; name: string; lowestPriceCents: number | null };
const cards = JSON.parse(readFileSync("data/public/cards.json", "utf8")) as PubCard[];
const meta = JSON.parse(readFileSync("data/public/meta.json", "utf8")) as { generatedAt: string; seen?: { RetailerPrice?: Record<string, string> } };

const lines: string[] = [];
const red: string[] = [];
const say = (s = "") => (console.log(s), lines.push(s));

function setOfProduct(p: TcgProduct): { code: string | null; released: boolean } {
  const name = (p.setName || "").toLowerCase();
  const s = SETS.find((x) => name.includes(x.name.toLowerCase()) || name.includes(x.code.toLowerCase()));
  if (!s) return { code: null, released: true };
  const at = s.releasedOn ? streetDateStartMs(s.releasedOn) : NaN;
  return { code: s.code, released: !s.comingSoon || (Number.isFinite(at) && at <= now) };
}

async function catalogue() {
  say("## 1. Every priced TCGplayer single has a page");
  let products: TcgProduct[] = [];
  try {
    products = await fetchTcgplayerProducts();
  } catch (e) {
    say(`TCGplayer could not be read (${(e as Error).message}); skipped, not red.`);
    return;
  }
  const unmatched: TcgProduct[] = [];
  const matchedIds = new Set<string>();
  const res = await buildTcgplayerRows(undefined, products, { cards, unmatched, matchedIds });
  say(`TCGplayer lists ${products.length} Riftbound singles; ${res.matched} land on one of our ${cards.length} cards.`);
  // A product with no price (a reveal not yet on sale) is not a missing page.
  const bySet = new Map<string, TcgProduct[]>();
  for (const p of unmatched) {
    const k = p.setName || "(no set)";
    bySet.set(k, [...(bySet.get(k) ?? []), p]);
  }
  const promos = unmatched.filter(isPromoProduct).length;
  say(`Priced singles with no page of their own: ${unmatched.length} (${promos} of them organised-play promos, which need an explicit link).`);
  for (const [set, ps] of [...bySet].sort((a, b) => b[1].length - a[1].length)) {
    const { released } = setOfProduct(ps[0]);
    say(`- **${set}** (${ps.length}${released ? "" : ", not released yet"}): ${ps.slice(0, 12).map((p) => `${p.productName} ${p.customAttributes?.number ?? ""} $${p.marketPrice ?? p.lowestPrice ?? "?"}`).join("; ")}${ps.length > 12 ? "; …" : ""}`);
  }
  // Red: a released set's NON-promo priced single with no page. Promos are a
  // known, separate list (PROMO_PRODUCT_OVERRIDES) and stay a report line.
  const missing = unmatched.filter((p) => !isPromoProduct(p) && setOfProduct(p).released && (p.marketPrice ?? 0) >= 0.25);
  if (missing.length >= 3) red.push(`${missing.length} priced TCGplayer singles from released sets have no card page (e.g. ${missing.slice(0, 3).map((p) => `${p.productName} ${p.customAttributes?.number ?? ""}`).join(", ")})`);

  say("");
  say("## 2. Every card has a TCGplayer price");
  const noTcg = cards.filter((c) => !matchedIds.has(c.id));
  const bySetCode = new Map<string, PubCard[]>();
  for (const c of noTcg) bySetCode.set(c.setCode, [...(bySetCode.get(c.setCode) ?? []), c]);
  say(`${noTcg.length} of ${cards.length} cards have no TCGplayer product (promos fall back to their base card's price).`);
  for (const [code, cs] of [...bySetCode].sort((a, b) => b[1].length - a[1].length)) {
    say(`- ${code}: ${cs.length}${cs.length <= 10 ? ` (${cs.map((c) => `${c.name} ${c.collectorNumber}${c.isPromo ? " promo" : ""}`).join("; ")})` : ""}`);
  }
}

function freshness() {
  say("");
  say("## 3. Fresh prices");
  const age = (now - Date.parse(meta.generatedAt)) / HOUR;
  say(`Public snapshot made ${age.toFixed(1)} hours ago (${meta.generatedAt}).`);
  if (age > 48) red.push(`the public snapshot is ${age.toFixed(0)} hours old`);
  const seen = Object.entries(meta.seen?.RetailerPrice ?? {});
  const stale = seen.filter(([, at]) => now - Date.parse(at) > 48 * HOUR).sort((a, b) => a[1].localeCompare(b[1]));
  say(`${seen.length} store feeds; ${stale.length} not read for over 48 hours${stale.length ? ":" : "."}`);
  for (const [k, at] of stale.slice(0, 40)) say(`- ${k}: last read ${at.slice(0, 10)}`);
  const unpriced = cards.filter((c) => c.lowestPriceCents == null || c.lowestPriceCents <= 0);
  say(`${cards.length - unpriced.length} of ${cards.length} cards have a store price today.`);
}

async function timed(path: string) {
  const t0 = Date.now();
  try {
    const r = await fetch(`${SITE}${path}`, { redirect: "manual", headers: { "User-Agent": "RiftCompareCoverageAudit/1.0 (+https://riftcompare.com)" }, signal: AbortSignal.timeout(30_000) });
    const ttfb = Date.now() - t0;
    const body = r.status === 200 ? await r.text() : "";
    return { path, status: r.status, ms: ttfb, cache: r.headers.get("x-vercel-cache") ?? "-", body };
  } catch (e) {
    return { path, status: 0, ms: Date.now() - t0, cache: "-", body: "", error: (e as Error).message };
  }
}

async function live() {
  say("");
  say("## 4. Pages answer, quickly");
  // Sitemap: every card URL listed? (sections are fetched from the index)
  const idx = await timed("/sitemap.xml");
  const sections = [...idx.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(SITE, ""));
  const inMap = new Set<string>();
  for (const s of sections) {
    const r = await timed(s);
    for (const m of r.body.matchAll(/<loc>[^<]*?\/card\/([^<]+)<\/loc>/g)) inMap.add(m[1]);
  }
  const notInMap = cards.filter((c) => !inMap.has(c.slug));
  say(`Sitemap: ${sections.length} sections, ${inMap.size} card URLs; ${notInMap.length} of our ${cards.length} cards are not in it${notInMap.length && notInMap.length <= 15 ? ` (${notInMap.map((c) => c.slug).join(", ")})` : ""}.`);

  // A sample: the 4 newest-numbered cards of every set, every set page, every pre-order page.
  const sample: string[] = [];
  const bySet = new Map<string, PubCard[]>();
  for (const c of cards) bySet.set(c.setCode, [...(bySet.get(c.setCode) ?? []), c]);
  for (const cs of bySet.values()) for (const c of cs.slice(-4)) sample.push(`/card/${c.slug}`);
  for (const s of SETS) {
    if (!s.comingSoon) sample.push(`/sets/${s.slug}`);
    else sample.push(`/preorders/${s.slug}`);
  }
  const results = [];
  for (const p of sample) {
    results.push(await timed(p));
    await new Promise((r) => setTimeout(r, 300));
  }
  const bad = results.filter((r) => r.status !== 200);
  const ms = results.filter((r) => r.status === 200).map((r) => r.ms).sort((a, b) => a - b);
  const p50 = ms[Math.floor(ms.length / 2)] ?? 0;
  const p90 = ms[Math.floor(ms.length * 0.9)] ?? 0;
  const hits = results.filter((r) => /HIT|STALE/.test(r.cache)).length;
  say(`${results.length} pages: ${results.length - bad.length} answered 200; time to first byte median ${p50} ms, 90th percentile ${p90} ms; ${hits} served from the CDN cache.`);
  for (const r of bad) say(`- ${r.path}: HTTP ${r.status}${r.error ? ` (${r.error})` : ""}`);
  for (const r of results.filter((r) => r.status === 200 && r.ms > 2500)) say(`- slow: ${r.path} ${r.ms} ms (${r.cache})`);
  const badCards = bad.filter((r) => r.path.startsWith("/card/") && r.status !== 0);
  if (badCards.length) red.push(`${badCards.length} card pages do not answer 200 (${badCards.map((r) => `${r.path} ${r.status}`).join(", ")})`);
  return { sitemapCards: inMap.size, notInSitemap: notInMap.map((c) => c.slug), results: results.map(({ body: _b, ...r }) => r) };
}

(async () => {
  say(`# Riftbound coverage audit, ${new Date(now).toISOString().slice(0, 16)}Z`);
  say("");
  await catalogue();
  freshness();
  const liveOut = process.env.SKIP_LIVE ? null : await live();
  say("");
  say(red.length ? `## RED\n${red.map((r) => `- ${r}`).join("\n")}` : "Nothing red.");
  writeFileSync("coverage-audit.json", JSON.stringify({ at: new Date(now).toISOString(), red, live: liveOut }, null, 1));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
  for (const r of red) console.log(`::error::${r}`);
  process.exit(red.length ? 1 : 0);
})();
