import { formatMoney } from "../format";
import { addDays, SOURCE_LABELS, tagGroup, toDisplay, type SourceResult, type TagDay } from "./core";

// THE WEEKLY GROWTH REPORT (2026-10-30, owner: "I want significant jumps to our
// affiliate link revenue … it's not growing these past week"). DECISIONS.md,
// "A private weekly growth report for the growth review".
//
// The Monday digest answers "how much, 7 and 30 days". A growth review needs
// "which site, placement and market moved, week over week", so this breaks the
// eBay and TCGplayer tags (rc-us-card_pinned, gundam-au-card-ebay-strip …) into
// site, market and placement, for the last four whole weeks, plus our own
// outbound click counts so earnings per click can be read.
//
// Private, like the digest: the route mails it to a fixed business inbox
// (lib/ops/owner.ts growthReportEmail) and returns only ok. No amount reaches a
// log, the response or the repository.
//
// PURE: the route loads the sources and click counts; this only formats them.

const DISPLAY = "AUD";
export const WEEKS = 4;

export interface Week {
  start: string;
  end: string;
}

/** The last `n` whole 7-day weeks ending the day before `today`, oldest first (eBay's report lags a day). */
export function reportWeeks(today: string, n = WEEKS): Week[] {
  const out: Week[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const end = addDays(today, -1 - 7 * i);
    out.push({ start: addDays(end, -6), end });
  }
  return out;
}

function weekIndex(day: string, weeks: readonly Week[]): number {
  return weeks.findIndex((w) => day >= w.start && day <= w.end);
}

/** site / market / placement from a tag: `rc-us-card_pinned-xyz` -> rc, us, card_pinned. Only the third segment
 *  is the placement, so a product slug after it never splits one placement into hundreds of lines. */
export function tagParts(tag: string): { site: string; market: string; placement: string } {
  const t = tag.trim().toLowerCase();
  if (!t) return { site: "(no tag)", market: "?", placement: "?" };
  const [, market = "?", placement = "(none)"] = t.split("-");
  return { site: tagGroup(t).key, market, placement };
}

export interface Line {
  label: string;
  weeks: number[]; // cents per week, oldest first
  sales: number; // in the last week
}

function addTo(map: Map<string, Line>, label: string, wi: number, cents: number, sales: number, n: number, last: boolean) {
  const l = map.get(label) ?? { label, weeks: Array(n).fill(0), sales: 0 };
  l.weeks[wi] += cents;
  if (last) l.sales += sales;
  map.set(label, l);
}

const byLatest = (a: Line, b: Line) => b.weeks[b.weeks.length - 1] - a.weeks[a.weeks.length - 1] || b.weeks.reduce((x, y) => x + y, 0) - a.weeks.reduce((x, y) => x + y, 0);

export interface GrowthReport {
  weeks: Week[];
  sources: Line[];
  bySite: Line[];
  byPlacement: Line[];
  byMarket: Line[];
  clicks: { group: string; weeks: number[] }[];
  off: string[];
}

export function buildGrowthReport(sources: readonly SourceResult[], clicks: Map<string, Partial<Record<string, number>>>, today: string): GrowthReport {
  const weeks = reportWeeks(today);
  const n = weeks.length;
  const src = new Map<string, Line>();
  for (const s of sources) {
    if (s.status === "not-configured" && !s.days.length) continue;
    const label = `${SOURCE_LABELS[s.key]}${s.status === "error" ? " (not answering)" : ""}`;
    src.set(label, { label, weeks: Array(n).fill(0), sales: 0 });
    for (const d of s.days) {
      const wi = weekIndex(d.day, weeks);
      if (wi >= 0) addTo(src, label, wi, toDisplay(d.cents, d.currency, DISPLAY), 0, n, false);
    }
  }
  const site = new Map<string, Line>();
  const place = new Map<string, Line>();
  const market = new Map<string, Line>();
  for (const key of ["ebay", "tcgplayer"] as const) {
    const net = key === "ebay" ? "eBay" : "TCGplayer";
    for (const r of sources.find((s) => s.key === key)?.tags ?? ([] as TagDay[])) {
      const wi = weekIndex(r.day, weeks);
      if (wi < 0) continue;
      const cents = toDisplay(r.cents, r.currency, DISPLAY);
      const p = tagParts(r.tag);
      const last = wi === n - 1;
      addTo(site, `${p.site} · ${net}`, wi, cents, r.sales, n, last);
      addTo(place, `${p.site} · ${p.placement} · ${net}`, wi, cents, r.sales, n, last);
      addTo(market, `${p.site} · ${p.market}`, wi, cents, r.sales, n, last);
    }
  }
  const clickLines = (["ebay", "tcgplayer", "store"] as const).map((group) => ({
    group,
    weeks: weeks.map((w) => {
      let c = 0;
      for (let d = w.start; d <= w.end; d = addDays(d, 1)) c += clicks.get(d)?.[group] ?? 0;
      return c;
    }),
  }));
  return {
    weeks,
    sources: [...src.values()].sort(byLatest),
    bySite: [...site.values()].sort(byLatest),
    byPlacement: [...place.values()].sort(byLatest).slice(0, 25),
    byMarket: [...market.values()].sort(byLatest).slice(0, 15),
    clicks: clickLines,
    off: sources.filter((s) => s.status === "not-configured" && !s.days.length).map((s) => SOURCE_LABELS[s.key]),
  };
}

function change(weeks: readonly number[]): string {
  const [prev, cur] = weeks.slice(-2);
  if (!prev) return cur ? "new" : "";
  const pct = Math.round(((cur - prev) / prev) * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

/** Plain text, one table per section: easy to read in a mail client and easy for the growth review to parse. */
export function growthReportText(r: GrowthReport): string {
  const money = (c: number) => formatMoney(c, DISPLAY);
  const head = `Weeks (Sydney days): ${r.weeks.map((w, i) => `W${i + 1} ${w.start}..${w.end}`).join(", ")}. Amounts in AUD incl. pending; last column is W${r.weeks.length} vs W${r.weeks.length - 1}.`;
  const table = (title: string, lines: readonly Line[], sales: boolean) =>
    [
      title,
      ...(lines.length ? lines.map((l) => `  ${l.label}: ${l.weeks.map(money).join(" | ")}${sales ? ` (${l.sales} sales last week)` : ""} ${change(l.weeks)}`.trimEnd()) : ["  (nothing)"]),
    ].join("\n");
  const totals = r.weeks.map((_, i) => r.sources.reduce((n, l) => n + l.weeks[i], 0));
  return [
    "GROWTH REPORT",
    head,
    `TOTAL: ${totals.map(money).join(" | ")} ${change(totals)}`.trimEnd(),
    table("BY SOURCE", r.sources, false),
    table("AFFILIATE BY SITE", r.bySite, true),
    table("TOP PLACEMENTS (site · placement · network)", r.byPlacement, true),
    table("TOP MARKETS (site · market)", r.byMarket, true),
    ["RIFTCOMPARE OUTBOUND CLICKS (our /api/click counters)", ...r.clicks.map((c) => `  ${c.group}: ${c.weeks.join(" | ")} ${change(c.weeks)}`.trimEnd())].join("\n"),
    ...(r.off.length ? [`Not connected: ${r.off.join(", ")}.`] : []),
  ].join("\n\n");
}

export function growthReportHtml(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<pre style="font:13px/1.5 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap">${esc}</pre>`;
}
