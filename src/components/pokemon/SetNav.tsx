import Link from "next/link";
import { formatDay } from "@/lib/pokemon/format";
import type { PkSetSummary } from "@/lib/pokemon/types";

// The sets either side of this one by the date TCGplayer lists, at the foot of
// a set page: a crawler and a reader can walk the whole range without the index.
export function SetNav({ older, newer }: { older: PkSetSummary | null; newer: PkSetSummary | null }) {
  if (!older && !newer) return null;
  const card = (s: PkSetSummary, dir: "older" | "newer") => {
    const day = formatDay(s.releasedOn);
    return (
      <Link
        href={`/pokemon/sets/${s.slug}`}
        rel={dir === "older" ? "prev" : "next"}
        className={`card-surface flex min-h-11 flex-col justify-center p-3 transition-colors hover:border-ink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 ${dir === "newer" ? "sm:items-end sm:text-right" : ""}`}
      >
        <span className="text-[11px] uppercase tracking-wide text-slate-500">{dir === "older" ? "← Earlier set" : "Later set →"}</span>
        <span className="text-sm font-bold text-white">{s.name}</span>
        {day && <span className="text-xs text-slate-500">TCGplayer lists {day}</span>}
      </Link>
    );
  };
  return (
    <nav aria-label="Neighbouring sets" className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {older ? card(older, "older") : <span className="hidden sm:block" />}
      {newer ? card(newer, "newer") : null}
    </nav>
  );
}
