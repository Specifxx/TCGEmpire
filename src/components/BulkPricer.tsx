"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCountry } from "./CountryProvider";
import { COUNTRIES } from "@/lib/country";
import { cardHref } from "@/lib/card-url";
import { cardDisplayName } from "@/lib/card-name";
import { cardImageAlt } from "@/lib/image-alt";
import { CardSearch, type SearchCard } from "./CardSearch";

// UTF-8-safe base64 so a shared list (incl. accented names) survives a URL round-trip.
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

// The shared /api/deck/price matcher (see lib/deck.ts's parseDeckList) expects a
// leading quantity per line ("3 Jinx, Loose Cannon") — that's the right default for
// a decklist, but a bulk price CHECK is usually just a plain list of card names (a
// want-list, a collection export, cards you're about to sell) with no quantities in
// mind. Prefix a "1 " onto any line that doesn't already start with one so plain
// names still price correctly, without touching the shared parser (used by the
// separate Deck Builder tool) or its API.
function ensureQuantities(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#")) return line;
      return /^\d+\s*[xX]?\s+\S/.test(trimmed) ? line : `1 ${trimmed}`;
    })
    .join("\n");
}

// One card, resolved to an exact printing, with a quantity — regardless of whether
// it arrived via search-and-add (already an exact printing) or a pasted decklist
// (matched by name to its cheapest printing — same as the old paste-only flow).
interface PickedCard {
  id: string;
  slug: string | null; // cardHref requires this to stay non-optional — see lib/card-url.ts
  name: string;
  setCode: string;
  collectorNumber: string;
  imageThumbUrl: string | null;
  variant: string | null;
  isPromo: boolean;
  rarity: string;
  lowestPriceCents: number | null;
  lowestPriceCentsUs?: number | null;
  lowestPriceCentsUk?: number | null;
  lowestPriceCentsSg?: number | null;
  lowestPriceCentsCa?: number | null;
  lowestPriceCentsDe?: number | null;
}

interface PickedLine {
  card: PickedCard;
  qty: number;
}

function fromSearchCard(c: SearchCard): PickedCard {
  return { ...c, slug: c.slug ?? null };
}

// /api/deck/price's matched-card shape — a plain name match doesn't know isPromo or
// rarity (it just takes the cheapest printing for the name), so those default off.
interface ApiMatchedCard {
  id: string;
  slug: string | null;
  name: string;
  setCode: string;
  collectorNumber: string;
  imageThumbUrl: string | null;
  variant: string | null;
  lowestPriceCents: number | null;
  lowestPriceCentsUs?: number | null;
  lowestPriceCentsUk?: number | null;
  lowestPriceCentsSg?: number | null;
  lowestPriceCentsCa?: number | null;
  lowestPriceCentsDe?: number | null;
}
function fromApiCard(c: ApiMatchedCard): PickedCard {
  return { ...c, isPromo: false, rarity: "" };
}

interface Item {
  qty: number;
  card: PickedCard;
  unitPriceCents: number | null;
  lineCents: number;
}

interface Result {
  items: Item[];
  totalQty: number;
  totalCents: number;
  pricedQty: number;
}

const SAMPLE = `Jinx, Loose Cannon
Kai'Sa, Survivor
Ahri, Inquisitive
Darius, Hand of Noxus
2 Kai'Sa, Evolutionary`;

// Round-trips through a plain decklist line so a shared link can rebuild the exact
// same list via the same /api/deck/price matcher used for the paste flow — the set
// + number keeps it matching the specific printing that was searched-and-added,
// not just "cheapest card with this name".
function pickedToText(picked: PickedLine[]): string {
  return picked
    .map((p) => `${p.qty} ${p.card.name} (${p.card.setCode}-${p.card.collectorNumber.split("/")[0]})`)
    .join("\n");
}

const QTY_CAP = 99;

// Primary flow: search for a card, add it, adjust the quantity — the same
// search-and-add pattern Best Basket uses. Pasting a decklist is kept as a
// secondary "advanced" option for anyone who already has a list (a deck export,
// a trade list) rather than adding cards one at a time; a paste MERGES into the
// same list rather than replacing it, so the two ways of building a list compose.
export function BulkPricer({ initialList }: { initialList?: string }) {
  const { fmt, price: pickCardPrice, country } = useCountry();
  const [picked, setPicked] = useState<PickedLine[]>([]);
  const [preview, setPreview] = useState<PickedCard | null>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [pasteNotice, setPasteNotice] = useState<string | null>(null);
  const [shared, setShared] = useState(false);
  const autoRan = useRef(false);

  function addCard(c: SearchCard) {
    const card = fromSearchCard(c);
    setPicked((prev) => {
      const i = prev.findIndex((p) => p.card.id === card.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: Math.min(QTY_CAP, next[i].qty + 1) };
        return next;
      }
      return [...prev, { card, qty: 1 }];
    });
    setPreview(card);
  }

  function setQty(cardId: string, qty: number) {
    setPicked((prev) => prev.map((p) => (p.card.id === cardId ? { ...p, qty: Math.max(1, Math.min(QTY_CAP, qty)) } : p)));
  }

  function removeCard(cardId: string) {
    setPicked((prev) => prev.filter((p) => p.card.id !== cardId));
  }

  // Match a pasted list's lines to cards and MERGE the matches into the picked
  // list (incrementing quantity for a card already in it), rather than replacing
  // whatever was already built up via search-and-add.
  async function mergePasted(listText: string) {
    if (!listText.trim()) return;
    setParsing(true);
    setPasteNotice(null);
    try {
      const res = await fetch("/api/deck/price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: ensureQuantities(listText) }),
      });
      const data: { items: { qty: number; card: ApiMatchedCard | null }[] } = await res.json();
      let added = 0;
      let unmatched = 0;
      setPicked((prev) => {
        const next = [...prev];
        for (const it of data.items) {
          if (!it.card) { unmatched++; continue; }
          added++;
          const card = fromApiCard(it.card);
          const i = next.findIndex((p) => p.card.id === card.id);
          if (i >= 0) next[i] = { ...next[i], qty: Math.min(QTY_CAP, next[i].qty + it.qty) };
          else next.push({ card, qty: Math.min(QTY_CAP, it.qty) });
        }
        return next;
      });
      setPasteNotice(
        unmatched > 0
          ? `Added ${added} card${added === 1 ? "" : "s"} to your list — ${unmatched} line${unmatched === 1 ? "" : "s"} couldn't be matched.`
          : `Added ${added} card${added === 1 ? "" : "s"} to your list.`
      );
      setPasteText("");
    } catch {
      setPasteNotice("Network error — try again.");
    } finally {
      setParsing(false);
    }
  }

  // A shared link (?list=) carries a plain decklist the same way a paste does —
  // merge it in once on load, and open the paste panel so it's clear where it came
  // from if the visitor wants to add more by hand.
  useEffect(() => {
    if (autoRan.current || !initialList) return;
    const decoded = decodeList(initialList);
    if (!decoded.trim()) return;
    autoRan.current = true;
    setShowPaste(true);
    void mergePasted(decoded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Purely derived from `picked` + the current market — recomputes instantly (no
  // round trip) since every picked card already carries every market's price.
  const result: Result | null = useMemo(() => {
    if (picked.length === 0) return null;
    const items: Item[] = picked.map((p) => {
      const unit = pickCardPrice(p.card);
      return { qty: p.qty, card: p.card, unitPriceCents: unit, lineCents: unit != null ? unit * p.qty : 0 };
    });
    return {
      items,
      totalQty: items.reduce((n, i) => n + i.qty, 0),
      totalCents: items.reduce((n, i) => n + i.lineCents, 0),
      pricedQty: items.filter((i) => i.unitPriceCents != null).reduce((n, i) => n + i.qty, 0),
    };
  }, [picked, pickCardPrice]);

  async function share() {
    if (picked.length === 0) return;
    const url = `${window.location.origin}/bulk-pricer?list=${encodeURIComponent(encodeList(pickedToText(picked)))}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
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
          <label className="mb-1 block text-sm font-semibold text-white">Search for a card and add it to your list</label>
          <p className="mb-2 text-xs text-slate-500">
            Add as many cards as you want, then adjust the quantity on each one — like your collection, but priced
            up as a bulk total.
          </p>
          <CardSearch placeholder="e.g. Jinx, Loose Cannon" onPick={addCard} />

          {picked.length > 0 && (
            <ul className="mt-3 max-h-[28rem] divide-y divide-ink-800 overflow-y-auto rounded-lg border border-ink-800">
              {picked.map((p) => (
                <li
                  key={p.card.id}
                  onMouseEnter={() => setPreview(p.card)}
                  className="flex items-center gap-2.5 p-2.5"
                >
                  {p.card.imageThumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.card.imageThumbUrl} alt={cardImageAlt(p.card)} width={28} height={40} className="h-10 w-7 shrink-0 rounded object-cover" />
                  ) : (
                    <div className="h-10 w-7 shrink-0 rounded bg-ink-800" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-white">{cardDisplayName(p.card.name, p.card)}</div>
                    <div className="truncate text-xs text-slate-500">
                      {p.card.setCode} · {p.card.collectorNumber}
                      {(() => {
                        const c = pickCardPrice(p.card);
                        return c != null ? <> · <span className="text-accent">{fmt(c)}</span></> : null;
                      })()}
                    </div>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={QTY_CAP}
                    value={p.qty}
                    onChange={(e) => setQty(p.card.id, parseInt(e.target.value, 10) || 1)}
                    aria-label={`Quantity for ${p.card.name}`}
                    className="input w-14 shrink-0 py-1 text-center text-sm"
                  />
                  <button
                    onClick={() => removeCard(p.card.id)}
                    aria-label={`Remove ${p.card.name}`}
                    className="shrink-0 text-slate-600 hover:text-rose-300"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            onClick={share}
            disabled={picked.length === 0}
            type="button"
            className="btn-ghost mt-3 w-full text-sm disabled:opacity-50"
            title="Copy a link that loads and prices this exact list"
          >
            {shared ? "✓ Link copied!" : "🔗 Copy shareable link"}
          </button>

          <div className="mt-3 border-t border-ink-800 pt-3">
            <button type="button" onClick={() => setShowPaste((v) => !v)} className="text-xs text-slate-500 hover:text-slate-300">
              {showPaste ? "Hide" : "Advanced: paste a decklist instead"}
            </button>
            {showPaste && (
              <div className="mt-3">
                <p className="mb-2 text-xs text-slate-500">
                  One card per line — a plain name is fine (<span className="font-mono">Jinx, Loose Cannon</span>), or
                  add a quantity (<span className="font-mono">2 Jinx, Loose Cannon</span>). Matched cards are added to
                  the list above.
                </p>
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={8}
                  placeholder={"Jinx, Loose Cannon\nKai'Sa, Survivor\n…"}
                  className="input font-mono text-sm"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => void mergePasted(pasteText)}
                    disabled={parsing || !pasteText.trim()}
                    className="btn-ghost flex-1 text-sm disabled:opacity-50"
                  >
                    {parsing ? "Adding…" : "Add to list"}
                  </button>
                  <button onClick={() => setPasteText(SAMPLE)} className="btn-ghost text-sm" type="button">
                    Sample
                  </button>
                </div>
                {pasteNotice && <p className="mt-2 text-xs text-slate-400">{pasteNotice}</p>}
              </div>
            )}
          </div>
        </div>

        {/* Card preview — fills in when you hover a card in your list. */}
        {picked.length > 0 && (
          <div className="mt-4 hidden lg:block">
            <div className="card-surface overflow-hidden">
              <div className="relative aspect-[5/7] w-full bg-ink-900">
                {preview?.imageThumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview.imageThumbUrl} alt={cardImageAlt(preview)} className="h-full w-full object-cover object-top" />
                ) : (
                  <div className="grid h-full place-items-center p-4 text-center text-xs text-slate-500">
                    Hover a card in your list to preview it here
                  </div>
                )}
              </div>
              {preview && (
                <div className="p-3">
                  <div className="text-sm font-bold text-white">{cardDisplayName(preview.name, preview)}</div>
                  <div className="text-[11px] text-slate-500">
                    {preview.setCode} · {preview.collectorNumber}
                    {pickCardPrice(preview) != null ? ` · from ${fmt(pickCardPrice(preview)!)}` : ""}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="min-w-0">
        {!result ? (
          <div className="card-surface grid place-items-center p-16 text-center text-slate-400">
            <div>
              <p className="text-lg font-semibold text-white">Check prices for a whole list at once</p>
              <p className="mt-1 text-sm">
                Search and add as many cards as you want — a want-list, a trade, cards you&apos;re about to sell —
                and we&apos;ll total up the cheapest {COUNTRIES[country].adjective} prices as you go. Already have a
                list? Paste it instead.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="card-surface mb-4 flex flex-wrap items-center justify-between gap-4 p-5">
              <div className="flex gap-6">
                <Sum label="Total value" value={fmt(result.totalCents)} highlight />
                <Sum label="Cards" value={`${result.totalQty}`} />
              </div>
            </div>

            {/* Items */}
            <div className="card-surface overflow-hidden">
              <ul className="divide-y divide-ink-800">
                {result.items.map((it) => (
                  <li
                    key={it.card.id}
                    onMouseEnter={() => setPreview(it.card)}
                    className="flex items-center gap-3 p-3 transition-colors hover:bg-ink-900/50"
                  >
                    <div className="w-8 text-center font-bold text-slate-400">{it.qty}×</div>
                    {it.card.imageThumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.card.imageThumbUrl} alt={cardImageAlt(it.card)} width={36} height={48} className="h-12 w-9 shrink-0 rounded object-cover ring-1 ring-ink-700" />
                    ) : (
                      <div className="h-12 w-9 shrink-0 rounded bg-ink-800" />
                    )}
                    <div className="min-w-0 flex-1">
                      <Link href={cardHref(it.card)} className="font-medium text-white hover:text-brand-400">
                        {cardDisplayName(it.card.name, it.card)}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {it.card.setCode} · {it.card.collectorNumber}
                      </div>
                    </div>
                    <div className="text-right">
                      {it.unitPriceCents != null ? (
                        <>
                          <div className="font-bold text-white">{fmt(it.lineCents)}</div>
                          <div className="text-[11px] text-slate-500">{fmt(it.unitPriceCents)} ea</div>
                        </>
                      ) : (
                        <div className="text-xs text-slate-500">no price</div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between border-t border-ink-700 p-4">
                <span className="text-sm text-slate-400">
                  {result.pricedQty} of {result.totalQty} cards priced
                </span>
                <span className="text-xl font-extrabold text-accent">{fmt(result.totalCents)}</span>
              </div>
            </div>
            <p className="mt-3 text-center text-[11px] text-slate-600">
              Total uses each card&apos;s cheapest in-stock {country} price and may span multiple stores.
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
