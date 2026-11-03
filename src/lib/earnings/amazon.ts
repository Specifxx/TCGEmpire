import { inflateRawSync } from "node:zlib";
import type { DayAmount, TagDay } from "./core";

// AMAZON ASSOCIATES ON THE EARNINGS DASHBOARD (2026-11-03, owner: "is there a
// way to get Amazon on our earnings dashboard as well?"). DECISIONS.md, "Amazon
// earnings from uploaded reports".
//
// Amazon has no reporting API an account our size can use: its "Creators API
// Reports" (the old data feed) is opened only for publishers with tens of
// thousands of sales a month, and the Creators API itself is product data. So
// the earnings come from the report every account CAN download: Associates
// Central → Reports → Download reports → Earnings (the "Fee-Earnings" file),
// one row per item shipped, with its Tracking ID, ship date and ad fee. The
// owner (or Claude in Chrome) uploads it on /admin/earnings, a ZIP or the CSV
// inside, once a week per Amazon store; an upload REPLACES that store's days in
// the range it covers, so uploading the same month again never counts it twice.
//
// PURE except the ZIP reader (node:zlib): tests/earnings-amazon.test.ts holds it.

/** One Amazon store (each is its own Associates account and currency). */
export const AMAZON_STORES = [
  { key: "au", label: "Amazon.com.au", currency: "AUD" },
  { key: "us", label: "Amazon.com", currency: "USD" },
  { key: "uk", label: "Amazon.co.uk", currency: "GBP" },
  { key: "ca", label: "Amazon.ca", currency: "CAD" },
  { key: "de", label: "Amazon.de", currency: "EUR" },
] as const;
export type AmazonStoreKey = (typeof AMAZON_STORES)[number]["key"];
export const amazonStore = (key: string) => AMAZON_STORES.find((s) => s.key === key) ?? null;
export const amazonStoreForCurrency = (currency: string) => AMAZON_STORES.find((s) => s.currency === currency) ?? null;

// WHICH SITE EACH TRACKING ID BELONGS TO. The AU account has one ID per site
// (2026-11-03) and the engine sites have their own US IDs; the other IDs are
// shared by several sites, so their money is "Amazon, shared ID" and never
// credited to one site it may not belong to. The ascsubtag every link carries
// would split them, but Amazon reports subtags only to accounts it grants
// subtag reporting. An ID missing here also lands in the shared group, by name.
export const AMAZON_SHARED = "amazon";
export const AMAZON_TRACKING_SITES: Record<string, string> = {
  "riftcompare-22": "rc",
  "opcompare-22": "oc",
  "mtgcompare-22": "mtg",
  "mtgcreators-22": "mtg",
  "dexcompare-22": "dex",
  "cecompare-22": "ce",
  "ceinstagram-22": "ce",
  "gundamcompare-22": "gundam",
  "gundamcompare-20": "gundam",
  "lorcanacompare-22": "lorcana",
  "lorcanacompare-20": "lorcana",
  "ygocompare-22": "ygo",
  "ygocompare-20": "ygo",
  "cyberpunkcompare-22": "cyberpunk",
  "bandaicompare-22": "bandai",
  "wargamecomp-22": "wgc",
  "figurecompare-22": "figure",
  "kaeyoung-22": "ky",
  "kypinterest-22": "ky",
  "camcompare-22": "cc",
  // Shared by several sites (2026-11-03): riftcompare-20 (US), compareempire-22
  // (AU, the engine default), compareempi03-21 (UK), compareempire-20 (CA),
  // compareempire-21 (DE).
};

/** A tracking ID as a dashboard tag: `<site>-<store>-<id>`, so tagGroup finds the site. */
export function amazonTag(trackingId: string, store: string): string {
  const id = trackingId.trim().toLowerCase();
  return `${AMAZON_TRACKING_SITES[id] ?? AMAZON_SHARED}-${store}-${id || "none"}`;
}

/** The tracking ID back out of a dashboard tag. */
export const trackingIdOf = (tag: string) => tag.split("-").slice(2).join("-");

// ── The report file ──────────────────────────────────────────────────────────

/** The first file in a ZIP (Amazon zips each report). Null when it isn't a ZIP. */
export function unzipFirst(buf: Buffer): Buffer | null {
  if (buf.length < 30 || buf.readUInt32LE(0) !== 0x04034b50) return null;
  // Sizes come from the central directory: a local header written while
  // streaming (flag bit 3) leaves them zero.
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("That ZIP file is incomplete.");
  let p = buf.readUInt32LE(eocd + 16);
  const entries = buf.readUInt16LE(eocd + 10);
  for (let i = 0; i < entries && p + 46 <= buf.length && buf.readUInt32LE(p) === 0x02014b50; i++) {
    const method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/")) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + compressed);
    if (method === 0) return Buffer.from(data);
    if (method === 8) return inflateRawSync(data);
    throw new Error("That ZIP uses a compression this page can't read; upload the CSV inside it instead.");
  }
  throw new Error("That ZIP file is empty.");
}

/** Split CSV or tab-separated text into rows (quotes, doubled quotes, CRLF). */
export function splitRows(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.indexOf("\n") >>> 0);
  const sample = src.slice(0, 4000);
  const tabs = (sample.match(/\t/g) ?? []).length;
  const commas = (sample.match(/,/g) ?? []).length;
  const sep = tabs > commas / 2 || (firstLine.includes("\t") && !firstLine.includes(",")) ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"' && cell === "") q = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * A report date as YYYY-MM-DD: "2026-10-14 05:23:14", "2026-10-14T…",
 * "October 14, 2026", "14 Oct 2026", "10/14/2026" (US account) or "14/10/2026"
 * (the others; `dayFirst`). Null when unreadable.
 */
export function amazonReportDay(v: string, dayFirst = false): string | null {
  const s = v.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = /^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/.exec(s);
  if (m) return valid(+m[3], MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1, +m[2]);
  m = /^(\d{1,2})\.?\s+([A-Za-z]{3,})\.?\s+(\d{4})/.exec(s);
  if (m) return valid(+m[3], MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1, +m[1]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s);
  if (m) {
    const [a, b] = [+m[1], +m[2]];
    // An unambiguous date wins over the store's habit.
    if (a > 12) return valid(+m[3], b, a);
    if (b > 12) return valid(+m[3], a, b);
    return dayFirst ? valid(+m[3], b, a) : valid(+m[3], a, b);
  }
  return null;
}

function valid(y: number, mo: number, d: number): string | null {
  if (!(y >= 2000 && y < 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
  const day = `${y}-${pad(mo)}-${pad(d)}`;
  return new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day ? day : null;
}

/** "12.34", "$12.34", "-1.20", "1,234.56", and amazon.de's "12,34". */
export function amazonCents(v: string): number {
  let s = v.trim().replace(/[^\d.,\-]/g, "");
  if (/,\d{1,2}$/.test(s) && !/\.\d/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export interface AmazonUpload {
  /** One row per day and tracking ID, in the store's currency. */
  rows: { day: string; trackingId: string; cents: number; items: number }[];
  /** The days the report covers (its title line, else its first and last row). */
  from: string;
  to: string;
  items: number;
  columns: string[];
}

const norm = (h: string) => h.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z]/g, "");

/**
 * Read an Associates Central earnings report. Throws, with what it found, when
 * the file is not one: never a silent zero for a report it could not read.
 */
export function parseAmazonEarnings(text: string, dayFirst = false): AmazonUpload {
  const all = splitRows(text);
  const hi = all.findIndex((r) => r.some((c) => norm(c) === "trackingid"));
  if (hi < 0) throw new Error("No “Tracking ID” column found. Download the Earnings report (Reports → Download reports → Earnings), not a summary.");
  const head = all[hi].map(norm);
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const tId = col("trackingid");
  const dCol = col("dateshipped", "shippeddate", "date", "datesold", "shipdate");
  const fCol = col("adfees", "adfee", "fees", "earnings", "commissionincome", "advertisingfees", "commission");
  const nCol = col("itemsshipped", "items", "quantity", "qty");
  const rCol = col("returns", "itemsreturned");
  if (dCol < 0 || fCol < 0) throw new Error(`This report has no ship date or ad fee column (columns: ${all[hi].join(", ").slice(0, 200)}). Download the Earnings report.`);

  // Which way round 10/11/2026 is: the file's own unambiguous dates decide
  // (a 14/10 or a 10/14 anywhere), the store's habit only when none is.
  for (const r of all.slice(hi + 1)) {
    const n = /^(\d{1,2})[/.-](\d{1,2})[/.-]\d{4}/.exec((r[dCol] ?? "").trim());
    if (n && +n[1] > 12) {
      dayFirst = true;
      break;
    }
    if (n && +n[2] > 12) {
      dayFirst = false;
      break;
    }
  }
  // "Fee-Earnings reports from 10-01-2026 to 10-31-2026" (or a dated title).
  let title: [string, string] | null = null;
  for (const r of all.slice(0, hi)) {
    const t = /from\s+(.+?)\s+to\s+(.+?)\s*$/i.exec(r.join(" "));
    if (t) title = [t[1], t[2]];
  }
  const m = new Map<string, { day: string; trackingId: string; cents: number; items: number }>();
  let items = 0;
  for (const r of all.slice(hi + 1)) {
    const day = amazonReportDay(r[dCol] ?? "", dayFirst);
    if (!day) continue; // a totals row or a blank line
    const trackingId = (r[tId] ?? "").trim().toLowerCase();
    const cents = amazonCents(r[fCol] ?? "");
    const n = (nCol >= 0 ? Number(r[nCol]) || 0 : 1) - (rCol >= 0 ? Number(r[rCol]) || 0 : 0);
    const k = `${day}|${trackingId}`;
    const row = m.get(k) ?? { day, trackingId, cents: 0, items: 0 };
    row.cents += cents;
    row.items += n;
    items += n;
    m.set(k, row);
  }
  const rows = [...m.values()].sort((a, b) => a.day.localeCompare(b.day) || a.trackingId.localeCompare(b.trackingId));
  // The title's range, read both ways round when it is ambiguous: the reading
  // that holds every row, and the shorter one if both do. An upload REPLACES
  // its range, so a range read wrong would delete months; with no reading that
  // fits, the rows' own first and last day stand in.
  const lo = rows[0]?.day ?? "";
  const hiDay = rows[rows.length - 1]?.day ?? "";
  const spans = title
    ? [dayFirst, !dayFirst]
        .map((df) => [amazonReportDay(title![0], df), amazonReportDay(title![1], df)] as const)
        .filter((x): x is readonly [string, string] => !!x[0] && !!x[1] && x[0] <= x[1] && (!rows.length || (x[0] <= lo && x[1] >= hiDay)))
        .sort((a, b) => Date.parse(a[1]) - Date.parse(a[0]) - (Date.parse(b[1]) - Date.parse(b[0])))
    : [];
  const [from, to] = spans[0] ?? [lo, hiDay];
  if (!from || !to) throw new Error("The report has no dated rows and no date range in its title.");
  if (Date.parse(to) - Date.parse(from) > 400 * 86_400_000) throw new Error("That report spans more than a year; download 30 or 90 days at a time.");
  return { rows: rows.filter((r) => r.day >= from && r.day <= to), from, to, items, columns: all[hi] };
}

// ── Stored rows back into the dashboard's shapes ────────────────────────────

/** A stored upload row (ManualEarning, source "amazon"). */
export interface AmazonStoredRow {
  day: string;
  currency: string;
  amountCents: number;
  tag: string | null;
  units: number | null;
}

export function amazonTagDays(rows: readonly AmazonStoredRow[]): TagDay[] {
  return rows
    .filter((r) => r.tag)
    .map((r) => ({ day: r.day, tag: r.tag!, currency: r.currency, cents: r.amountCents, pendingCents: 0, sales: Math.max(0, r.units ?? 0) }))
    .sort((a, b) => a.day.localeCompare(b.day) || a.tag.localeCompare(b.tag));
}

export function amazonDays(rows: readonly AmazonStoredRow[]): DayAmount[] {
  return rows.map((r) => ({ day: r.day, currency: r.currency, cents: r.amountCents }));
}
