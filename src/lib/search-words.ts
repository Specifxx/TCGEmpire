// Two near-misses the search box could not survive (2026-11-12, measured on the
// site's own search_no_results events: 215 of 661 searchers in a week saw nothing).
//
// 1. WORDS, NOT ONE STRING. The name match is one normalised substring
//    (lib/cards.ts), so "blade of exile" became "bladeofexile" and missed "Blade of
//    the Exile", the top card of the week. `searchWords` gives the words that carry
//    meaning; buildCardWhere adds "every one of them is in the name" as one more
//    alternative. It only ever ADDS matches: the whole-phrase alternative stays first.
// 2. NOT A CARD AT ALL. "kda", "legacy" and "firestarter" name a product or a season
//    we have a guide for, never a card. `matchGuides` finds the published articles
//    whose title carries every word, so an empty card search can point somewhere.
//
// PURE: no database, no article import (the caller passes the list).

const STOP = new Set(["the", "of", "a", "an", "and", "in", "to", "for", "on"]);

/** Lowercased words with punctuation removed ("K/DA" → "kda"), stop words and single letters dropped. */
export function searchWords(q: string): string[] {
  const out: string[] = [];
  for (const raw of q.toLowerCase().split(/\s+/)) {
    const w = raw.replace(/[^a-z0-9]/g, "");
    if (w.length < 2 || STOP.has(w) || out.includes(w)) continue;
    out.push(w);
  }
  return out.slice(0, 6);
}

export interface GuideHit {
  title: string;
  href: string;
}

interface GuideSource {
  slug: string;
  category: "blog" | "guide";
  title: string;
  seoTitle?: string;
  date: string;
  updated?: string;
}

/** Published articles whose title holds every word of the query (whole words or their start), newest first. */
export function matchGuides(q: string, articles: readonly GuideSource[], max = 3): GuideHit[] {
  const words = searchWords(q);
  if (!words.length || words.every((w) => w.length < 3)) return [];
  const hits: { a: GuideSource; when: string }[] = [];
  for (const a of articles) {
    const have = searchWords(`${a.title} ${a.seoTitle ?? ""} ${a.slug.replace(/-/g, " ")}`);
    if (words.every((w) => have.some((h) => h === w || (w.length >= 4 && h.startsWith(w))))) hits.push({ a, when: a.updated ?? a.date });
  }
  hits.sort((x, y) => (x.when < y.when ? 1 : x.when > y.when ? -1 : 0));
  return hits.slice(0, max).map(({ a }) => ({ title: a.title, href: `/${a.category === "guide" ? "guides" : "blog"}/${a.slug}` }));
}
