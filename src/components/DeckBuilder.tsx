"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCountry } from "./CountryProvider";
import { COUNTRIES } from "@/lib/country";
import { cardHref } from "@/lib/card-url";
import { cardDisplayName } from "@/lib/card-name";
import { cardImageAlt } from "@/lib/image-alt";
import { cardImageSrc } from "@/lib/card-image-url";
import { formatDeckLine } from "@/lib/deck";
import { trackEvent } from "@/lib/analytics";
import { CardSearch, type SearchCard } from "./CardSearch";
import { QtyInput } from "./QtyInput";

// The deck builder and list pricer — the free, no-account tool behind /deck.
//
// Since 2026-09-25 it is also the site's bulk price checker: the Premium Bulk
// Pricer was a paywall over this same /api/deck/price, so its capabilities were
// merged in here and it was deleted. What came across:
//   • plain names without quantities ("Jinx, Loose Cannon" = one copy), with
//     section headers skipped instead of priced as phantom cards;
//   • every line that couldn't be matched listed, with "search for this";
//   • quantity editing and remove on every line;
//   • search-to-add, card by card.
//
// Model: pricing a pasted list REPLACES the working list; search-to-add and the
// quantity boxes edit it. While the paste box hasn't been edited since the last
// price, it is kept in step with the list, so what you see in it is what gets
// shared, handed to Best Basket, or re-priced.

// The builder has no persisted "save deck" feature (a list only ever lives in a
// shareable URL, see share() below) — so deck_create fires on a user PRICING
// their own pasted list, the closest real action to "created a deck" this tool
// has. deck_id is a short, non-cryptographic hash of the list text (stable for
// the same list, no server round-trip needed for an id that only ever feeds an
// analytics param).
function shortHash(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// UTF-8-safe base64 so a decklist (incl. accented names) survives a URL round-trip.
// The same encoding /tools/best-basket's ?list= decodes.
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

interface DeckBuilderCard {
  id: string;
  slug: string | null;
  name: string;
  setCode: string;
  collectorNumber: string;
  variant: string | null;
  isPromo: boolean;
  rarity: string;
  imageThumbUrl: string | null;
  lowestPriceCents: number | null;
  lowestPriceCentsUs?: number | null;
  lowestPriceCentsUk?: number | null;
  lowestPriceCentsSg?: number | null;
  lowestPriceCentsCa?: number | null;
  lowestPriceCentsEu?: number | null;
}

// /api/deck/price's line shape.
interface ApiItem {
  raw: string;
  qty: number;
  name: string;
  card: DeckBuilderCard | null;
  fuzzy: boolean;
  pinned: boolean;
}

interface Line {
  card: DeckBuilderCard;
  qty: number;
  // The line named its printing (set + number) or it was picked from search:
  // keep that printing when the list is shared or handed on. Otherwise the bare
  // name goes out and re-resolves to the cheapest printing.
  pinned: boolean;
  // Matched only by the name-contains fallback: the text that was guessed from.
  fuzzyFrom: string | null;
}

interface Unmatched {
  key: number;
  raw: string;
  name: string;
  qty: number;
}

// Where a search pick should land: a new line, or fixing one we guessed at or
// couldn't match.
type SearchTarget = { kind: "unmatched"; key: number } | { kind: "fuzzy"; cardId: string } | null;

const SAMPLE = `1 Jinx, Loose Cannon
3 Kai'Sa, Survivor
3 Ahri, Inquisitive
2 Darius, Hand of Noxus
3 Kai'Sa, Evolutionary`;

const QTY_CAP = 99;

function listToText(lines: Line[], unmatched: Unmatched[]): string {
  return [
    ...lines.map((l) => (l.fuzzyFrom ? `${l.qty} ${l.fuzzyFrom}` : formatDeckLine(l.qty, l.card, l.pinned))),
    ...unmatched.map((u) => u.raw),
  ].join("\n");
}

function fromSearchCard(c: SearchCard): DeckBuilderCard {
  return { ...c, slug: c.slug ?? null };
}

let unmatchedSeq = 0;

export function DeckBuilder({ initialList }: { initialList?: string }) {
  const { fmt, price: pickCardPrice, country } = useCountry();
  const [text, setText] = useState(() => (initialList ? decodeList(initialList) : ""));
  // The paste box was edited since the list was last priced from (or synced
  // to) it — then it is left alone rather than overwritten by list edits.
  const [dirty, setDirty] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [unmatched, setUnmatched] = useState<Unmatched[]>([]);
  const [priced, setPriced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [shared, setShared] = useState<"copied" | "address-bar" | null>(null);
  const [preview, setPreview] = useState<DeckBuilderCard | null>(null);
  const [search, setSearch] = useState<{ n: number; q: string; target: SearchTarget }>({ n: 0, q: "", target: null });
  const searchBox = useRef<HTMLDivElement>(null);
  const autoPriced = useRef(false);

  // Replace the list — and, unless the paste box has unsaved edits, the text.
  function commit(nextLines: Line[], nextUnmatched: Unmatched[], syncText = !dirty) {
    setLines(nextLines);
    setUnmatched(nextUnmatched);
    if (syncText) {
      setText(listToText(nextLines, nextUnmatched));
      setDirty(false);
    }
  }

  async function price(deck: string = text, isUserAction = false) {
    if (!deck.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/deck/price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: deck }),
      });
      const data: { items?: ApiItem[]; truncated?: boolean; error?: string } = await res.json().catch(() => ({}));
      if (!res.ok || !data.items) {
        setError(data.error ?? "Couldn't price that list just now — try again in a moment.");
        return;
      }
      // Counted here, from the response — not inside a state updater, which
      // React may run later (the Bulk Pricer's "Added 0 cards" bug).
      const merged = new Map<string, Line>();
      const missed: Unmatched[] = [];
      for (const it of data.items) {
        if (!it.card) {
          missed.push({ key: ++unmatchedSeq, raw: it.raw, name: it.name, qty: it.qty });
          continue;
        }
        const ex = merged.get(it.card.id);
        if (ex) ex.qty = Math.min(QTY_CAP, ex.qty + it.qty);
        else merged.set(it.card.id, { card: it.card, qty: it.qty, pinned: it.pinned, fuzzyFrom: it.fuzzy ? it.name || it.raw : null });
      }
      const nextLines = [...merged.values()];
      setLines(nextLines);
      setUnmatched(missed);
      setPriced(true);
      setDirty(false);
      setPreview(nextLines[0]?.card ?? null);
      const matchedLines = data.items.length - missed.length;
      setNotice(
        `Matched ${matchedLines} of ${data.items.length} line${data.items.length === 1 ? "" : "s"}` +
          (missed.length ? ` — ${missed.length} couldn't be matched (listed below).` : ".") +
          (data.truncated ? " Only the first 200 lines are priced." : "")
      );
      // Only a genuine user click on "Price this list" counts as deck_create —
      // NOT the auto-price on a shared-link visit (that's someone viewing
      // another person's list) and NOT the market-change re-price below (same
      // list, not a new one).
      if (isUserAction) trackEvent("deck_create", { deck_id: shortHash(deck.trim()), archetype: "custom" });
    } catch {
      setError("Network error — try again.");
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

  // Re-resolve when the market changes: a line matched by name takes the
  // cheapest printing in the new market. (Totals re-price on their own — every
  // card carries every market's price.)
  useEffect(() => {
    if (priced && (lines.length || unmatched.length)) void price(listToText(lines, unmatched));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country]);

  function addPicked(c: SearchCard) {
    const card = fromSearchCard(c);
    const target = search.target;
    let nextLines = lines;
    let nextUnmatched = unmatched;
    if (target?.kind === "fuzzy") {
      nextLines = lines.map((l) => (l.card.id === target.cardId ? { ...l, card, pinned: true, fuzzyFrom: null } : l));
    } else {
      const fromMissed = target?.kind === "unmatched" ? unmatched.find((u) => u.key === target.key) : undefined;
      const qty = fromMissed?.qty ?? 1;
      if (fromMissed) nextUnmatched = unmatched.filter((u) => u.key !== fromMissed.key);
      const i = lines.findIndex((l) => l.card.id === card.id);
      nextLines =
        i >= 0
          ? lines.map((l, j) => (j === i ? { ...l, qty: Math.min(QTY_CAP, l.qty + qty) } : l))
          : [...lines, { card, qty, pinned: true, fuzzyFrom: null }];
    }
    // Merge if the fix landed on a card already in the list.
    const byId = new Map<string, Line>();
    for (const l of nextLines) {
      const ex = byId.get(l.card.id);
      if (ex) ex.qty = Math.min(QTY_CAP, ex.qty + l.qty);
      else byId.set(l.card.id, { ...l });
    }
    commit([...byId.values()], nextUnmatched);
    setPriced(true);
    setPreview(card);
    setSearch((s) => ({ n: s.n + 1, q: "", target: null }));
  }

  function lookFor(q: string, target: SearchTarget) {
    setSearch((s) => ({ n: s.n + 1, q, target }));
    searchBox.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function setQty(cardId: string, qty: number) {
    commit(
      lines.map((l) => (l.card.id === cardId ? { ...l, qty: Math.max(1, Math.min(QTY_CAP, qty)) } : l)),
      unmatched
    );
  }

  function removeLine(cardId: string) {
    commit(
      lines.filter((l) => l.card.id !== cardId),
      unmatched
    );
  }

  function dismissUnmatched(key: number) {
    commit(
      lines,
      unmatched.filter((u) => u.key !== key)
    );
  }

  function clearAll() {
    setLines([]);
    setUnmatched([]);
    setText("");
    setDirty(false);
    setPriced(false);
    setNotice(null);
    setPreview(null);
  }

  const totals = useMemo(() => {
    let totalQty = 0;
    let totalCents = 0;
    let pricedQty = 0;
    for (const l of lines) {
      totalQty += l.qty;
      const unit = pickCardPrice(l.card);
      if (unit != null) {
        totalCents += unit * l.qty;
        pricedQty += l.qty;
      }
    }
    return { totalQty, totalCents, pricedQty };
  }, [lines, pickCardPrice]);

  const listText = listToText(lines, unmatched);

  async function share() {
    if (!listText.trim()) return;
    const url = `${window.location.origin}/deck?list=${encodeURIComponent(encodeList(listText))}`;
    try {
      await navigator.clipboard.writeText(url);
      setShared("copied");
    } catch {
      // Clipboard blocked — put the link in the address bar instead, and say so.
      window.history.replaceState(null, "", url);
      setShared("address-bar");
    }
    setTimeout(() => setShared(null), 2500);
  }

  const hasList = lines.length > 0 || unmatched.length > 0;
  const adjective = COUNTRIES[country].adjective;

  return (
    // 300px paste column from lg to xl (2026-09-23): at 1024px the side rail
    // leaves ~704px, and a 380px column squeezed the results to 300px so the
    // rows' meta wrapped (rows 88–105px tall instead of ~73). The sticky offset clears the two-row header
    // (121px mouse / 125px touch) below xl; from xl the one-row 65px header is back.
    <div className="grid gap-6 lg:grid-cols-[300px_1fr] xl:grid-cols-[380px_1fr]">
      {/* Input */}
      <div className="lg:sticky lg:top-36 lg:self-start xl:top-20">
        <div className="card-surface p-4">
          <label htmlFor="deck-paste" className="mb-1 block text-sm font-semibold text-white">
            Paste your decklist or card list
          </label>
          <p className="mb-2 text-xs text-slate-500">
            One card per line: <span className="font-mono">3 Jinx, Loose Cannon</span>, or just a name for one copy. Set codes like{" "}
            <span className="font-mono">(OGN-251)</span> pick an exact printing; section headers are skipped. (TCGplayer Mass Entry format
            works as-is.)
          </p>
          {/* sm:text-sm, not text-sm: .input is 16px below sm so iOS doesn't zoom the page on focus (2026-09-23). */}
          <textarea
            id="deck-paste"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setDirty(true);
            }}
            rows={14}
            placeholder={"3 Jinx, Loose Cannon\nKai'Sa, Survivor\n…"}
            className="input font-mono sm:text-sm"
          />
          <div className="mt-3 flex gap-2">
            <button onClick={() => price(text, true)} disabled={loading || !text.trim()} className="btn-primary flex-1">
              {loading ? "Pricing…" : "Price this list"}
            </button>
            <button
              onClick={() => {
                setText(SAMPLE);
                setDirty(true);
              }}
              className="btn-ghost"
              type="button"
            >
              Sample
            </button>
          </div>
          {priced && dirty && <p className="mt-2 text-[11px] text-slate-500">Pricing replaces the list on the right with this text.</p>}
          <button
            onClick={share}
            disabled={!listText.trim()}
            type="button"
            className="btn-ghost mt-2 w-full text-sm disabled:opacity-50"
            title="Copy a link that loads and prices this exact list"
          >
            {shared === "copied" ? "✓ Link copied!" : shared === "address-bar" ? "Link is in your address bar" : "🔗 Copy shareable link"}
          </button>
        </div>

        {/* Card preview — fills in when you hover a matched card in the results. */}
        {lines.length > 0 && (
          <div className="mt-4 hidden lg:block">
            <div className="card-surface overflow-hidden">
              <div className="relative aspect-[5/7] w-full bg-ink-900">
                {preview && cardImageSrc(preview, { full: true }) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cardImageSrc(preview, { full: true }) as string}
                    alt={cardImageAlt(preview)}
                    className="h-full w-full object-cover object-top"
                  />
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
      <div className="min-w-0 space-y-4">
        {loading && !hasList ? (
          <div className="card-surface grid place-items-center p-16 text-center text-slate-400">
            <div className="flex flex-col items-center gap-3">
              <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink-600 border-t-brand-400" />
              <p className="text-sm font-semibold text-white">Pricing your list…</p>
              <p className="text-xs">Matching each card to the cheapest {adjective} price.</p>
            </div>
          </div>
        ) : !hasList ? (
          <div className="card-surface p-8 text-center text-slate-400">
            <p className="text-lg font-semibold text-white">Price a whole deck or card list at once</p>
            <p className="mt-1 text-sm">
              Paste a decklist — or any list of card names — and we&apos;ll match every card and total up the cheapest {adjective}{" "}
              prices. Or build it here, card by card:
            </p>
          </div>
        ) : (
          <div className="card-surface flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex gap-6">
              <Sum label="List total" value={fmt(totals.totalCents)} highlight />
              <Sum label="Cards" value={`${totals.totalQty}`} />
              <Sum label="Matched" value={`${lines.length}/${lines.length + unmatched.length}`} />
            </div>
            {lines.length > 0 && (
              <Link
                href={`/tools/best-basket?list=${encodeURIComponent(encodeList(listText))}`}
                className="btn-ghost text-sm"
                title="The cheapest delivered order across stores, postage included"
              >
                Buy this deck for less →
              </Link>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-rose-400">
            {error}
          </p>
        )}
        {notice && hasList && <p className="text-xs text-slate-400">{notice}</p>}

        {/* Search-to-add. Remounted (key) with a query when "search for this" is used on a line. */}
        <div ref={searchBox} className="card-surface p-4">
          <label className="mb-1 block text-xs font-medium text-slate-400">
            {search.target?.kind === "unmatched"
              ? `Find the card for “${search.q}”`
              : search.target?.kind === "fuzzy"
                ? `Pick the right card for “${search.q}”`
                : "Add a card to your list"}
          </label>
          <CardSearch
            key={search.n}
            initialQuery={search.q}
            autoFocus={search.target != null}
            placeholder="e.g. Jinx, Loose Cannon"
            onPick={addPicked}
          />
          {search.target && (
            <button
              type="button"
              onClick={() => setSearch((s) => ({ n: s.n + 1, q: "", target: null }))}
              className="mt-2 text-xs text-slate-500 hover:text-slate-300"
            >
              Cancel
            </button>
          )}
        </div>

        {lines.length > 0 && (
          <div className="card-surface overflow-hidden">
            <ul className="divide-y divide-ink-800">
              {lines.map((l) => {
                const unit = pickCardPrice(l.card);
                return (
                  <li
                    key={l.card.id}
                    onMouseEnter={() => setPreview(l.card)}
                    className="flex items-center gap-3 p-3 transition-colors hover:bg-ink-900/50"
                  >
                    <QtyInput value={l.qty} onChange={(q) => setQty(l.card.id, q)} max={QTY_CAP} label={`Quantity for ${l.card.name}`} />
                    {l.card.imageThumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={l.card.imageThumbUrl} alt={cardImageAlt(l.card)} width={36} height={48} className="h-12 w-9 shrink-0 rounded object-cover ring-1 ring-ink-700" />
                    ) : (
                      <div className="h-12 w-9 shrink-0 rounded bg-ink-800" />
                    )}
                    <div className="min-w-0 flex-1">
                      <Link href={cardHref(l.card)} className="font-medium text-white hover:text-brand-400">
                        {cardDisplayName(l.card.name, l.card)}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {l.card.setCode} · {l.card.collectorNumber}
                      </div>
                      {l.fuzzyFrom && (
                        <div className="text-xs text-gold">
                          Guessed from “{l.fuzzyFrom}” —{" "}
                          <button type="button" onClick={() => lookFor(l.fuzzyFrom!, { kind: "fuzzy", cardId: l.card.id })} className="underline hover:text-white">
                            not it? search
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      {unit != null ? (
                        <>
                          <div className="font-bold text-white">{fmt(unit * l.qty)}</div>
                          <div className="text-[11px] text-slate-500">{fmt(unit)} ea</div>
                        </>
                      ) : (
                        <div className="text-xs text-slate-500">no price</div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(l.card.id)}
                      aria-label={`Remove ${l.card.name}`}
                      className="shrink-0 text-slate-600 hover:text-rose-300"
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center justify-between border-t border-ink-700 p-4">
              <span className="text-sm text-slate-400">
                {totals.pricedQty} of {totals.totalQty} cards priced
              </span>
              <span className="text-xl font-extrabold text-accent">{fmt(totals.totalCents)}</span>
            </div>
          </div>
        )}

        {unmatched.length > 0 && (
          <div className="card-surface p-4">
            <p className="text-sm font-semibold text-gold">
              {unmatched.length} line{unmatched.length === 1 ? "" : "s"} couldn&apos;t be matched — not in the total
            </p>
            <ul className="mt-2 divide-y divide-ink-800">
              {unmatched.map((u) => (
                <li key={u.key} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-400">{u.raw}</span>
                  <button
                    type="button"
                    onClick={() => lookFor(u.name || u.raw, { kind: "unmatched", key: u.key })}
                    className="shrink-0 text-xs font-semibold text-brand-400 hover:underline"
                  >
                    Search for this
                  </button>
                  <button
                    type="button"
                    onClick={() => dismissUnmatched(u.key)}
                    aria-label={`Dismiss ${u.raw}`}
                    className="shrink-0 text-slate-600 hover:text-rose-300"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {hasList && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-slate-600">
              Total uses each card&apos;s cheapest in-stock {country} price and may span multiple stores — postage not included.
            </p>
            <button type="button" onClick={clearAll} className="shrink-0 text-xs text-slate-500 hover:text-slate-300">
              Clear list
            </button>
          </div>
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
