// Cardmarket as a UK price source — DISABLED by default (feature-flagged off).
//
// Why a flag, and why off:
//   1. LEGAL GATE. Cardmarket's API/Terms restrict redistributing/displaying their
//      price data ("presentation of the trading cards and their respective prices
//      requires Cardmarket's prior written agreement"). Their June-2024 public
//      Price-Guide/Product-List download is more permissive in tone but does NOT
//      clearly license third-party commercial redisplay. DO NOT enable this until
//      you have written confirmation from Cardmarket that showing their price-guide
//      data on this site (with attribution) is permitted.
//   2. UNVERIFIED DATA CONTRACT. The public download is bot-protected, so the exact
//      file URLs, delimiter and column names below are taken from Cardmarket's
//      documentation and MUST be confirmed against the real files (open them in a
//      browser / logged-in session) before flipping the flag. Everything that could
//      differ is an env-overridable constant so you can correct it without a code
//      change, then validate with `buildCardmarketRows` (a dry-run, no DB writes).
//
// What it does once enabled: downloads Cardmarket's Riftbound Product List + Price
// Guide CSVs, joins them on idProduct, matches each product to our catalogue, takes
// the LOW (lowest current listing) price, converts EUR→GBP, and writes one
// `cardmarket` RetailerPrice row per card for the UK market.
//
// How it's surfaced: Cardmarket's LOW is an EUR→GBP-converted MARKETPLACE aggregate
// (many EU sellers), not a single verified in-stock UK SKU — exactly like the
// converted TCGplayer-UK price. So it is a UK FALLBACK source (see
// UK_FALLBACK_RETAILERS): it never undercuts a genuine GBP listing for the headline
// "from" price, and it's hidden from the breakdown when a real GBP listing exists.
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { gunzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { CARDMARKET_EU_RETAILER, CARDMARKET_RETAILER } from "@/lib/constants";

// ---- feature flag -------------------------------------------------------------
// Off unless CARDMARKET_ENABLED === "true". Nothing is fetched, written, or shown
// while this is false.
export function isCardmarketEnabled(): boolean {
  return process.env.CARDMARKET_ENABLED === "true";
}

// ---- configuration (verify before enabling) -----------------------------------
// The Riftbound Product List + Price Guide. Blank by default so an accidental
// enable can't hit a wrong endpoint.
//
// ── THESE ARE NOT SCRAPE TARGETS, AND CANNOT BE (checked 2026-08-23) ─────────
// www.cardmarket.com sits behind a Cloudflare WAF that returns a hard 403
// "Sorry, you have been blocked" to any non-browser client — not a JS challenge,
// an outright block. Their robots.txt separately Disallows ClaudeBot, GPTBot,
// CCBot, Bytespider and Google-Extended, and carries an Article 4 EU DSM
// reservation of rights over text-and-data-mining. Getting around any of that
// would be circumventing an access control the operator deliberately put up.
// DO NOT point this at a scraper, a headless browser, or a proxy service.
//
// ── THE SUPPORTED ROUTE ─────────────────────────────────────────────────────
// Cardmarket PUBLISHES these two files to logged-in account holders at
// https://www.cardmarket.com/Data/Download — widened in 2024 from API users to
// all users, price guide refreshed once daily, catalogue on each new release.
// A human downloads them and points this at the result. That is why both values
// now accept a LOCAL FILE PATH as well as a URL (see readCsv below): the normal
// operating mode is "a person downloaded two files", not "a server fetched two
// URLs". New API applications are closed, so there is no key to get instead.
//
// What is still unresolved is the LICENCE to redisplay those prices on this site
// — see the legal gate in this file's header. Having the files is not permission
// to publish them, and CARDMARKET_ENABLED stays false until someone has that in
// writing.
const PRODUCTLIST_URL = process.env.CARDMARKET_PRODUCTLIST_URL ?? "";
const PRICEGUIDE_URL = process.env.CARDMARKET_PRICEGUIDE_URL ?? "";

// EUR→GBP rate for the conversion. Like USD_TO_GBP in tcgplayer.ts this is a hand-set
// reference rate (exact FX isn't critical for a "from"/reference figure). Override
// with CARDMARKET_EUR_TO_GBP to refresh without a deploy.
export const EUR_TO_GBP = Number(process.env.CARDMARKET_EUR_TO_GBP ?? "0.86");

// ---- card matching (mirrors tcgplayer.ts / price-import.ts) --------------------
// Strip leading zeros + lowercase any letter suffix; mark a Signature print ("*")
// with a trailing "s" so 223*/221 and 223/221 stay distinct.
function numKey(seg: string): string {
  const m = seg.match(/^0*(\d+)([a-z]*)/i);
  const base = m ? m[1] + m[2].toLowerCase() : seg.toLowerCase();
  return seg.includes("*") ? `${base}s` : base;
}
function setFromTotal(total?: string): string | null {
  switch (parseInt(total ?? "", 10)) {
    case 298: return "OGN";
    case 221: return "SFD";
    case 219: return "UNL";
    case 166: return "VEN"; // Vendetta released 31 Jul 2026, after this map was first written
    case 24: return "OGS";
    default: return null;
  }
}
// Normalise a card name for fallback name-matching (when a product row carries no
// usable collector number). Keep it identical in spirit to how cards are normalised
// elsewhere: lowercase, drop punctuation, collapse whitespace.
function normName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// ---- minimal CSV parser (no dependency) ---------------------------------------
// Handles quoted fields, escaped quotes ("") and CRLF. Delimiter is auto-detected
// from the header line (Cardmarket files have historically used ';' or ','), or set
// explicitly via CARDMARKET_CSV_DELIMITER.
export function parseCsv(text: string): Record<string, string>[] {
  const clean = text.replace(/^﻿/, ""); // strip BOM
  const firstLine = clean.slice(0, clean.indexOf("\n") >= 0 ? clean.indexOf("\n") : clean.length);
  const delim = process.env.CARDMARKET_CSV_DELIMITER
    ?? (firstLine.split(";").length > firstLine.split(",").length ? ";" : ",");

  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field); field = "";
    } else if (ch === "\n") {
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, idx) => { rec[h] = (r[idx] ?? "").trim(); });
    return rec;
  });
}

// Read a value from a record trying several possible column names (the files'
// exact headers are unverified, so we tolerate the documented variants).
function pick(rec: Record<string, string>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    if (rec[k] != null && rec[k] !== "") return rec[k];
    // case-insensitive fallback
    const hit = Object.keys(rec).find((rk) => rk.toLowerCase() === k.toLowerCase());
    if (hit && rec[hit] !== "") return rec[hit];
  }
  return undefined;
}

// Parse a Cardmarket price string ("1,23" or "1.23") to a float in EUR.
function parseEur(s?: string): number | null {
  if (!s) return null;
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Read one of the two files, from a LOCAL PATH or a URL.
 *
 * The local path is the primary mode, not a convenience: cardmarket.com blocks
 * automated clients outright (see the configuration note above), so the realistic
 * operating procedure is a person logging in, downloading the price guide and
 * product catalogue, and putting them somewhere this can read — a mounted volume,
 * a build artefact, a signed URL on our own storage.
 *
 * Anything that is not obviously a URL is treated as a path, so
 * CARDMARKET_PRICEGUIDE_URL=/data/price_guide_3.csv just works.
 */
async function readCsv(source: string): Promise<string> {
  const buf = /^https?:\/\//i.test(source)
    ? await fetchRemoteCsv(source)
    : await readFile(source);
  // Transparently gunzip gzip-magic (0x1f 0x8b) payloads, regardless of
  // URL/extension — Cardmarket serves these gzipped.
  const isGzip = buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
  return (isGzip ? gunzipSync(buf) : buf).toString("utf8");
}

async function fetchRemoteCsv(url: string): Promise<Buffer> {
  // Deliberately a plain fetch with a plain Accept header and NO browser
  // impersonation. If this is ever pointed at cardmarket.com directly it should
  // fail loudly on their 403 rather than quietly succeed by pretending to be
  // Chrome — the failure is the correct outcome, and disguising the client to
  // avoid it is the thing this module must not do.
  const res = await fetch(url, { headers: { Accept: "text/csv,application/gzip,*/*" } });
  if (!res.ok) {
    throw new Error(
      `Cardmarket read ${res.status} for ${url}: ${(await res.text()).slice(0, 160)}` +
        (res.status === 403
          ? " — cardmarket.com blocks automated clients. Download the files from " +
            "https://www.cardmarket.com/Data/Download while signed in and point " +
            "CARDMARKET_PRICEGUIDE_URL / CARDMARKET_PRODUCTLIST_URL at the local files."
          : ""),
    );
  }
  return Buffer.from(await res.arrayBuffer());
}

export type CardmarketMatch = {
  total: number;
  matched: number;
  rows: Prisma.RetailerPriceCreateManyInput[];
  unmatchedSamples: string[];
};

// Pure builder (no network, no DB writes) so it can be dry-run + unit-tested:
// given the parsed Product List + Price Guide records and our cards, produce the
// RetailerPrice rows. `products` is the Riftbound product catalogue; `prices` is
// keyed by idProduct.
export function buildCardmarketRows(
  cards: { id: string; collectorNumber: string; nameNormalized: string; name: string }[],
  products: Record<string, string>[],
  prices: Record<string, string>[],
): CardmarketMatch {
  // index our cards by set+number (authoritative) and by name (unique-only fallback)
  const byKey = new Map<string, string>();
  const byName = new Map<string, string | null>(); // null = ambiguous (>1 card), don't match
  for (const c of cards) {
    const [num, total] = c.collectorNumber.split("/");
    const sc = setFromTotal(total);
    if (sc) byKey.set(`${sc}|${numKey(num)}`, c.id);
    const nn = c.nameNormalized || normName(c.name);
    byName.set(nn, byName.has(nn) ? null : c.id);
  }

  const priceById = new Map<string, Record<string, string>>();
  for (const p of prices) {
    const id = pick(p, "idProduct", "Product ID", "id");
    if (id) priceById.set(id, p);
  }

  const rows: Prisma.RetailerPriceCreateManyInput[] = [];
  const seen = new Set<string>();
  const unmatchedSamples: string[] = [];
  let matched = 0;

  for (const prod of products) {
    const id = pick(prod, "idProduct", "Product ID", "id");
    const name = pick(prod, "Name", "name", "Local Name", "English Name", "enName") ?? "";
    if (!id) continue;
    const pg = priceById.get(id);
    if (!pg) continue;

    // LOW = lowest current (non-foil) listing — our closest analog to "from" price.
    //
    // BOTH COLUMN VOCABULARIES, because Cardmarket publishes two shapes of the
    // same file and this code cannot be tested against either from here (the site
    // 403s every automated client — see the configuration note above). The CSV
    // download uses long headers ("Low Price", "Avg. Sell Price"); the JSON price
    // guide uses short keys ("low", "avg", "trend"). Accepting both costs nothing
    // and removes the most likely reason a first real run silently writes zero
    // rows — which is exactly how this failed on its first dry-run, and the
    // failure was invisible because a missing price `continue`s BEFORE the
    // unmatched-sample counter (fixed below).
    //
    // ORDER IS THE CONTRACT, not just a fallback chain: LOW first because it is
    // the "from" price this site promises. Trend/Avg are averages over time and
    // would quietly turn a lowest-price comparison into an average-price one.
    const lowEur = parseEur(pick(pg, "Low Price", "low", "Low", "Avg. Sell Price", "avg", "Trend Price", "trend"));
    if (lowEur == null) {
      if (unmatchedSamples.length < 25) unmatchedSamples.push(`${name} #${pick(prod, "Number", "Collector Number") ?? "?"} — NO PRICE COLUMN (${Object.keys(pg).join("/")})`);
      continue;
    }

    // Match: prefer collector number if the product file exposes one; else fall back
    // to an UNAMBIGUOUS name match (skip when a name maps to >1 card to avoid pricing
    // an alt-art/signature onto the wrong print).
    let cardId: string | undefined;
    const numStr = pick(prod, "Number", "Collector Number", "CardNumber", "Card Number", "number", "Collector Nr.");
    if (numStr && numStr.includes("/")) {
      const [num, total] = numStr.split("/");
      const sc = setFromTotal(total);
      if (sc) cardId = byKey.get(`${sc}|${numKey(num)}`);
    }
    if (!cardId) {
      const hit = byName.get(normName(name));
      if (hit) cardId = hit; // null (ambiguous) is skipped
    }
    if (!cardId) {
      if (unmatchedSamples.length < 25) unmatchedSamples.push(`${name} #${numStr ?? "?"} €${lowEur}`);
      continue;
    }

    matched++;
    const dedupe = `${cardId}|false`;
    if (seen.has(dedupe)) continue; // one standard row per card (unique key)
    seen.add(dedupe);
    const url = cardmarketProductUrl(prod);
    const base = {
      cardId,
      retailer: CARDMARKET_RETAILER,
      retailerName: "Cardmarket",
      title: name,
      url,
      condition: "NM",
      isFoil: false,
      inStock: true,
    };
    // UK: an EUR→GBP CONVERSION of a European marketplace aggregate. A reference,
    // never a buyable UK listing — which is why it lives in UK_FALLBACK_RETAILERS.
    rows.push({ ...base, priceCents: Math.round(lowEur * EUR_TO_GBP * 100), currency: "GBP", country: "UK" });
    // EU: the SAME number, unconverted, because Cardmarket quotes in euro and the
    // EU market prices in euro. This is the one market where this source is not
    // an approximation at all — no FX rate sits between the figure Cardmarket
    // publishes and the figure a European shopper reads.
    //
    // It is STILL a fallback (see EU_FALLBACK_RETAILERS in constants.ts), for the
    // reason UK's is: it is a marketplace aggregate across many sellers, not one
    // verified in-stock SKU at a store that will post it to you. It must never
    // undercut a real EU store listing for the headline "from" price.
    rows.push({ ...base, retailer: CARDMARKET_EU_RETAILER, priceCents: Math.round(lowEur * 100), currency: "EUR", country: "EU" });
  }
  return { total: products.length, matched, rows, unmatchedSamples };
}

// Best-effort product link. The download files don't include a canonical URL; build
// one from the website's id query when available, else point at the Riftbound hub.
function cardmarketProductUrl(prod: Record<string, string>): string {
  const id = pick(prod, "idProduct", "Product ID", "id");
  return id
    ? `https://www.cardmarket.com/en/Riftbound/Products/Singles?idProduct=${id}`
    : "https://www.cardmarket.com/en/Riftbound";
}

// Replace all Cardmarket rows with a fresh pull. No-op (returns skipped) while the
// flag is off or the URLs aren't configured. Isolated try/catch lives in the caller.
export async function refreshCardmarketPrices(): Promise<{ skipped: boolean; written: number; reason?: string }> {
  if (!isCardmarketEnabled()) return { skipped: true, written: 0, reason: "CARDMARKET_ENABLED!=true" };
  if (!PRODUCTLIST_URL || !PRICEGUIDE_URL) {
    return { skipped: true, written: 0, reason: "CARDMARKET_PRODUCTLIST_URL / CARDMARKET_PRICEGUIDE_URL not set" };
  }

  const [productCsv, priceCsv] = await Promise.all([readCsv(PRODUCTLIST_URL), readCsv(PRICEGUIDE_URL)]);
  const products = parseCsv(productCsv);
  const prices = parseCsv(priceCsv);
  const cards = await prisma.card.findMany({ select: { id: true, collectorNumber: true, nameNormalized: true, name: true } });

  const { total, matched, rows, unmatchedSamples } = buildCardmarketRows(cards, products, prices);
  console.log(`Cardmarket: ${total} products, ${matched} matched, ${rows.length} rows.`);
  if (unmatchedSamples.length) console.log(`Cardmarket unmatched (sample): ${unmatchedSamples.slice(0, 8).join(" | ")}`);
  if (rows.length === 0) {
    console.warn("Cardmarket: 0 rows built — keeping existing rows.");
    return { skipped: false, written: 0, reason: "0 rows built" };
  }

  await prisma.retailerPrice.deleteMany({ where: { retailer: { in: [CARDMARKET_RETAILER, CARDMARKET_EU_RETAILER] } } });
  await prisma.retailerPrice.createMany({ data: rows });
  return { skipped: false, written: rows.length };
}
