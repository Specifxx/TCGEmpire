"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { cardHref } from "@/lib/card-url";
import { cardDisplayName } from "@/lib/card-name";
import { CONDITIONS, CONDITION_KEYS } from "@/lib/constants";
import { useCountry } from "./CountryProvider";
import { cardImageAlt } from "@/lib/image-alt";

type CollCard = {
  id: string;
  name: string;
  slug: string | null;
  setCode: string | null;
  collectorNumber: string | null;
  imageThumbUrl: string | null;
  variant: string | null;
  isPromo: boolean;
  rarity: string | null;
  lowestPriceCents: number | null;
  lowestPriceCentsUs: number | null;
  lowestPriceCentsUk: number | null;
  lowestPriceCentsSg: number | null;
  lowestPriceCentsCa: number | null;
  lowestPriceCentsDe: number | null;
};
type Item = {
  id: string;
  cardId: string;
  condition: string;
  isFoil: boolean;
  quantity: number;
  costBasisCents: number | null;
  note: string | null;
  card: CollCard;
};

// "My Collection" — a personal, valued list of cards the user owns. Separate from
// the wishlist (want) and decks (play). Populated by the "Add to collection" button
// in the card pop-up. Shows the live value of the whole collection.
export function MyCollection() {
  const { fmt, price } = useCountry();
  const [items, setItems] = useState<Item[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    return fetch("/api/collection")
      .then((r) => {
        if (!r.ok) throw new Error("collection fetch failed");
        return r.json();
      })
      .then((d) => setItems(d.items ?? []))
      // A failed fetch must NOT read as "you own nothing" — that's indistinguishable
      // from a genuinely empty collection and would tell a real collector their
      // holdings vanished. Keep items unset and show a retry affordance instead.
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => {
    if (!items) return { distinct: 0, total: 0, value: 0, priced: false };
    let total = 0, value = 0, priced = false;
    for (const it of items) {
      total += it.quantity;
      const p = price(it.card);
      if (p != null) { value += p * it.quantity; priced = true; }
    }
    return { distinct: items.length, total, value, priced };
  }, [items, price]);

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id);
    try {
      const res = await fetch(`/api/collection/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (data.merged) {
        const fresh = await fetch("/api/collection").then((r) => r.json()).catch(() => null);
        if (fresh?.items) setItems(fresh.items);
        return;
      }
      setItems((prev) => {
        if (!prev) return prev;
        if (data.deleted) return prev.filter((x) => x.id !== id);
        if (data.item) return prev.map((x) => (x.id === id ? { ...x, ...data.item } : x));
        return prev;
      });
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    try {
      await fetch(`/api/collection/${id}`, { method: "DELETE" });
      setItems((prev) => (prev ? prev.filter((x) => x.id !== id) : prev));
    } finally {
      setBusy(null);
    }
  }

  // Re-pull the collection after an add/import.
  const refresh = useCallback(async () => {
    const fresh = await fetch("/api/collection").then((r) => r.json()).catch(() => null);
    if (fresh?.items) setItems(fresh.items);
  }, []);

  return (
    <div id="collection" className="card-surface mt-5 scroll-mt-20 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-white">My Collection</h2>
          <p className="text-sm text-slate-400">
            {loadError
              ? "Couldn't load your collection."
              : items == null
              ? "Loading…"
              : items.length === 0
              ? "Your collection is empty."
              : `${summary.distinct} ${summary.distinct === 1 ? "card" : "cards"} · ${summary.total} total${summary.priced ? ` · worth ~${fmt(summary.value)}` : ""}`}
          </p>
        </div>
        <button onClick={() => setImporting((v) => !v)} className="btn-ghost shrink-0 text-sm">📋 Import a list</button>
      </div>

      {/* Search any card and add it without leaving the page. */}
      <div className="mt-3">
        <CollectionSearch onAdded={refresh} />
      </div>

      {importing && <BulkImport onDone={refresh} />}

      {loadError && (
        <p role="alert" className="mt-4 text-sm text-rose-400">
          Something went wrong loading your collection — it&apos;s still there, this page just couldn&apos;t reach it.{" "}
          <button onClick={() => void load()} className="font-semibold text-brand-300 hover:underline">
            Try again
          </button>
        </p>
      )}

      {!loadError && items != null && items.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">
          Search a card above (or <span className="font-semibold text-brand-300">📋 Import a list</span>) to start tracking what you own — we&apos;ll value the whole thing live as prices move. It&apos;s separate from any{" "}
          <Link href="/browse" className="text-brand-400 hover:underline">price watches</Link> you&apos;ve set.
        </p>
      )}

      {items != null && items.length > 0 && (
        <ul className="mt-4 divide-y divide-ink-800">
          {items.map((it) => {
            const unit = price(it.card);
            const cond = CONDITIONS[it.condition];
            return (
              <li key={it.id} className="flex items-center gap-3 py-3">
                <Link href={cardHref(it.card as any)} className="h-14 w-10 shrink-0 overflow-hidden rounded bg-ink-900">
                  {it.card.imageThumbUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.card.imageThumbUrl} alt={cardImageAlt({ ...it.card, name: cardDisplayName(it.card.name, it.card) })} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                  )}
                </Link>

                <div className="min-w-0 flex-1">
                  <Link href={cardHref(it.card as any)} className="block truncate text-sm font-semibold text-white hover:underline">
                    {cardDisplayName(it.card.name, it.card)}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    <span>{it.card.setCode} · {it.card.collectorNumber}</span>
                    {it.isFoil && <span className="chip bg-gold/15 text-gold">✦ Foil</span>}
                    {unit != null && <span>· {fmt(unit)} ea</span>}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select
                      value={it.condition}
                      onChange={(e) => patch(it.id, { condition: e.target.value })}
                      disabled={busy === it.id}
                      className="rounded-md border border-ink-700 bg-ink-900 px-1.5 py-1 text-xs text-white"
                      style={{ color: cond?.color }}
                      aria-label="Condition"
                    >
                      {CONDITION_KEYS.map((k) => (
                        <option key={k} value={k} style={{ color: "#fff" }}>{CONDITIONS[k].full}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => patch(it.id, { isFoil: !it.isFoil })}
                      disabled={busy === it.id}
                      className={`rounded-md px-2 py-1 text-xs font-medium ${it.isFoil ? "bg-gold/20 text-gold" : "bg-ink-800 text-slate-400 hover:text-slate-200"}`}
                    >
                      ✦ Foil
                    </button>
                    <div className="flex items-center overflow-hidden rounded-md border border-ink-700">
                      <button onClick={() => patch(it.id, { quantity: Math.max(0, it.quantity - 1) })} disabled={busy === it.id} className="px-2 py-1 text-sm text-slate-300 hover:bg-ink-800" aria-label="Decrease quantity">−</button>
                      <span className="min-w-8 px-2 text-center text-sm font-semibold text-white">{it.quantity}</span>
                      <button onClick={() => patch(it.id, { quantity: Math.min(999, it.quantity + 1) })} disabled={busy === it.id} className="px-2 py-1 text-sm text-slate-300 hover:bg-ink-800" aria-label="Increase quantity">+</button>
                    </div>
                    {/* Price paid per unit — powers the Premium profit/loss view on /portfolio. */}
                    <CostInput cents={it.costBasisCents} disabled={busy === it.id} onSave={(cents) => patch(it.id, { costBasisCents: cents })} />
                    <button onClick={() => remove(it.id)} disabled={busy === it.id} className="ml-auto text-xs text-slate-500 hover:text-red-400">Remove</button>
                  </div>
                </div>

                <div className="shrink-0 self-start text-right">
                  <div className="text-sm font-bold text-accent">{unit != null ? fmt(unit * it.quantity) : "—"}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type SearchCard = {
  id: string;
  name: string;
  slug: string | null;
  setCode: string | null;
  collectorNumber: string | null;
  imageThumbUrl: string | null;
};

// In-page card search: type a name, pick a result, and it's added to the collection
// (1× Near Mint) without leaving the page. Reuses the navbar typeahead endpoint.
function CollectionSearch({ onAdded }: { onAdded: () => void | Promise<void> }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchCard[]>([]);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(t)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d) => {
          setResults((d.results ?? []) as SearchCard[]);
          setOpen(true);
        })
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [q]);

  async function add(card: SearchCard) {
    setAdding(card.id);
    try {
      const res = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: card.id }),
      });
      if (res.ok) {
        setJustAdded(card.id);
        setTimeout(() => setJustAdded((v) => (v === card.id ? null : v)), 1500);
        await onAdded();
      }
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="🔎 Search a card to add to your collection…"
        className="input"
        autoComplete="off"
      />
      {open && results.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-ink-700 bg-ink-900 shadow-2xl">
          {results.map((c) => (
            <li key={c.id}>
              <button
                onMouseDown={(e) => e.preventDefault()} // keep dropdown open through the click
                onClick={() => add(c)}
                disabled={adding === c.id}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-ink-800 disabled:opacity-60"
              >
                {c.imageThumbUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.imageThumbUrl} alt={cardImageAlt(c)} width={28} height={39} loading="lazy" decoding="async" className="h-10 w-7 shrink-0 rounded-sm object-cover" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white">{c.name}</span>
                  <span className="block text-[11px] text-slate-500">{c.setCode} · {c.collectorNumber}</span>
                </span>
                <span className={`shrink-0 text-xs font-semibold ${justAdded === c.id ? "text-brand-400" : "text-slate-400"}`}>
                  {adding === c.id ? "…" : justAdded === c.id ? "✓ Added" : "+ Add"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Bulk import: paste a list ("3 Jinx, Loose Cannon" per line) to add many cards at
// once. Matches by name; reports how many were added and anything it couldn't find.
function BulkImport({ onDone }: { onDone: (res: unknown) => Promise<unknown> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ added: number; matchedCards: number; unmatched: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/collection/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "Import failed");
        return;
      }
      setResult(d);
      setText("");
      await onDone(d);
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-ink-700 bg-ink-900/60 p-4">
      <label className="mb-1 block text-xs font-medium text-slate-400">
        Paste a list — one card per line, e.g. <span className="text-slate-300">3 Jinx, Loose Cannon</span>
      </label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder={"4 Jinx, Loose Cannon\n2 Vayne, Hunter\n1 Yasuo, the Unforgiven"}
        className="input font-mono text-sm"
      />
      <div className="mt-2 flex items-center gap-2">
        <button onClick={submit} disabled={busy || !text.trim()} className="btn-primary text-sm disabled:opacity-50">
          {busy ? "Importing…" : "Add to collection"}
        </button>
        <span className="text-[11px] text-slate-600">Adds at Near Mint · adjust condition/qty/cost after.</span>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-rose-400">{error}</p>}
      {result && (
        <div role="status" className="mt-2 text-sm">
          <p className="font-semibold text-brand-300">✓ Added {result.matchedCards} card{result.matchedCards === 1 ? "" : "s"} to your collection.</p>
          {result.unmatched.length > 0 && (
            <p className="mt-1 text-xs text-amber-300/90">
              Couldn&apos;t match: <span className="text-slate-400">{result.unmatched.join(" · ")}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Inline "paid $" editor for a holding's cost basis. Commits on blur/Enter; an
// empty value clears the cost basis. Stored in cents, edited in dollars.
function CostInput({ cents, disabled, onSave }: { cents: number | null; disabled: boolean; onSave: (cents: number | null) => void }) {
  const [val, setVal] = useState(cents != null ? (cents / 100).toString() : "");
  useEffect(() => setVal(cents != null ? (cents / 100).toString() : ""), [cents]);

  function commit() {
    const t = val.trim();
    if (t === "") {
      if (cents != null) onSave(null);
      return;
    }
    const n = Math.round(parseFloat(t) * 100);
    if (Number.isFinite(n) && n >= 0 && n !== cents) onSave(n);
  }

  return (
    <label className="flex items-center gap-1 rounded-md border border-ink-700 bg-ink-900 px-1.5 py-1 text-xs text-slate-500" title="What you paid per card — used for your portfolio profit/loss">
      paid
      <input
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        disabled={disabled}
        placeholder="—"
        aria-label="Price paid per unit"
        className="w-14 bg-transparent text-right text-white outline-none placeholder:text-slate-600"
      />
    </label>
  );
}
