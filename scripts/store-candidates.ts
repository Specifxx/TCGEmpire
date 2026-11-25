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
import { DECOMMISSIONED_RETAILERS, RETAILERS } from "../src/lib/retailers";
import { SCRAPE_HEADERS, robotsAllows, sleep, isRateLimited } from "../src/lib/scrape-http";
import { vetHost } from "./store-vetting.mjs";

type Candidate = { key: string; name: string; base: string; country: "US" | "UK" | "CA" | "AU" | "SG" | "EU"; collections: string[]; sealed?: string[] };
const CURRENCY: Record<Candidate["country"], string> = { US: "USD", UK: "GBP", CA: "CAD", AU: "AUD", SG: "SGD", EU: "EUR" };

const candidates = JSON.parse(readFileSync("data/store-vetting/rift-candidates.json", "utf8")).candidates as Candidate[];
// Discovery pool (2026-11-25): shops TCG Prices already lists in a market, with no
// collections named. Each one's own /collections.json is read (3 pages at most)
// for Riftbound collections; a shop with none costs robots.txt and 1-3 requests
// and is reported as "no Riftbound collection". Only a shop with a singles
// collection goes on to the full measurement below.
type Pool = { key: string; name: string; base: string; country: Candidate["country"] };
const pool: Pool[] = (() => {
  try {
    return JSON.parse(readFileSync("data/store-vetting/rift-discovery.json", "utf8")).stores as Pool[];
  } catch {
    return [];
  }
})();
// Same split as scripts/probe-us-stores.ts: a sealed or accessory handle is never
// read as singles.
const NON_SINGLE = /sealed|booster|box|bundle|preorder|pre-order|accessor|playmat|sleeve|merch|deck-?box|gift|case|tin|blister|collection-box|product|starter|deck/i;
async function discoverCollections(base: string): Promise<{ singles: string[]; sealed: string[]; status: number }> {
  const allowed = await robotsAllows(base);
  if (!allowed("/collections.json")) return { singles: [], sealed: [], status: -1 };
  const singles = new Set<string>();
  const sealed = new Set<string>();
  let status = 0;
  for (let page = 1; page <= 3; page++) {
    await sleep(1000);
    const r = await json(`${base}/collections.json?limit=250&page=${page}`);
    status = r.status;
    const arr = (r.data?.collections ?? []) as { handle: string; title?: string; products_count?: number }[];
    if (!arr.length) break;
    for (const c of arr) {
      const text = `${c.handle} ${c.title ?? ""}`;
      if (!/riftbound/i.test(text)) continue;
      if (c.products_count === 0) continue;
      (NON_SINGLE.test(c.handle) ? sealed : singles).add(c.handle);
    }
    if (arr.length < 250) break;
  }
  return { singles: [...singles].slice(0, 4), sealed: [...sealed].slice(0, 4), status };
}
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
  if ((DECOMMISSIONED_RETAILERS as readonly string[]).includes(c.key)) why.push("decommissioned before (see retailers.ts and DECISIONS.md)");
  if (RETAILERS[c.key]) why.push("already tracked");
  if (banned.has(host) || denied.has(host)) why.push("on the banned list or denylist");
  for (const f of vet.flags as { kind: string; red: boolean; detail: string }[]) if (f.red || f.kind === "young" || f.kind === "no-contact" || f.kind === "moved") why.push(f.detail);
  if (!allowed("/collections/x/products.json")) why.push("robots.txt disallows the catalogue");
  if (currency && currency !== CURRENCY[c.country]) why.push(`charges ${currency}, not ${CURRENCY[c.country]}`);
  if (!total) why.push(`no products read from the collection (last HTTP ${status})`);
  if (matchedInStock < 20) why.push(`only ${matchedInStock} in-stock singles match our cards`);
  if (total && matched / total < 0.8) why.push(`only ${Math.round((100 * matched) / total)}% of its listings match one card`);
  return { ...c, host, age: vet.age, state: vet.state, currency, total, inStock, matched, matchedInStock, unmatchedSample: sample, verdict: why.length ? "HOLD" : "ADD", why };
}

async function inBatches<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

(async () => {
  const out = [];
  const lines = ["# Riftbound store candidates", "", "| Store | Verdict | In stock | Matched (in stock) | Domain age | Currency | Why not |", "|---|---|---|---|---|---|---|"];
  // Four shops at a time, each one read a request at a time with a second between.
  const tracked = new Set(Object.values(RETAILERS).map((r) => new URL(r.base).host.replace(/^www\./, "")));
  const fresh = pool.filter((p) => !RETAILERS[p.key] && !tracked.has(new URL(p.base).host.replace(/^www\./, "")) && !candidates.some((c) => c.key === p.key));
  const found = await inBatches(fresh, 4, async (p) => ({ p, d: await discoverCollections(p.base) }));
  const sealedOnly: string[] = [];
  for (const { p, d } of found) {
    if (d.singles.length) candidates.push({ ...p, collections: d.singles, sealed: d.sealed });
    else if (d.sealed.length) sealedOnly.push(`| ${p.name} (${p.base}) | SEALED ONLY | ${d.sealed.join(", ")} |`);
  }
  console.log(`discovery: ${fresh.length} shops read, ${candidates.length} with Riftbound singles to measure, ${sealedOnly.length} sealed only`);
  for (const l of sealedOnly) console.log(l);
  const measured = await inBatches(candidates, 4, measure);
  for (const r of measured) {
    out.push(r);
    const line = `| ${r.name} (${r.host}) | ${r.verdict} | ${r.inStock}/${r.total} | ${r.matched} (${r.matchedInStock}) | ${r.age ?? "?"} d | ${r.currency ?? "?"} | ${r.why.join("; ") || "-"} | ${r.collections.join(",")} | sealed: ${(r.sealed ?? []).join(",")} |`;
    console.log(line);
    lines.push(line);
  }
  lines.push("", "## Sealed-only Riftbound shops", "", ...sealedOnly);
  writeFileSync("store-candidates.json", JSON.stringify({ measured: out, sealedOnly }, null, 1));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
})();
