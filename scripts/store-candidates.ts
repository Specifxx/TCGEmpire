// Vet and measure candidate Riftbound singles stores before they go into
// src/lib/retailers.ts (docs/store-vetting.md, "Before a store is added").
//
// Read-only, no database. For each candidate it reports, from an Actions runner:
//   - the outside vetting check (scripts/store-vetting.mjs vetHost: answers, not
//     parked or moved, domain age, contact details, the banned list and denylist)
//   - robots.txt, Shopify, the shop's own currency (must be the market's)
//   - the singles collection: products, in stock, and how many the importer's own
//     matcher (buildCardIndex + resolveCardId) puts on one of our cards
// A candidate is ADD only when all of that is clean; the verdict line says why not.
//
// Candidates come from data/store-vetting/rift-candidates.json (first found by TCG
// Singles DB's weekly store probe, 2026-11-18).
//   npx tsx scripts/store-candidates.ts
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { buildCardIndex, resolveCardId, type CardLite, type ShopifyProduct } from "../src/lib/price-import";
import { SCRAPE_HEADERS, robotsAllows, sleep, isRateLimited } from "../src/lib/scrape-http";
import { vetHost } from "./store-vetting.mjs";

type Candidate = { key: string; name: string; base: string; country: "US" | "UK" | "CA" | "AU" | "SG" | "EU"; collections: string[] };
const CURRENCY: Record<Candidate["country"], string> = { US: "USD", UK: "GBP", CA: "CAD", AU: "AUD", SG: "SGD", EU: "EUR" };

const candidates = JSON.parse(readFileSync("data/store-vetting/rift-candidates.json", "utf8")).candidates as Candidate[];
const cards = JSON.parse(readFileSync("data/public/cards.json", "utf8")) as CardLite[];
const idx = buildCardIndex(cards);
const banned = new Set((JSON.parse(readFileSync("data/store-vetting/banned.json", "utf8")) as { domain: string }[]).map((b) => b.domain));
const denied = (() => {
  try {
    const d = JSON.parse(readFileSync("data/store-vetting/denylist.json", "utf8"));
    return new Set<string>(((d.domains ?? []) as { domain: string }[]).map((x) => x.domain));
  } catch {
    return new Set<string>();
  }
})();
const verified = new Set((JSON.parse(readFileSync("data/store-vetting/verified.json", "utf8")) as { domain: string }[]).map((v) => v.domain));

async function json(url: string): Promise<{ status: number; data: any }> {
  try {
    const r = await fetch(url, { headers: SCRAPE_HEADERS, signal: AbortSignal.timeout(20_000) });
    if (isRateLimited(r)) return { status: 429, data: null };
    return { status: r.status, data: r.ok ? await r.json().catch(() => null) : null };
  } catch {
    return { status: 0, data: null };
  }
}

async function measure(c: Candidate) {
  const host = new URL(c.base).host.replace(/^www\./, "");
  const vet = await vetHost(host, banned, verified);
  const allowed = await robotsAllows(c.base);
  const meta = await json(`${c.base}/meta.json`);
  const currency: string | null = meta.data?.currency ?? null;
  let total = 0,
    inStock = 0,
    matched = 0,
    matchedInStock = 0,
    status = 0;
  const sample: string[] = [];
  for (const h of c.collections) {
    if (!allowed(`/collections/${h}/products.json`)) continue;
    for (let page = 1; page <= 10; page++) {
      await sleep(1000);
      const r = await json(`${c.base}/collections/${h}/products.json?limit=250&page=${page}&country=${c.country === "UK" ? "GB" : c.country === "EU" ? "ES" : c.country}`);
      status = r.status;
      const arr = (r.data?.products ?? []) as ShopifyProduct[];
      if (!arr.length) break;
      for (const p of arr) {
        total++;
        const avail = (p.variants ?? []).some((v: any) => v.available);
        if (avail) inStock++;
        const id = resolveCardId(p, idx);
        if (id) {
          matched++;
          if (avail) matchedInStock++;
        } else if (sample.length < 5) sample.push(p.title);
      }
      if (arr.length < 250) break;
    }
  }
  const why: string[] = [];
  if (banned.has(host) || denied.has(host)) why.push("on the banned list or denylist");
  for (const f of vet.flags as { kind: string; red: boolean; detail: string }[]) if (f.red || f.kind === "young" || f.kind === "no-contact" || f.kind === "moved") why.push(f.detail);
  if (!allowed("/collections/x/products.json")) why.push("robots.txt disallows the catalogue");
  if (currency && currency !== CURRENCY[c.country]) why.push(`charges ${currency}, not ${CURRENCY[c.country]}`);
  if (!total) why.push(`no products read from the collection (last HTTP ${status})`);
  if (matchedInStock < 20) why.push(`only ${matchedInStock} in-stock singles match our cards`);
  if (total && matched / total < 0.8) why.push(`only ${Math.round((100 * matched) / total)}% of its listings match one card`);
  return { ...c, host, age: vet.age, state: vet.state, currency, total, inStock, matched, matchedInStock, unmatchedSample: sample, verdict: why.length ? "HOLD" : "ADD", why };
}

(async () => {
  const out = [];
  const lines = ["# Riftbound store candidates", "", "| Store | Verdict | In stock | Matched (in stock) | Domain age | Currency | Why not |", "|---|---|---|---|---|---|---|"];
  for (const c of candidates) {
    const r = await measure(c);
    out.push(r);
    const line = `| ${r.name} (${r.host}) | ${r.verdict} | ${r.inStock}/${r.total} | ${r.matched} (${r.matchedInStock}) | ${r.age ?? "?"} d | ${r.currency ?? "?"} | ${r.why.join("; ") || "-"} |`;
    console.log(line);
    lines.push(line);
  }
  writeFileSync("store-candidates.json", JSON.stringify(out, null, 1));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
})();
