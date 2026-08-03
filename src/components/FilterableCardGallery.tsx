"use client";

import { useMemo, useState } from "react";
import { CardTile, type CardTileData } from "./CardTile";
import { domainInfo, rarityInfo } from "@/lib/constants";
import { normalizeSearch } from "@/lib/format";

// Client-side filter + sort over an embedded card gallery (e.g. "every revealed
// Vendetta card"). The full card list is rendered server-side and passed in, so
// crawlers still see every card + link; this only shows/hides in the browser.
// Filter options are derived from the cards actually present, so empty facets never
// appear. A "Recently added" sort uses createdAt (= when the reveal was imported).
type GalleryCard = CardTileData & { createdAt?: string | null };

type Sort = "number" | "recent";

// Facet list for one attribute, ordered by frequency, covering only values that
// actually occur in the given cards (so empty facets never render).
//
// MODULE SCOPE ON PURPOSE: this used to live inside the component, which meant the
// three useMemo(…, [cards]) calls below closed over a function recreated on every
// render but never listed it as a dependency (react-hooks/exhaustive-deps ×3). It
// was correct only by accident — the function read nothing but `cards`. The moment
// anyone made it depend on other state (say, narrowing facets by the active search)
// the memos would have silently served stale facets. Taking `cards` as a parameter
// makes the dependency list honest and the staleness impossible.
function facetOf(cards: GalleryCard[], key: "domain" | "rarity" | "type") {
  const counts = new Map<string, number>();
  for (const c of cards) {
    const v = c[key];
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function FilterableCardGallery({ cards }: { cards: GalleryCard[] }) {
  const [q, setQ] = useState("");
  const [domain, setDomain] = useState<string | null>(null);
  const [rarity, setRarity] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("number");
  const [open, setOpen] = useState(false);

  const hasDates = cards.some((c) => c.createdAt);

  const domains = useMemo(() => facetOf(cards, "domain"), [cards]);
  const rarities = useMemo(() => facetOf(cards, "rarity"), [cards]);
  const types = useMemo(() => facetOf(cards, "type"), [cards]);

  const numOf = (cn: string) => parseInt(cn.match(/\d+/)?.[0] ?? "9999", 10);

  const shown = useMemo(() => {
    const needle = normalizeSearch(q.trim());
    let out = cards.filter((c) => {
      if (domain && c.domain !== domain) return false;
      if (rarity && c.rarity !== rarity) return false;
      if (type && c.type !== type) return false;
      if (needle) {
        const inName = normalizeSearch(c.name).includes(needle);
        const inNum = c.collectorNumber.toLowerCase().includes(q.trim().toLowerCase());
        if (!inName && !inNum) return false;
      }
      return true;
    });
    out = [...out].sort((a, b) =>
      sort === "recent"
        ? (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || numOf(a.collectorNumber) - numOf(b.collectorNumber)
        : numOf(a.collectorNumber) - numOf(b.collectorNumber),
    );
    return out;
  }, [cards, q, domain, rarity, type, sort]);

  const activeCount = (domain ? 1 : 0) + (rarity ? 1 : 0) + (type ? 1 : 0);
  const clearAll = () => { setDomain(null); setRarity(null); setType(null); setQ(""); };

  return (
    <div className="mt-4">
      {/* Compact control row (mirrors the database filter): search + sort + a
          collapsed Filters toggle; facet chips appear only when expanded. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500">⌕</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or number…"
            aria-label="Search cards"
            className="min-h-11 w-full rounded-lg border border-ink-700 bg-ink-900 py-1.5 pl-7 pr-2.5 text-xs text-white placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40 sm:min-h-0"
          />
        </div>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
            activeCount ? "border-brand-500 bg-brand-500/15 text-brand-300" : "border-ink-700 bg-ink-850 text-slate-300 hover:border-brand-500/50"
          }`}
        >
          Filters
          {activeCount > 0 && <span className="rounded-full bg-brand-500 px-1.5 py-0.5 text-[10px] text-white">{activeCount}</span>}
          <svg className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m6 9 6 6 6-6" /></svg>
        </button>
        {hasDates && (
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            aria-label="Sort cards"
            className="shrink-0 rounded-lg border border-ink-700 bg-ink-850 px-2.5 py-1.5 text-xs font-semibold text-slate-300 focus:border-brand-500 focus:outline-none"
          >
            <option value="number">Sort: Collector №</option>
            <option value="recent">Sort: Recently added</option>
          </select>
        )}
      </div>

      {open && (
        <div className="mt-2 flex flex-col gap-2 rounded-lg border border-ink-700 bg-ink-900/60 p-3">
          <FacetRow label="Domain" items={domains} active={domain} onPick={setDomain} dot={(k) => domainInfo(k).color} />
          <FacetRow label="Rarity" items={rarities} active={rarity} onPick={setRarity} dot={(k) => rarityInfo(k).color} />
          <FacetRow label="Type" items={types} active={type} onPick={setType} />
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span>
          Showing <span className="num text-slate-300">{shown.length}</span> of{" "}
          <span className="num text-slate-300">{cards.length}</span> cards
        </span>
        {(activeCount > 0 || q) && (
          <button type="button" onClick={clearAll} className="text-brand-400 hover:underline">Clear filters</button>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="mt-4 rounded-xl border border-ink-700 bg-ink-850 p-6 text-center text-sm text-slate-400">No cards match those filters.</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map((c) => (
            <CardTile key={c.id} card={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function FacetRow({
  label,
  items,
  active,
  onPick,
  dot,
}: {
  label: string;
  items: [string, number][];
  active: string | null;
  onPick: (v: string | null) => void;
  dot?: (k: string) => string;
}) {
  if (items.length <= 1) return null; // nothing to filter on
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-14 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {items.map(([v, n]) => {
        const on = active === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onPick(on ? null : v)}
            className={`chip inline-flex items-center gap-1 border px-2 py-1 text-[11px] font-semibold transition-colors ${
              on ? "border-brand-500 bg-brand-500/15 text-brand-300" : "border-ink-700 text-slate-400 hover:border-brand-500/50 hover:text-slate-200"
            }`}
          >
            {dot && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot(v) }} aria-hidden />}
            {v} <span className={on ? "text-brand-200/70" : "text-slate-600"}>· {n}</span>
          </button>
        );
      })}
    </div>
  );
}
