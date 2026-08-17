"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cardDisplayName } from "@/lib/card-name";
import { cardImageAlt } from "@/lib/image-alt";

// Shared "search a card by name, pick an exact printing" widget — the same
// debounced /api/search-backed dropdown the marketplace "List a card" flow
// (SellerDashboard.tsx) pioneered, extracted so Best Basket's redesigned
// search-and-add flow can reuse it instead of forking a second copy.
export interface SearchCard {
  id: string;
  name: string;
  slug?: string | null;
  setCode: string;
  collectorNumber: string;
  imageThumbUrl: string | null;
  variant: string | null;
  isPromo: boolean;
  rarity: string;
  lowestPriceCents: number | null;
  lowestPriceCentsNz?: number | null;
  lowestPriceCentsUs?: number | null;
  lowestPriceCentsUk?: number | null;
  lowestPriceCentsSg?: number | null;
  lowestPriceCentsCa?: number | null;
}

export function CardSearch({ onPick, placeholder = "Search for a card…" }: { onPick: (c: SearchCard) => void; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchCard[]>([]);
  const [active, setActive] = useState(-1);
  const abort = useRef<AbortController | null>(null);
  const listId = useId();

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); setActive(-1); return; }
    const t = setTimeout(async () => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        const data = await res.json();
        setResults((data.results ?? []).slice(0, 8));
        setActive(-1);
      } catch { /* aborted */ }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  function pick(c: SearchCard) {
    onPick(c);
    setQ("");
    setResults([]);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      if (active >= 0 && active < results.length) {
        e.preventDefault();
        pick(results[active]);
      }
    } else if (e.key === "Escape") {
      setResults([]);
      setActive(-1);
    }
  }

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="input"
        autoComplete="off"
        role="combobox"
        aria-expanded={results.length > 0}
        aria-autocomplete="list"
        aria-controls={listId}
      />
      {results.length > 0 && (
        <ul id={listId} className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-ink-700 bg-ink-850 shadow-2xl">
          {results.map((r, i) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => pick(r)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left ${i === active ? "bg-ink-800" : "hover:bg-ink-800"}`}
              >
                {r.imageThumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.imageThumbUrl} alt={cardImageAlt(r)} width={28} height={36} className="h-9 w-7 rounded object-cover" />
                ) : (
                  <div className="h-9 w-7 rounded bg-ink-800" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm text-white">
                  {cardDisplayName(r.name, r)} <span className="text-xs text-slate-500">{r.setCode} {r.collectorNumber}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
