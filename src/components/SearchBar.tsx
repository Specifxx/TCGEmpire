"use client";

import { useRouter } from "next/navigation";
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

export function SearchBar() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced fetch.
  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setResults(data.results ?? []);
        setOpen(true);
        setActive(-1);
      } catch {
        setResults([]);
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

  function go(id: string) {
    setOpen(false);
    setValue("");
    router.push(`/card/${id}`);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (active >= 0 && results[active]) return go(results[active].id);
    if (value.trim()) {
      setOpen(false);
      router.push(`/?q=${encodeURIComponent(value.trim())}`);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || !results.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Escape") setOpen(false);
  }

  return (
    <div ref={boxRef} className="relative max-w-xl">
      <form onSubmit={submit}>
        <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
        </svg>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search cards, champions, sets…"
          className="input pl-9"
          aria-label="Search cards"
          autoComplete="off"
        />
      </form>

      {open && (results.length > 0 || loading) && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-ink-700 bg-ink-850 shadow-card">
          {loading && results.length === 0 ? (
            <div className="px-3 py-3 text-sm text-slate-500">Searching…</div>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {results.map((r, i) => (
                <li key={r.id}>
                  <button
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(r.id)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left ${i === active ? "bg-ink-800" : "hover:bg-ink-800"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {r.imageThumbUrl ? (
                      <img src={r.imageThumbUrl} alt="" className="h-10 w-8 shrink-0 rounded object-cover" />
                    ) : (
                      <div className="h-10 w-8 shrink-0 rounded bg-ink-700" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-white">{r.name}</div>
                      <div className="text-xs text-slate-500">{r.setCode} · {r.collectorNumber}</div>
                    </div>
                    <div className="text-right text-sm font-semibold text-accent">
                      {r.lowestPriceCents != null ? formatAUD(r.lowestPriceCents) : ""}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
