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
import { CARDMARKET_RETAILER } from "@/lib/constants";

// ---- feature flag -------------------------------------------------------------
// Off unless CARDMARKET_ENABLED === "true". Nothing is fetched, written, or shown
// while this is false.
export function isCardmarketEnabled(): boolean {
  return process.env.CARDMARKET_ENABLED === "true";
}

// ---- configuration (verify before enabling) -----------------------------------
// Download URLs for the Riftbound Product List + Price Guide files. These are the
// values that MUST be confirmed against the live site — set them via env once known.
// (Left blank by default so an accidental enable can't hit a wrong endpoint.)
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

async function fetchCsv(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      Accept: "text/csv,application/gzip,*/*",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
    },
  });
  if (!res.ok) throw new Error(`Cardmarket fetch ${res.status} for ${url}: ${(await res.text()).slice(0, 160)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // Transparently gunzip gzip-magic (0x1f 0x8b) payloads, regardless of URL/extension.
  const isGzip = buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
  return (isGzip ? gunzipSync(buf) : buf).toString("utf8");
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
    const name = pick(prod, "Name", "name", "Local Name", "English Name") ?? "";
    if (!id) continue;
    const pg = priceById.get(id);
    if (!pg) continue;

    // LOW = lowest current (non-foil) listing — our closest analog to "from" price.
    const lowEur = parseEur(pick(pg, "Low Price", "Avg. Sell Price", "Trend Price"));
    if (lowEur == null) continue;

    // Match: prefer collector number if the product file exposes one; else fall back
    // to an UNAMBIGUOUS name match (skip when a name maps to >1 card to avoid pricing
    // an alt-art/signature onto the wrong print).
    let cardId: string | undefined;
    const numStr = pick(prod, "Number", "Collector Number", "CardNumber", "Card Number");
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
    rows.push({
      cardId,
      retailer: CARDMARKET_RETAILER,
      retailerName: "Cardmarket",
      title: name,
      url: cardmarketProductUrl(prod),
      condition: "NM",
      isFoil: false,
      priceCents: Math.round(lowEur * EUR_TO_GBP * 100),
      currency: "GBP",
      country: "UK",
      inStock: true,
    });
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

  const [productCsv, priceCsv] = await Promise.all([fetchCsv(PRODUCTLIST_URL), fetchCsv(PRICEGUIDE_URL)]);
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

  await prisma.retailerPrice.deleteMany({ where: { retailer: CARDMARKET_RETAILER } });
  await prisma.retailerPrice.createMany({ data: rows });
  return { skipped: false, written: rows.length };
}
