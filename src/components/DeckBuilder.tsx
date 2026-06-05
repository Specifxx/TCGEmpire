"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatAUD } from "@/lib/format";

// UTF-8-safe base64 so a decklist (incl. accented names) survives a URL round-trip.
function encodeList(text: string): string {
  return btoa(unescape(encodeURIComponent(text)));
}
function decodeList(code: string): string {
  try {
    return decodeURIComponent(escape(atob(code)));
  } catch {
    return "";
  }
}

interface Item {
  raw: string;
  qty: number;
  name: string;
  card: {
    id: string;
    name: string;
    setCode: string;
    collectorNumber: string;
    variant: string | null;
    imageThumbUrl: string | null;
    lowestPriceCents: number | null;
  } | null;
  unitPriceCents: number | null;
  lineCents: number;
}

interface Result {
  items: Item[];
  totalQty: number;
  totalCents: number;
  matchedCount: number;
  unmatchedCount: number;
  pricedQty: number;
}

const SAMPLE = `1 Jinx, Loose Cannon
3 Kai'Sa, Survivor
3 Ahri, Inquisitive
2 Darius, Hand of Noxus
3 Kai'Sa, Evolutionary`;

export function DeckBuilder({ initialList }: { initialList?: string }) {
  const [text, setText] = useState(() => (initialList ? decodeList(initialList) : ""));
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [shared, setShared] = useState(false);
  const autoPriced = useRef(false);

  async function price(deck: string = text) {
    if (!deck.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/deck/price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: deck }),
      });
      setResult(await res.json());
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  // If the page was opened from a shared link, price the deck automatically once.
  useEffect(() => {
    if (!autoPriced.current && initialList && text.trim()) {
      autoPriced.current = true;
      void price(text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function share() {
    if (!text.trim()) return;
    const url = `${window.location.origin}/deck?list=${encodeURIComponent(encodeList(text))}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard blocked — fall back to putting the link in the address bar.
      window.history.replaceState(null, "", url);
    }
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      {/* Input */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        <div className="card-surface p-4">
          <label className="mb-1 block text-sm font-semibold text-white">Paste your decklist</label>
          <p className="mb-2 text-xs text-slate-500">
            One card per line: <span className="font-mono">quantity name</span> — e.g.{" "}
            <span className="font-mono">3 Jinx, Loose Cannon</span>. Set codes like{" "}
            <span className="font-mono">(OGN-251)</span> are optional. (TCGplayer Mass Entry format.)
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={14}
            placeholder={"3 Jinx, Loose Cannon\n3 Kai'Sa, Survivor\n…"}
            className="input font-mono text-sm"
          />
          <div className="mt-3 flex gap-2">
            <button onClick={() => price()} disabled={loading || !text.trim()} className="btn-primary flex-1">
              {loading ? "Pricing…" : "Price this deck"}
            </button>
            <button onClick={() => setText(SAMPLE)} className="btn-ghost" type="button">
              Sample
            </button>
          </div>
          <button
            onClick={share}
            disabled={!text.trim()}
            type="button"
            className="btn-ghost mt-2 w-full text-sm disabled:opacity-50"
            title="Copy a link that loads and prices this exact list"
          >
            {shared ? "✓ Link copied!" : "🔗 Copy shareable link"}
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="min-w-0">
        {loading ? (
          <div className="card-surface grid place-items-center p-16 text-center text-slate-400">
            <div className="flex flex-col items-center gap-3">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink-600 border-t-brand-400" />
              <p className="text-sm font-semibold text-white">Pricing your deck…</p>
              <p className="text-xs">Matching each card to the cheapest Australian price.</p>
            </div>
          </div>
        ) : !result ? (
          <div className="card-surface grid place-items-center p-16 text-center text-slate-400">
            <div>
              <p className="text-lg font-semibold text-white">Price a whole deck at once</p>
              <p className="mt-1 text-sm">
                Paste a decklist and we&apos;ll match every card and total up the cheapest
                Australian prices.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="card-surface mb-4 flex flex-wrap items-center justify-between gap-4 p-5">
              <div className="flex gap-6">
                <Sum label="Deck total" value={formatAUD(result.totalCents)} highlight />
                <Sum label="Cards" value={`${result.totalQty}`} />
                <Sum label="Matched" value={`${result.matchedCount}/${result.items.length}`} />
              </div>
              {result.unmatchedCount > 0 && (
                <p className="text-xs text-gold">
                  {result.unmatchedCount} line(s) couldn&apos;t be matched — check spelling or add a set code.
                </p>
              )}
            </div>

            {/* Items */}
            <div className="card-surface overflow-hidden">
              <ul className="divide-y divide-ink-800">
                {result.items.map((it, idx) => (
                  <li key={idx} className="flex items-center gap-3 p-3">
                    <div className="w-8 text-center font-bold text-slate-400">{it.qty}×</div>
                    {it.card?.imageThumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.card.imageThumbUrl} alt="" className="h-12 w-9 shrink-0 rounded object-cover" />
                    ) : (
                      <div className="h-12 w-9 shrink-0 rounded bg-ink-800" />
                    )}
                    <div className="min-w-0 flex-1">
                      {it.card ? (
                        <Link href={`/card/${it.card.id}`} className="font-medium text-white hover:text-brand-400">
                          {it.card.name}
                        </Link>
                      ) : (
                        <span className="font-medium text-slate-400">{it.name || it.raw}</span>
                      )}
                      <div className="text-xs text-slate-500">
                        {it.card ? (
                          <>{it.card.setCode} · {it.card.collectorNumber}</>
                        ) : (
                          <span className="text-gold">no match — “{it.raw}”</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      {it.unitPriceCents != null ? (
                        <>
                          <div className="font-bold text-white">{formatAUD(it.lineCents)}</div>
                          <div className="text-[11px] text-slate-500">{formatAUD(it.unitPriceCents)} ea</div>
                        </>
                      ) : (
                        <div className="text-xs text-slate-500">{it.card ? "no price" : "—"}</div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between border-t border-ink-700 p-4">
                <span className="text-sm text-slate-400">
                  {result.pricedQty} of {result.totalQty} cards priced
                </span>
                <span className="text-xl font-extrabold text-accent">{formatAUD(result.totalCents)}</span>
              </div>
            </div>
            <p className="mt-3 text-center text-[11px] text-slate-600">
              Total uses each card&apos;s cheapest in-stock AU price and may span multiple stores.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Sum({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-xl font-extrabold ${highlight ? "text-accent" : "text-white"}`}>{value}</div>
    </div>
  );
}
