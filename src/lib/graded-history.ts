// Graded-slab price tracking (2026-10-09, owner: a Plus feature). The daily eBay
// pass already captures each card's graded listings (EbayGradedListing, up to six
// per card per market, replaced every run), but kept no history. Each import now
// snapshots the cheapest live slab per card and grade into a public day file
// (data/price-history/graded/, lib/price-history-store.ts), and Plus members see
// that series on the card page and can watch a grade for a new low
// (lib/graded-watch.ts). DECISIONS.md, "Graded price tracking for Plus".
import { convertCents } from "./fx";

/** "PSA 10", "BGS 9.5", or "Graded" when the title named no grader or grade. */
export function gradeLabel(grader: string | null | undefined, grade: number | null | undefined): string {
  const g = (grader ?? "").trim().toUpperCase();
  if (!g || grade == null || !Number.isFinite(grade)) return "Graded";
  return `${g} ${Number.isInteger(grade) ? grade : grade.toFixed(1).replace(/\.0$/, "")}`;
}

export interface GradedListingLite {
  cardId: string;
  priceCents: number;
  currency: string;
  grader: string | null;
  grade: number | null;
}

/** The day's points: the cheapest listing per card and grade, in US cents. */
export function gradedSnapshot(rows: Iterable<GradedListingLite>): { cardId: string; grade: string; usdCents: number }[] {
  const best = new Map<string, { cardId: string; grade: string; usdCents: number }>();
  for (const r of rows) {
    if (!r.cardId || !(r.priceCents > 0)) continue;
    const grade = gradeLabel(r.grader, r.grade);
    if (grade === "Graded") continue; // an unnamed slab is not a series anyone can follow
    const usdCents = Math.round(r.currency === "USD" ? r.priceCents : convertCents(r.priceCents, r.currency, "USD"));
    const key = `${r.cardId}|${grade}`;
    const prev = best.get(key);
    if (!prev || usdCents < prev.usdCents) best.set(key, { cardId: r.cardId, grade, usdCents });
  }
  return [...best.values()];
}

/** Grades ordered best first: PSA 10, BGS 9.5, ..., then by grader name. */
export function compareGrades(a: string, b: string): number {
  const num = (s: string) => Number(s.split(" ").pop());
  return num(b) - num(a) || a.localeCompare(b);
}
