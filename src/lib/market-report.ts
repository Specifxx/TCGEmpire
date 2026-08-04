// Read-only types + parser for STORED market-report payloads.
//
// GENERATION IS DELETED. This file used to also build the reports: a daily
// templated "market wrap" page, later reworked to monthly. Neither ran in the
// end — `ensureMarketReport()` was never called from anywhere (no cron in
// vercel.json, no script, no workflow), so the whole generator was dead code
// sitting behind a stale comment claiming monthly reports were indexed. They
// were not: blog/[slug]/page.tsx noindexes every DB-backed report, sitemap-
// sections.ts omits them, and posts.ts keeps them out of /blog, the feeds and
// the news sitemap.
//
// WHY THE ORIGINAL IDEA WAS DROPPED: one near-identical templated page per
// calendar day, forever, wrapped around a numeric table is the textbook shape of
// Google's "scaled content abuse" policy and a real AdSense Publisher-Policy
// risk. Across a full Search Console export not one report URL had earned any
// traffic to lose.
//
// WHAT SURVIVES, AND WHY: roughly 130 legacy MarketReport rows still exist in the
// database. The `MarketReport` model and these types are kept so those URLs keep
// resolving (noindex, follow) instead of turning into ~130 fresh 404s, and so no
// stored data is destroyed. Everything below is READ-side only — nothing here
// writes a report, and nothing should: if a market-report format is ever wanted
// again, design it as a small number of genuinely substantive pages rather than
// restoring a per-period template.
import type { Country } from "./country";

// A chartable daily close. `d` is the ISO day so the payload survives JSON.
export type SeriesPoint = { d: string; v: number };

export interface Mover {
  name: string;
  slug: string | null;
  id: string;
  setCode: string;
  collectorNumber: string;
  pct: number; // mean % change across markets with data, earliest vs latest day in the window
  priceCents: number; // representative current price (AU pref, else any)
  currency: string;
}

export interface ReportRegion {
  code: Country;
  level: number | null;
  d1: number | null;
  d7: number | null;
  d30: number | null;
  series: SeriesPoint[];
}

export interface ReportData {
  v: 1;
  day: string;
  global: { level: number | null; d1: number | null; d7: number | null; d30: number | null; series: SeriesPoint[] };
  regions: ReportRegion[];
  breadth: { rose: number; fell: number; flat: number };
  movers: { risers: Mover[]; fallers: Mover[] };
  // Markdown prose sections, interleaved between the charts by MarketReportView.
  prose: { lede: string; spotlight: string | null; spotlightPlace: string | null; takeaway: string };
}

// Validate a stored JSON payload back into ReportData (null → render prose-only).
export function parseReportData(json: unknown): ReportData | null {
  const d = json as ReportData | null;
  return d && typeof d === "object" && d.v === 1 && d.global && Array.isArray(d.regions) ? d : null;
}

// Shown on stored reports so an archived page still explains how its numbers were
// derived. Past tense: nothing generates these anymore.
export const METHODOLOGY = `The RiftCompare Index is a search-weighted gauge of the most-traded Riftbound cards in each market, rebased to 100 at the start of its history; the global figure is an equal-weighted composite of the regional indices, rebased at their common history start. These archived reports were generated automatically from live daily price data. Informational only — not financial advice.`;
