"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { OutboundLink } from "./OutboundLink";
import { AffiliateDisclosure } from "./AffiliateDisclosure";
import { useCountry } from "./CountryProvider";
import { PremiumButton } from "./PremiumButton";
import { QtyInput } from "./QtyInput";
import { ebaySearchUrl } from "@/lib/affiliate";
import { COUNTRIES } from "@/lib/country";
import { cardDisplayName } from "@/lib/card-name";
import { cardImageAlt } from "@/lib/image-alt";
import { CardSearch, type SearchCard } from "./CardSearch";
import type { BasketAlternatives, BasketPlan, BasketPreview } from "@/lib/basket";
import { trackEvent } from "@/lib/analytics";

export type BasketSource = "deck" | "watchlist" | "binder";

interface PickedLine {
  card: SearchCard;
  qty: number;
}

// What /api/basket returns to Premium: the preview numbers plus the plans.
interface FullResult extends BasketPreview {
  plan: BasketPlan;
  alternatives: BasketAlternatives;
  fuzzy: { raw: string; matchedAs: string }[];
  skippedOwned: number;
  skippedHoldings: number;
}
type Result = BasketPreview | FullResult;
const isFull = (r: Result): r is FullResult => "plan" in r;

type PlanKey = "split" | "single" | "two";

const TABS: { key: BasketSource; label: string }[] = [
  { key: "deck", label: "Paste a list" },
  { key: "watchlist", label: "My watchlist" },
  { key: "binder", label: "My binder" },
];

// The Best Basket tool. One list in — pasted (or searched card by card), your
// watchlist, or your binder — and the cheapest delivered way to buy it out.
//
// `full` is Premium: the three plans side by side and every store line with its
// condition and a tracked link. Anyone else signed in gets a click-only preview
// of their own real numbers (the route withholds the store lines; see
// api/basket/route.ts), and nothing runs until they click.
export function BestBasket({
  full,
  initialList,
  initialSource = "deck",
  initialSkipOwned = false,
  autoRun = false,
}: {
  full: boolean;
  initialList?: string;
  initialSource?: BasketSource;
  initialSkipOwned?: boolean;
  autoRun?: boolean;
}) {
  const { country, fmt } = useCountry();
  const [tab, setTab] = useState<BasketSource>(initialSource);
  const [picked, setPicked] = useState<PickedLine[]>([]);
  const [pasteText, setPasteText] = useState(initialList ?? "");
  const [skipOwned, setSkipOwned] = useState(initialSkipOwned);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [shown, setShown] = useState<PlanKey>("split");

  // Any change to what's being asked for clears the old answer, so a plan on
  // screen always belongs to the inputs above it.
  function touched() {
    setResult(null);
    setError(null);
  }

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    setShown("split");
    try {
      const res = await fetch("/api/basket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: tab,
          skipOwned: tab !== "binder" && skipOwned,
          ...(tab === "deck" ? { text: pasteText, lines: picked.map((p) => ({ cardId: p.card.id, qty: p.qty })) } : {}),
        }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok || !d) {
        setError(d?.error ?? "Something went wrong — try again.");
        return;
      }
      const built = d as Result;
      setResult(built);
      trackEvent("best_basket_build", {
        source: tab,
        market: country,
        lines: built.requested,
        matched: built.covered,
        stores: built.storeCount,
        savedCents: built.savedCents,
      });
    } catch {
      setError("Network error — try again.");
    } finally {
      setLoading(false);
    }
  }

  // A list or source handed in by link (/deck's "Buy this deck for less",
  // /watching, the portfolio panel) runs straight away — for Premium only. A
  // free preview is click-only: it counts against 5 a day.
  const autoRan = useRef(false);
  useEffect(() => {
    if (!autoRun || autoRan.current) return;
    if (initialSource === "deck" && !initialList?.trim()) return;
    autoRan.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addCard(c: SearchCard) {
    touched();
    setPicked((prev) => {
      const i = prev.findIndex((p) => p.card.id === c.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: Math.min(99, next[i].qty + 1) };
        return next;
      }
      return [...prev, { card: c, qty: 1 }];
    });
  }

  function setQty(cardId: string, qty: number) {
    touched();
    setPicked((prev) => prev.map((p) => (p.card.id === cardId ? { ...p, qty: Math.max(1, Math.min(99, qty)) } : p)));
  }

  function removeCard(cardId: string) {
    touched();
    setPicked((prev) => prev.filter((p) => p.card.id !== cardId));
  }

  const canRun = tab !== "deck" || pasteText.trim().length > 0 || picked.length > 0;
  const adjective = COUNTRIES[country].adjective;

  return (
    <div className="space-y-5">
      <div className="card-surface p-5">
        <div role="tablist" aria-label="What to price" className="mb-4 flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => {
                touched();
                setTab(t.key);
              }}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                tab === t.key ? "border-brand-500 bg-brand-500/15 text-white" : "border-ink-700 text-slate-400 hover:text-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "deck" && (
          <>
            <label htmlFor="basket-paste" className="mb-1 block text-xs font-medium text-slate-400">
              Paste a decklist or any card list — quantities optional, one card per line
            </label>
            {/* sm:text-sm, not text-sm: .input is 16px below sm so iOS doesn't zoom the page on focus (2026-09-23). */}
            <textarea
              id="basket-paste"
              value={pasteText}
              onChange={(e) => {
                touched();
                setPasteText(e.target.value);
              }}
              rows={6}
              placeholder={"3 Jinx, Loose Cannon\n2 Vayne, Hunter (OGN-038)\nYasuo, the Unforgiven"}
              className="input font-mono sm:text-sm"
            />

            <label className="mb-1 mt-4 block text-xs font-medium text-slate-400">…or search for a card and add it</label>
            <CardSearch placeholder="e.g. Jinx, Loose Cannon" onPick={addCard} />
            {picked.length > 0 && (
              <ul className="mt-3 divide-y divide-ink-800 rounded-lg border border-ink-800">
                {picked.map((p) => (
                  <li key={p.card.id} className="flex items-center gap-3 p-2.5">
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
                      </div>
                    </div>
                    <QtyInput value={p.qty} onChange={(q) => setQty(p.card.id, q)} label={`Quantity for ${p.card.name}`} />
                    <button
                      type="button"
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
          </>
        )}

        {tab === "watchlist" && (
          <p className="text-sm text-slate-400">
            Prices one copy of every card on your <Link href="/watching" className="text-brand-400 hover:underline">watchlist</Link> in
            this market (up to 200 cards).
          </p>
        )}

        {tab === "binder" && (
          <p className="text-sm text-slate-400">
            Prices re-buying the cards in your <Link href="/portfolio" className="text-brand-400 hover:underline">binder</Link> at the
            quantities you hold — what replacing it would cost, delivered. A big binder is priced on its 200 most valuable cards.
          </p>
        )}

        <label className={`mt-4 flex items-center gap-2 text-sm ${tab === "binder" ? "text-slate-600" : "text-slate-300"}`}>
          <input
            type="checkbox"
            checked={tab !== "binder" && skipOwned}
            disabled={tab === "binder"}
            onChange={(e) => {
              touched();
              setSkipOwned(e.target.checked);
            }}
            className="h-4 w-4 accent-brand-500"
          />
          Skip copies I already own
          {tab === "binder" && <span className="text-xs">(not for the binder itself)</span>}
        </label>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void run()} disabled={loading || !canRun} className="btn-primary text-sm disabled:opacity-50">
            {loading ? "Working it out…" : full ? "🧺 Find the cheapest basket" : "See my total"}
          </button>
          {!full && (
            <span className="text-xs text-slate-500">
              Free accounts see their own delivered total, 5 times a day. Premium shows which store to buy each card from.
            </span>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm text-rose-400">
            {error}
          </p>
        )}
      </div>

      {result && !isFull(result) && <PreviewCard r={result} fmt={fmt} adjective={adjective} />}

      {result && isFull(result) && (
        <FullResultView r={result} shown={shown} setShown={setShown} fmt={fmt} country={country} adjective={adjective} />
      )}
    </div>
  );
}

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}

// The free preview: the user's own real numbers and nothing else.
function PreviewCard({ r, fmt, adjective }: { r: BasketPreview; fmt: (c: number) => string; adjective: string }) {
  if (r.covered === 0) {
    return (
      <div className="card-surface p-5 text-sm text-slate-300">
        <p>None of these cards is in stock at a tracked {adjective} store right now.</p>
        <UnmatchedList unmatched={r.unmatched} />
      </div>
    );
  }
  const stores = `${r.storeCount} ${plural(r.storeCount, "store", "stores")}`;
  return (
    <div className="card-surface p-5">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Your delivered total</div>
      <div className="font-display text-4xl font-extrabold text-white">{fmt(r.totalCents)}</div>
      <p className="mt-2 text-sm leading-relaxed text-slate-300">
        {r.savedCents > 0 ? (
          <>
            Your list: {fmt(r.totalCents)} delivered from {stores}, {fmt(r.savedCents)} less than buying each card&apos;s cheapest copy
            separately. Premium shows which store to buy each card from.
          </>
        ) : (
          <>
            Your list: {fmt(r.totalCents)} delivered from {stores}. Buying each card&apos;s cheapest copy is already the cheapest way for
            this list.
          </>
        )}
      </p>
      <Coverage r={r} />
      <UnmatchedList unmatched={r.unmatched} />
      <div className="mt-4">
        <PremiumButton surface="gate:basket-preview" />
      </div>
    </div>
  );
}

function Coverage({ r }: { r: BasketPreview }) {
  if (r.covered >= r.requested) return null;
  return (
    <p className="mt-1 text-xs text-amber-300">
      Covers {r.covered} of the {r.requested} cards you asked for — the rest aren&apos;t matched or in stock at a tracked store, and
      aren&apos;t in the total.
    </p>
  );
}

function UnmatchedList({ unmatched }: { unmatched: { raw: string; qty: number }[] }) {
  if (!unmatched.length) return null;
  return (
    <div className="mt-3 text-sm">
      <p className="font-semibold text-amber-300">We couldn&apos;t match {plural(unmatched.length, "this line", "these lines")}:</p>
      <ul className="mt-1 space-y-0.5">
        {unmatched.map((u, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-2">
            <span className="font-mono text-xs text-slate-400">{u.raw}</span>
            <Link
              href={`/browse?q=${encodeURIComponent(u.raw.replace(/^\d+\s*[xX×]?\s+/, ""))}`}
              target="_blank"
              className="text-xs text-brand-400 hover:underline"
            >
              search for it →
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FullResultView({
  r,
  shown,
  setShown,
  fmt,
  country,
  adjective,
}: {
  r: FullResult;
  shown: PlanKey;
  setShown: (k: PlanKey) => void;
  fmt: (c: number) => string;
  country: string;
  adjective: string;
}) {
  const { plan, alternatives } = r;
  if (plan.storeCount === 0) {
    return (
      <div className="card-surface p-5 text-sm text-slate-300">
        <p>None of these cards is in stock at a tracked {adjective} store right now.</p>
        <UnmatchedList unmatched={r.unmatched} />
        <Unbuyable plan={plan} country={country} />
      </div>
    );
  }
  const selected = shown === "single" ? alternatives.singleStore : shown === "two" ? alternatives.twoStores : plan;
  const view = selected ?? plan;

  return (
    <>
      <div className="card-surface p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <PlanCard
            title="Cheapest split"
            plan={plan}
            cheapest={plan.totalCents}
            active={shown === "split"}
            onShow={() => setShown("split")}
            fmt={fmt}
            empty=""
          />
          <PlanCard
            title="Best single store"
            plan={alternatives.singleStore}
            cheapest={plan.totalCents}
            active={shown === "single"}
            onShow={() => setShown("single")}
            fmt={fmt}
            empty="No single store has every card in stock."
          />
          <PlanCard
            title="Best two stores"
            plan={alternatives.twoStores}
            cheapest={plan.totalCents}
            active={shown === "two"}
            onShow={() => setShown("two")}
            fmt={fmt}
            empty="No two stores between them stock every card."
          />
        </div>
        <p className="mt-4 text-sm text-slate-300">
          {plan.savedCents > 0 ? (
            <>
              The cheapest split is <strong className="text-brand-400">{fmt(plan.savedCents)} less</strong> than buying each card&apos;s
              cheapest copy separately ({fmt(plan.naiveTotalCents)} across {plan.naiveStoreCount}{" "}
              {plural(plan.naiveStoreCount, "store", "stores")}).
            </>
          ) : (
            <>Buying each card&apos;s cheapest copy is already the cheapest way for this list.</>
          )}
        </p>
        <Coverage r={r} />
        {r.skippedOwned > 0 && (
          <p className="mt-1 text-xs text-slate-500">
            Skipped {r.skippedOwned} {plural(r.skippedOwned, "copy", "copies")} you already own.
          </p>
        )}
        {r.skippedHoldings > 0 && (
          <p className="mt-1 text-xs text-slate-500">
            Priced on your 200 most valuable binder cards; {r.skippedHoldings} cheaper {plural(r.skippedHoldings, "one is", "ones are")} not
            included.
          </p>
        )}
      </div>

      {r.fuzzy.length > 0 && (
        <div className="card-surface p-4 text-sm">
          <p className="font-semibold text-amber-300">Check {plural(r.fuzzy.length, "this match", "these matches")} — we guessed:</p>
          <ul className="mt-1 space-y-0.5 text-slate-400">
            {r.fuzzy.map((f, i) => (
              <li key={i}>
                <span className="font-mono text-xs">{f.raw}</span> → matched as <span className="text-slate-200">{f.matchedAs}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.unmatched.length > 0 && (
        <div className="card-surface p-4">
          <UnmatchedList unmatched={r.unmatched} />
        </div>
      )}

      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">
        {shown === "single" ? "Best single store" : shown === "two" ? "Best two stores" : "Cheapest split"}: {view.storeCount}{" "}
        {plural(view.storeCount, "order", "orders")}
      </h2>
      {view.stores.map((s) => (
        <div key={s.key} className="card-surface overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-700 px-4 py-2.5">
            <h3 className="text-sm font-bold text-white">{s.name}</h3>
            <span className="text-xs text-slate-400">
              {fmt(s.subtotalCents)}
              {s.freeShipping ? (
                <span className="ml-1 text-brand-400">+ free postage</span>
              ) : (
                <span className="ml-1 text-slate-500">+ {fmt(s.shippingCents)} postage</span>
              )}
            </span>
          </div>
          {s.freeOverCents > 0 && (
            <p className="border-b border-ink-800 px-4 py-1.5 text-[11px] text-slate-500">
              {s.freeShipping
                ? `Free postage over ${fmt(s.freeOverCents)} — this order clears it.`
                : `Free postage over ${fmt(s.freeOverCents)} — ${fmt(s.freeOverCents - s.subtotalCents)} away.`}
            </p>
          )}
          <ul className="divide-y divide-ink-800">
            {s.lines.map((l, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="w-8 shrink-0 text-slate-500">×{l.qty}</span>
                <div className="min-w-0 flex-1">
                  <OutboundLink
                    href={l.url}
                    retailer={s.key}
                    country={country}
                    cardId={l.cardId}
                    cardName={l.name}
                    price={l.unitCents / 100}
                    condition={l.condition}
                    inStock
                    pageType="best_basket"
                    className="block truncate font-medium text-white hover:text-brand-400"
                  >
                    {l.name}
                  </OutboundLink>
                  <div className="truncate text-[11px] text-slate-500">
                    {l.setCode && l.collectorNumber ? `${l.setCode} · ${l.collectorNumber} · ` : ""}
                    {l.condition ?? "Condition not stated"}
                  </div>
                </div>
                <span className="shrink-0 text-slate-300">
                  {fmt(l.unitCents)}
                  {l.qty > 1 ? " ea" : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <Unbuyable plan={plan} country={country} />

      <p className="text-center text-[11px] text-slate-600">
        Postage uses each store&apos;s typical single-card rate and free-shipping threshold (estimates), and a store may hold fewer
        copies than you need. Always confirm at checkout.
      </p>
    </>
  );
}

function PlanCard({
  title,
  plan,
  cheapest,
  active,
  onShow,
  fmt,
  empty,
}: {
  title: string;
  plan: BasketPlan | null;
  cheapest: number;
  active: boolean;
  onShow: () => void;
  fmt: (c: number) => string;
  empty: string;
}) {
  if (!plan) {
    return (
      <div className="rounded-lg border border-ink-800 p-3">
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{title}</div>
        <p className="mt-2 text-xs text-slate-500">{empty}</p>
      </div>
    );
  }
  const extra = plan.totalCents - cheapest;
  return (
    <button
      type="button"
      onClick={onShow}
      aria-pressed={active}
      className={`rounded-lg border p-3 text-left transition ${active ? "border-brand-500 bg-brand-500/10" : "border-ink-700 hover:border-ink-600"}`}
    >
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-1 font-display text-2xl font-extrabold text-white">{fmt(plan.totalCents)}</div>
      <div className="text-[11px] text-slate-500">
        {fmt(plan.itemsCents)} cards + {plan.shippingCents > 0 ? `${fmt(plan.shippingCents)} postage` : "free postage"}
      </div>
      <div className="text-[11px] text-slate-500">
        {plan.storeCount} {plural(plan.storeCount, "order", "orders")}
        {plan.storeCount <= 2 ? `: ${plan.stores.map((s) => s.name).join(" + ")}` : ""}
      </div>
      <div className={`mt-1 text-[11px] font-semibold ${extra > 0 ? "text-slate-400" : "text-brand-400"}`}>
        {extra > 0 ? `+${fmt(extra)} vs the cheapest split` : "Cheapest"}
      </div>
    </button>
  );
}

function Unbuyable({ plan, country }: { plan: BasketPlan; country: string }) {
  if (!plan.unbuyable.length) return null;
  return (
    <div className="card-surface p-4 text-sm">
      <p className="font-semibold text-amber-300">No in-stock store listing for:</p>
      {/* Each card is a live eBay search: no tracked store has it, and eBay
          usually carries the long tail. */}
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1.5">
        {plan.unbuyable.map((u, i) => (
          <li key={i}>
            <OutboundLink
              href={ebaySearchUrl(country, `${u.name} Riftbound`, "basket-unbuyable")}
              retailer="ebay_basket"
              country={country}
              className="font-medium text-brand-400 hover:underline"
            >
              {u.qty}× {u.name} →
            </OutboundLink>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-500">No tracked store has these in stock right now — eBay usually carries the long tail.</p>
      <AffiliateDisclosure partner="ebay" tight />
    </div>
  );
}
