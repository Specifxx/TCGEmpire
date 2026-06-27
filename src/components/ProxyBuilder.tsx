"use client";

import { useEffect, useState } from "react";

interface ProxyCard {
  id: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  img: string | null;
  qty: number;
}

interface SearchResult {
  id: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  imageUrl: string | null;
  imageThumbUrl: string | null;
}

function decodeList(code: string): string {
  try {
    return decodeURIComponent(escape(atob(code)));
  } catch {
    return "";
  }
}

export function ProxyBuilder({ initialList }: { initialList?: string }) {
  const [cards, setCards] = useState<ProxyCard[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [seeding, setSeeding] = useState(!!initialList);

  // Seed the selection from a deck list (?list=) when arriving from the builder.
  useEffect(() => {
    if (!initialList) return;
    const text = decodeList(initialList);
    if (!text.trim()) { setSeeding(false); return; }
    (async () => {
      try {
        const res = await fetch("/api/deck/price", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const data = await res.json();
        const out: ProxyCard[] = [];
        for (const it of (data.items ?? []) as { qty: number; name: string; card: SearchResult | null }[]) {
          const c = it.card;
          if (c) out.push({ id: c.id, name: c.name, setCode: c.setCode, collectorNumber: c.collectorNumber, img: c.imageUrl ?? c.imageThumbUrl ?? null, qty: it.qty });
        }
        setCards(out);
      } catch {
        /* ignore */
      } finally {
        setSeeding(false);
      }
    })();
  }, [initialList]);

  // Debounced search.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const d = await res.json();
        setResults((d.results ?? []).slice(0, 8));
      } catch {
        /* ignore */
      }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  function addCard(r: SearchResult) {
    setCards((cs) => {
      const i = cs.findIndex((c) => c.id === r.id);
      if (i >= 0) return cs.map((c, j) => (j === i ? { ...c, qty: c.qty + 1 } : c));
      return [...cs, { id: r.id, name: r.name, setCode: r.setCode, collectorNumber: r.collectorNumber, img: r.imageUrl ?? r.imageThumbUrl ?? null, qty: 1 }];
    });
    setQ("");
    setResults([]);
    setOpen(false);
  }
  function setQty(id: string, qty: number) {
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, qty: Math.max(1, Math.min(99, qty)) } : c)));
  }
  function remove(id: string) {
    setCards((cs) => cs.filter((c) => c.id !== id));
  }

  const totalCards = cards.reduce((n, c) => n + c.qty, 0);
  const printCards: { img: string | null; name: string }[] = [];
  for (const c of cards) for (let i = 0; i < c.qty; i++) printCards.push({ img: c.img, name: c.name });
  const pages = Math.ceil(printCards.length / 9) || 0;

  return (
    <div>
      <div className="no-print mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Proxy printer</h1>
          <p className="mt-1 text-sm text-slate-400">
            Search for cards, set quantities, and print test/proxy cards at real size (63×88 mm, 9 per A4 page).
          </p>
        </div>
        <button
          onClick={() => window.print()}
          disabled={printCards.length === 0}
          className="btn-primary shrink-0 disabled:opacity-50"
        >
          🖨 Print {totalCards > 0 ? `${totalCards} card${totalCards === 1 ? "" : "s"} · ${pages} page${pages === 1 ? "" : "s"}` : ""}
        </button>
      </div>

      {/* Card picker */}
      <div className="no-print card-surface mb-4 p-4">
        <div className="relative">
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Search a card to add — e.g. Sabotage, Master Yi…"
            className="input"
          />
          {open && results.length > 0 && (
            <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-ink-700 bg-ink-850 shadow-2xl">
              {results.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => addCard(r)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-ink-800">
                    <div className="h-12 w-9 shrink-0 overflow-hidden rounded bg-ink-900">
                      {(r.imageThumbUrl ?? r.imageUrl) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.imageThumbUrl ?? r.imageUrl ?? ""} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-white">{r.name}</div>
                      <div className="text-xs text-slate-500">{r.setCode} · {r.collectorNumber}</div>
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-brand-400">+ Add</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Selected cards */}
        {seeding ? (
          <p className="mt-4 text-sm text-slate-500">Loading deck…</p>
        ) : cards.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No cards yet — search above to add some, or open the <a href="/deck" className="text-brand-400 hover:underline">Deck Builder</a> and hit “Proxy sheet”.</p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {cards.map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-900 p-2">
                <div className="h-12 w-9 shrink-0 overflow-hidden rounded bg-ink-950">
                  {c.img && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.img} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-white">{c.name}</div>
                  <div className="mt-1 flex items-center gap-1">
                    <button aria-label="Decrease quantity" onClick={() => setQty(c.id, c.qty - 1)} className="grid h-5 w-5 place-items-center rounded bg-ink-800 text-slate-300 hover:bg-ink-700">−</button>
                    <span className="w-5 text-center text-xs text-white">{c.qty}</span>
                    <button aria-label="Increase quantity" onClick={() => setQty(c.id, c.qty + 1)} className="grid h-5 w-5 place-items-center rounded bg-ink-800 text-slate-300 hover:bg-ink-700">+</button>
                    <button onClick={() => remove(c.id)} aria-label="Remove" className="ml-1 text-slate-500 hover:text-rose-400">✕</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {printCards.length > 0 && (
        <>
          <div className="no-print mb-4 rounded-xl border border-ink-700 bg-ink-900/60 p-3 text-xs text-slate-400">
            Tip: in the print dialog set margins to <b>Default</b> and scale to <b>100%</b> (turn OFF “fit to page”) so
            cards print at the correct size. Print on cardstock for sturdier proxies. Proxies are for personal
            playtesting only.
          </div>
          <div className="proxy-grid">
            {printCards.map((c, i) =>
              c.img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <div key={i} className="proxy-card">
                  <img src={c.img} alt={c.name} />
                </div>
              ) : (
                <div key={i} className="proxy-card grid place-items-center text-center text-[8px] text-slate-400">{c.name}</div>
              )
            )}
          </div>
        </>
      )}
    </div>
  );
}
