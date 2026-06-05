"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatAUD } from "@/lib/format";

interface Result {
  id: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  variant: string | null;
  imageThumbUrl: string | null;
  lowestPriceCents: number | null;
}

// Search with a live preview dropdown (debounced + abortable so typing stays
// snappy). Submitting still does a real navigation to the results page.
export function SearchBar() {
  const router = useRouter();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced fetch of preview results.
  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const data = await res.json();
        setResults(data.results ?? []);
      } catch {
        /* aborted or failed — ignore */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [value]);

  // Close on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    setOpen(false);
    router.push(q ? `/browse?q=${encodeURIComponent(q)}` : "/browse");
  }

  const showDropdown = open && value.trim().length >= 2;

  return (
    <div ref={boxRef} className="relative max-w-xl">
      <form onSubmit={submit}>
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search cards, champions, sets…"
          className="input pl-9"
          aria-label="Search cards"
          autoComplete="off"
          enterKeyHint="search"
        />
      </form>

      {showDropdown && (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-ink-700 bg-ink-850 shadow-2xl">
          {results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-slate-400">
              {loading ? "Searching…" : "No matches — press Enter to search anyway."}
            </div>
          ) : (
            <ul className="max-h-[70vh] overflow-y-auto py-1">
              {results.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/card/${r.id}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-ink-800"
                  >
                    <div className="h-12 w-9 shrink-0 overflow-hidden rounded bg-ink-900">
                      {r.imageThumbUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.imageThumbUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-white">{r.name}</div>
                      <div className="text-xs text-slate-500">
                        {r.setCode} · {r.collectorNumber}
                        {r.variant ? ` · Alt ${r.variant}` : ""}
                      </div>
                    </div>
                    <div className="shrink-0 text-sm font-bold text-accent">
                      {r.lowestPriceCents != null ? formatAUD(r.lowestPriceCents) : "—"}
                    </div>
                  </Link>
                </li>
              ))}
              <li className="border-t border-ink-800">
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    submit(e as unknown as React.FormEvent);
                  }}
                  className="w-full px-4 py-2 text-left text-xs text-brand-400 hover:bg-ink-800"
                >
                  See all results for “{value.trim()}” →
                </button>
              </li>
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
