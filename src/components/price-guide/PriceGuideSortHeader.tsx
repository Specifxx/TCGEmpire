"use client";

import { GUIDE_DEFAULT_SORT } from "@/lib/price-guide-query";
import { useGuideNav } from "./PriceGuideNav";

// A sortable column heading: <th aria-sort> around a real <button>, never an
// <a href="?sort=…"> — a sorted view is a noindexed permutation of the same
// rows, and a crawlable link to each one would only spend crawl budget on
// duplicates (lib/price-guide-seo.ts). The IndexConstituents SortTh pattern,
// plus aria-sort (so a screen reader announces the order without reading the
// arrow), a URL instead of local state, and an optimistic arrow.
//
// `desc` / `asc` are the guide's sort values for this column; a column with
// only one (Card: name A–Z) simply stays on it. The first click takes `first`.
type Dir = "ascending" | "descending" | "none";

export function PriceGuideSortHeader({
  label,
  desc,
  asc,
  first = "desc",
  current,
  align = "left",
  className = "",
}: {
  label: string;
  desc?: string;
  asc?: string;
  first?: "asc" | "desc";
  /** The server's resolved sort for this render. */
  current: string;
  align?: "left" | "right";
  className?: string;
}) {
  const { navigate, optimisticSort } = useGuideNav();
  const active = optimisticSort ?? current;
  const dir: Dir = desc && active === desc ? "descending" : asc && active === asc ? "ascending" : "none";

  function onClick() {
    const firstSort = first === "asc" ? asc ?? desc : desc ?? asc;
    const next = dir === "none" ? firstSort : dir === "descending" ? asc ?? desc : desc ?? asc;
    if (!next || next === active) return;
    navigate((p) => (next === GUIDE_DEFAULT_SORT ? p.delete("sort") : p.set("sort", next)), next);
  }

  return (
    <th scope="col" aria-sort={dir} className={`py-1 font-semibold ${align === "right" ? "text-right" : "text-left"} ${className}`}>
      <button
        type="button"
        onClick={onClick}
        className={`pg-sb ${
          align === "right" ? "flex-row-reverse" : ""
        } ${dir === "none" ? "" : "text-brand-400"}`}
      >
        {label}
        <SortGlyph dir={dir} />
      </button>
    </th>
  );
}

function SortGlyph({ dir }: { dir: Dir }) {
  // Two stacked chevrons; the active one lights up. Decorative: aria-sort on
  // the <th> carries the state.
  return (
    <svg aria-hidden="true" viewBox="0 0 10 14" className="h-3 w-2.5 shrink-0">
      <path d="M5 1 9 5.5H1z" className={dir === "ascending" ? "fill-current" : "fill-current opacity-30"} />
      <path d="M5 13 1 8.5h8z" className={dir === "descending" ? "fill-current" : "fill-current opacity-30"} />
    </svg>
  );
}
