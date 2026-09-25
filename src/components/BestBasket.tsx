"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { OutboundLink } from "./OutboundLink";
import { AffiliateDisclosure } from "./AffiliateDisclosure";
import { useCountry } from "./CountryProvider";
import { PremiumButton } from "./PremiumButton";
import { QtyInput } from "./QtyInput";
import { ebaySearchUrl } from "@/lib/affiliate";
import { COUNTRIES } from "@/lib/country";
import { cardDisplayName } from "@/lib/card-name";
import { cardImageAlt } from "@/lib/image-alt";
import { parseDeckList, DECK_LINE_CAP } from "@/lib/deck";
import { CardSearch, type SearchCard } from "./CardSearch";
import type { BasketAlternatives, BasketPlan, BasketPreview, BasketStoreGroup, TwoStoresNone } from "@/lib/basket";
import { trackEvent } from "@/lib/analytics";
import { effectiveRegion, readPostagePrefs, writePostagePrefs } from "@/lib/postage-prefs";
import { freePrefix, joinList, planPostageNotes, postageLineBits, postagePrefix, trackedTag } from "@/lib/postage-display";

export type BasketSource = "deck" | "watchlist" | "binder";

interface PickedLine {
  card: SearchCard;
  qty: number;
}

export interface BasketRegionOption {
  key: string;
  label: string; // the picker's text, a name short enough for a phone: "Northeast", "Elsewhere (not measured)"
  phrase: string; // in a sentence: "the Northeast"
  pricedTo: string; // under the picker: "priced to New York, the one address we measured there"
  unmeasured?: boolean; // "Elsewhere (not measured)"
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
//
// POSTAGE (2026-09-25): each store's own checkout rate for the order it would
// get, measured — not a flat guess. The buyer picks where it is going; the
// picker starts from their location (geoRegion, from Vercel's geo headers —
// a US visitor in Ohio starts on "Midwest", priced to Chicago; one in Maryland
// on "South Atlantic", priced at the dearer of New York and Dallas), and their
// own pick is remembered in this browser. Unset, every store is priced at its
// HIGHEST regional rate and says "up to"; "Elsewhere (not measured)" is priced
// the same way and marked "est." — "from" in the US and Canada, where it means
// Alaska, Hawaii or the north and costs more. The buyer can rule out untracked
// letters. Each store line names the store's own rate, says when a cheaper
// untracked letter was skipped, marks an order bigger than any measured
// "from", and marks any store still on an estimate "est.". See lib/shipping.ts
// and lib/postage-display.ts. A changed delivery choice re-prices Premium's
// plan on screen; a preview is cleared instead (a re-run is one of the five).
export function BestBasket({
  full,
  initialList,
  initialSource = "deck",
  initialSkipOwned = false,
  autoRun = false,
  market,
  regions,
  zonePriced,
  measuredAt,
  measuredTo,
  geoRegion,
}: {
  full: boolean;
  initialList?: string;
  initialSource?: BasketSource;
  initialSkipOwned?: boolean;
  autoRun?: boolean;
  market: string;
  regions: BasketRegionOption[];
  zonePriced: boolean;
  measuredAt: string | null; // "25 Sep 2026"
  measuredTo: string[]; // the addresses the market was measured to: ["New York", "San Francisco", …]
  geoRegion: string | null; // the region the visitor's location suggests (a regions[] key), or null
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
  // Bumped by every run and every input change: a response that comes back
  // for an older request is dropped, not shown under inputs it doesn't match.
  const reqSeq = useRef(0);

  // Delivery. The server knows the visitor's location, so the first render
  // already shows their region; a remembered choice replaces it after mount.
  const validRegion = (k: string) => regions.some((r) => r.key === k);
  const geo = geoRegion && validRegion(geoRegion) ? geoRegion : null;
  const [region, setRegion] = useState<string | null>(geo);
  const [regionGuessed, setRegionGuessed] = useState(!!geo);
  const [trackedOnly, setTrackedOnly] = useState(false);
  // What run() prices with — set in the same tick as a change, so a run
  // started by that change (or by the auto-run below, in the same commit as
  // the prefs load) never reads the choice from before it.
  const delivery = useRef<{ region: string | null; trackedOnly: boolean }>({ region: geo, trackedOnly: false });

  // Remembered choices load after mount (localStorage is not readable on the
  // server); an unknown region prices at each store's highest regional rate.
  // Declared before the auto-run effect, which relies on it having run.
  useEffect(() => {
    const p = readPostagePrefs(market);
    const r = effectiveRegion(p, geoRegion, validRegion);
    setRegion(r);
    setRegionGuessed(!p.regionChosen && !!geoRegion && validRegion(geoRegion));
    setTrackedOnly(p.trackedOnly);
    delivery.current = { region: r, trackedOnly: p.trackedOnly };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market, regions, geoRegion]);

  // Any change to what's being asked for clears the old answer, so a plan on
  // screen always belongs to the inputs above it — including an answer still
  // on its way for the inputs as they were.
  function touched() {
    setResult(null);
    setError(null);
    reqSeq.current++;
    setLoading(false);
  }

  // A market switch (CountryProvider's router.refresh() keeps this state) makes
  // any plan on screen another market's: its cents would be formatted in the
  // new currency, with the old market's store links.
  const shownCountry = useRef(country);
  useEffect(() => {
    if (shownCountry.current === country) return;
    shownCountry.current = country;
    touched();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country]);

  // Lines as the route counts them (picked cards first, then pasted lines,
  // DECK_LINE_CAP in all), so the page can say when a list runs past the cap.
  const pastedLines = useMemo(() => (tab === "deck" ? parseDeckList(pasteText, { plainNames: true }).length : 0), [tab, pasteText]);
  const listLines = tab === "deck" ? picked.length + pastedLines : 0;
  const overCap = listLines > DECK_LINE_CAP;

  async function run() {
    const seq = ++reqSeq.current;
    setLoading(true);
    setError(null);
    setResult(null);
    setShown("split");
    const q = new URLSearchParams();
    if (delivery.current.region) q.set("region", delivery.current.region);
    if (delivery.current.trackedOnly) q.set("tracked", "1");
    try {
      const res = await fetch(`/api/basket${q.toString() ? `?${q}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: tab,
          skipOwned: tab !== "binder" && skipOwned,
          ...(tab === "deck" ? { text: pasteText, lines: picked.map((p) => ({ cardId: p.card.id, qty: p.qty })) } : {}),
        }),
      });
      const d = await res.json().catch(() => null);
      if (seq !== reqSeq.current) return; // the inputs changed while it ran
      if (!res.ok || !d) {
        setError(d?.error ?? "Something went wrong — try again.");
        return;
      }
      const built = d as Result;
      setResult(built);
      const size = listSize(built, tab, Math.min(listLines, DECK_LINE_CAP));
      trackEvent("best_basket_build", {
        source: tab,
        market: country,
        lines: size.lines,
        matched: size.matched,
        stores: built.storeCount,
        savedCents: built.savedCents,
      });
    } catch {
      if (seq === reqSeq.current) setError("Network error — try again.");
    } finally {
      if (seq === reqSeq.current) setLoading(false);
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

  // A changed delivery choice: Premium's plan on screen (or on its way) is
  // re-priced for it; a free preview is cleared, since re-running it would
  // spend one of the day's five.
  function changePostage(nextRegion: string | null, nextTracked: boolean) {
    setRegion(nextRegion);
    setRegionGuessed(false);
    setTrackedOnly(nextTracked);
    delivery.current = { region: nextRegion, trackedOnly: nextTracked };
    writePostagePrefs(market, { region: nextRegion, trackedOnly: nextTracked });
    if (full && (result || loading)) void run();
    else touched();
  }
  const regionOpt = regions.find((r) => r.key === region) ?? null;
  // A MEASURED region the buyer is pricing for ("the Northeast"); "Elsewhere"
  // is priced like an unknown region and says so.
  const regionLabel = regionOpt && !regionOpt.unmeasured ? regionOpt.phrase : null;
  const places = joinList(measuredTo);
  const postageView: PostageView = { regionLabel, regionOpt, measuredAt, places };

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
            {overCap && <CapNote lines={listLines} picked={picked.length} />}

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

        {/* Delivery: where it is going, and whether untracked letters count. */}
        <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-2 rounded-lg border border-ink-800 p-2.5">
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-400">
            Deliver to
            {/* sm:text-sm: .input is 16px below sm so iOS doesn't zoom the page on focus. */}
            <select
              value={region ?? ""}
              onChange={(e) => changePostage(e.target.value || null, trackedOnly)}
              className="input py-1 sm:text-sm"
              aria-label="Delivery region"
            >
              <option value="">Not sure (highest rate)</option>
              {regions.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-2 text-xs text-slate-300 sm:[@media(pointer:fine)]:min-h-0">
            <input
              type="checkbox"
              checked={trackedOnly}
              onChange={(e) => changePostage(region, e.target.checked)}
              className="h-4 w-4 accent-brand-500"
            />
            Tracked postage only
          </label>
          <p className="basis-full text-[11px] leading-snug text-slate-500">
            {regionGuessed && regionOpt ? `Picked from your location: ${regionOpt.phrase}. Change it if that's wrong. ` : ""}
            {regionOpt && (zonePriced || regionOpt.unmeasured) ? `${regionOpt.unmeasured ? "Elsewhere" : regionOpt.label}: ${regionOpt.pricedTo}. ` : ""}
            {zonePriced
              ? `Some stores charge more to some regions — pick yours. We measured delivery to ${places || "a few addresses"}; a region between two of them is priced at the dearer.`
              : `Every store we measured charges the same to every ${market === "AU" ? "state and territory (all eight capitals)" : `address we tried${places ? ` (${places})` : ""}`}, so this changes nothing yet.`}{" "}
            An untracked letter is only counted for orders no bigger than the ones the store offered it on. &ldquo;Tracked
            postage only&rdquo; leaves those letters out; a rate whose name doesn&apos;t say is marked &ldquo;tracking not stated&rdquo;.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void run()} disabled={loading || !canRun} className="btn-primary text-sm disabled:opacity-50">
            {loading ? "Working it out…" : full ? "🧺 Find the cheapest basket" : "See my total"}
          </button>
          {!full && (
            <span className="text-xs text-slate-500">
              Without Premium you see your own delivered total, 5 times a day. Premium shows which store to buy each card from.
            </span>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm text-rose-400">
            {error}
          </p>
        )}
      </div>

      {result && !isFull(result) && <PreviewCard r={result} fmt={fmt} adjective={adjective} overCap={overCap} postage={postageView} />}

      {result && isFull(result) && (
        <FullResultView
          r={result}
          shown={shown}
          setShown={setShown}
          fmt={fmt}
          country={country}
          adjective={adjective}
          overCap={overCap}
          postage={postageView}
        />
      )}
    </div>
  );
}

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}

// The delivery choice a result was priced for, for the copy around it.
interface PostageView {
  regionLabel: string | null; // a MEASURED region: "the Northeast"
  regionOpt: BasketRegionOption | null;
  measuredAt: string | null;
  places: string; // "New York, Chicago, Dallas and San Francisco"
}

// best_basket_build's `lines` and `matched` are LINES — list entries and how
// many of them matched a card — not the copy counts `requested`/`covered`
// carry. A paste is counted here as the route counts it; a watchlist is one
// copy per card, so its copies are its lines; Premium's plan has the card
// counts for the binder. The free binder preview has no line count (its copies
// are the quantities held), so the event leaves them out rather than guess.
function listSize(r: Result, tab: BasketSource, pricedLines: number): { lines?: number; matched?: number } {
  if (tab === "deck") return { lines: pricedLines, matched: pricedLines - r.unmatched.length };
  if (tab === "watchlist") return { lines: r.requested, matched: r.requested };
  if (isFull(r)) {
    const cards = r.plan.matchedCards + r.plan.unbuyable.length;
    return { lines: cards, matched: cards };
  }
  return {};
}

// Past the line cap, said before the run (it costs one of the five) and again
// beside the answer.
function CapNote({ lines, picked }: { lines: number; picked: number }) {
  return (
    <p className="mt-2 text-xs text-amber-300">
      This list has {lines} lines. Only the first {DECK_LINE_CAP} are priced
      {picked > 0 ? " (cards added by search first, then the pasted lines)" : ""}; the rest aren&apos;t in the total or the counts.
    </p>
  );
}

// Nothing to price: say which of the two reasons it is. Every line unmatched
// is not the same as "out of stock", and the preview used to say the latter
// for both.
function NothingPriced({ r, adjective }: { r: BasketPreview; adjective: string }) {
  const unmatchedCopies = r.unmatched.reduce((n, u) => n + u.qty, 0);
  const noneMatched = r.unmatched.length > 0 && r.requested === unmatchedCopies;
  return (
    <p>
      {noneMatched
        ? "None of these lines matched a card."
        : r.unmatched.length > 0
          ? `None of the cards we matched is in stock at a tracked ${adjective} store right now.`
          : `None of these cards is in stock at a tracked ${adjective} store right now.`}
    </p>
  );
}

// The free preview: the user's own real numbers and nothing else.
function PreviewCard({
  r,
  fmt,
  adjective,
  overCap,
  postage,
}: {
  r: BasketPreview;
  fmt: (c: number) => string;
  adjective: string;
  overCap: boolean;
  postage: PostageView;
}) {
  if (r.covered === 0) {
    return (
      <div className="card-surface p-5 text-sm text-slate-300">
        <NothingPriced r={r} adjective={adjective} />
        <UnmatchedList unmatched={r.unmatched} />
        {overCap && <ResultCapNote />}
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
        ) : r.naiveTotalCents < r.totalCents ? (
          <>
            Your list: {fmt(r.totalCents)} delivered from {stores}. <RiskyNaive naiveCents={r.naiveTotalCents} fmt={fmt} /> Premium
            shows which store to buy each card from.
          </>
        ) : (
          <>
            Your list: {fmt(r.totalCents)} delivered from {stores}. Buying each card&apos;s cheapest copy is already the cheapest way for
            this list.
          </>
        )}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {fmt(r.totalCents - r.shippingCents - r.topUpCents)} cards + {fmt(r.shippingCents)} postage
        {r.topUpCents > 0 && <> + {fmt(r.topUpCents)} to reach a minimum order</>}
        {postage.regionLabel ? ` · delivered to ${postage.regionLabel}` : ""}
      </p>
      {r.postageNotes.length > 0 && <p className="mt-0.5 text-xs text-amber-300/80">{r.postageNotes.join(" · ")}</p>}
      <Coverage r={r} />
      {overCap && <ResultCapNote />}
      <UnmatchedList unmatched={r.unmatched} />
      <div className="mt-4">
        <PremiumButton surface="gate:basket-preview" />
      </div>
      <PostageFooter postage={postage} className="mt-4 text-left" />
    </div>
  );
}

// The chosen plan can REPORT more than buying each card's cheapest copy only
// one way: the search allows for postage that was still rising past the
// biggest order a store's checkout was measured on (lib/basket.ts), and the
// naive split leans on such a store's "from" figure. Say so rather than claim
// the plan is cheapest.
function RiskyNaive({ naiveCents, fmt }: { naiveCents: number; fmt: (c: number) => string }) {
  return (
    <>
      Buying each card&apos;s cheapest copy shows {fmt(naiveCents)}, but that puts a bigger order on a store than its checkout was
      measured on, where postage was still rising with size — this total doesn&apos;t count on that store&apos;s &ldquo;from&rdquo; figure.
    </>
  );
}

function ResultCapNote() {
  return (
    <p className="mt-1 text-xs text-amber-300">
      Only the first {DECK_LINE_CAP} lines of this list are priced — the lines past that aren&apos;t in the total or the counts.
    </p>
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
  overCap,
  postage,
}: {
  r: FullResult;
  shown: PlanKey;
  setShown: (k: PlanKey) => void;
  fmt: (c: number) => string;
  country: string;
  adjective: string;
  overCap: boolean;
  postage: PostageView;
}) {
  const { plan, alternatives } = r;
  if (plan.storeCount === 0) {
    return (
      <div className="card-surface p-5 text-sm text-slate-300">
        <NothingPriced r={r} adjective={adjective} />
        {overCap && <ResultCapNote />}
        <UnmatchedList unmatched={r.unmatched} />
        <Unbuyable plan={plan} country={country} />
        <LeftOut plan={plan} />
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
            empty={TWO_STORES_NONE[alternatives.twoStoresNone ?? "no-pair"]}
          />
        </div>
        <p className="mt-4 text-sm text-slate-300">
          {plan.savedCents > 0 ? (
            <>
              The cheapest split is <strong className="text-brand-400">{fmt(plan.savedCents)} less</strong> than buying each card&apos;s
              cheapest copy separately ({fmt(plan.naiveTotalCents)} across {plan.naiveStoreCount}{" "}
              {plural(plan.naiveStoreCount, "store", "stores")}).
            </>
          ) : plan.naiveTotalCents < plan.totalCents ? (
            <RiskyNaive naiveCents={plan.naiveTotalCents} fmt={fmt} />
          ) : (
            <>Buying each card&apos;s cheapest copy is already the cheapest way for this list.</>
          )}
        </p>
        <Coverage r={r} />
        {overCap && <ResultCapNote />}
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

      <div>
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">
          {shown === "single" ? "Best single store" : shown === "two" ? "Best two stores" : "Cheapest split"}: {view.storeCount}{" "}
          {plural(view.storeCount, "order", "orders")}
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          {fmt(view.itemsCents)} cards + {fmt(view.shippingCents)} postage
          {view.topUpCents > 0 && <> + {fmt(view.topUpCents)} to reach a minimum order</>} = {fmt(view.totalCents)}
          {postage.regionLabel ? ` · delivered to ${postage.regionLabel}` : ""}
        </p>
        <PlanNotes plan={view} regionLabel={postage.regionLabel} regionOpt={postage.regionOpt} />
      </div>
      {view.stores.map((s) => (
        <div key={s.key} className="card-surface overflow-hidden">
          <div className="border-b border-ink-700 px-4 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-white">{s.name}</h3>
              <span className="text-xs text-slate-400">
                {fmt(s.subtotalCents)}
                {s.freeShipping ? (
                  <span className="ml-1 text-brand-400">+ {freePrefix(s.postage)}free postage</span>
                ) : (
                  <span className="ml-1 text-slate-500">
                    + {postagePrefix(s.postage)}
                    {fmt(s.shippingCents)} postage
                  </span>
                )}
              </span>
            </div>
            <PostageLine group={s} fmt={fmt} />
          </div>
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
      <LeftOut plan={plan} />

      <PostageFooter postage={postage} className="text-center">
        {" "}A store may also hold fewer copies than you need.
      </PostageFooter>
    </>
  );
}

// The notes under a plan's total — each a reason it is less certain than it
// looks (lib/postage-display.ts).
function PlanNotes({
  plan,
  regionLabel,
  regionOpt,
}: {
  plan: BasketPlan;
  regionLabel: string | null;
  regionOpt: BasketRegionOption | null;
}) {
  const notes = planPostageNotes(plan, !!regionLabel, !!regionOpt?.unmeasured);
  return notes.length ? <p className="mt-0.5 text-xs text-amber-300/80">{notes.join(" · ")}</p> : null;
}

// Stores that stock a card on the list but were left out, each with its own
// reason. Neutral: a store is left out because it quoted no postage to the
// buyer's region, it offers only untracked postage under "Tracked postage
// only", or it posts nowhere we measured — and "doesn't post to you" was wrong
// for two of those.
function LeftOut({ plan }: { plan: BasketPlan }) {
  if (!plan.excludedStores.length) return null;
  return (
    <div className="card-surface p-4 text-xs text-slate-400">
      <p className="font-semibold text-slate-300">Left out of this plan:</p>
      <ul className="mt-1 space-y-0.5">
        {plan.excludedStores.map((x) => (
          <li key={x.key}>
            <span className="text-slate-300">{x.name}</span> — {x.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Where every postage figure comes from, under every kind of answer.
function PostageFooter({ postage, className, children }: { postage: PostageView; className: string; children?: ReactNode }) {
  const { regionLabel, regionOpt, measuredAt, places } = postage;
  return (
    <p className={`text-[11px] leading-relaxed text-slate-600 ${className}`}>
      Postage is priced from the nearest order sizes each store&apos;s checkout quoted
      {measuredAt ? `, measured ${measuredAt}` : ""}
      {regionLabel
        ? ` for delivery to ${regionLabel}`
        : ` — the highest rate we measured${places ? ` (to ${places})` : ""}${
            regionOpt?.unmeasured ? `, since we haven't measured delivery ${regionOpt.phrase}` : ", until you pick your region"
          }`}
      . Stores marked <span className="text-slate-400">est.</span> haven&apos;t been measured yet (or not to your region);{" "}
      <span className="text-slate-400">from</span> means postage is at least that — an order bigger than any we measured, or a
      region further than any address we measured. Stores change their rates: the store&apos;s own checkout is final.
      {children}
    </p>
  );
}

// The line under each store's name: its own rate name, and what else a buyer
// should know about it — a skipped untracked letter, a free-postage threshold
// within reach, a minimum order, an order bigger than any we measured, a store
// posting from abroad (lib/postage-display.ts).
function PostageLine({ group, fmt }: { group: BasketStoreGroup; fmt: (c: number) => string }) {
  const p = group.postage;
  if (p.basis === "estimate") {
    return (
      <p className="mt-0.5 text-[11px] text-amber-300/80">
        est. {fmt(p.cents)} — this store&apos;s postage hasn&apos;t been measured yet, so it&apos;s priced at the dearer of our guess
        and the dearest one-card rate of the stores we checked here; check at checkout.
      </p>
    );
  }
  const kind = trackedTag(p);
  const bits = postageLineBits(group, fmt);
  return (
    <p className="mt-0.5 text-[11px] text-slate-500">
      <span className="text-slate-400">
        {p.label} ({kind}) {p.free ? `${freePrefix(p)}free` : `${postagePrefix(p)}${fmt(p.cents)}`}
      </span>
      {p.note ? ` · ${p.note}` : ""}
      {bits.length > 0 && <> · {bits.join(" · ")}</>}
    </p>
  );
}

// Why there's no two-store card — three different situations (lib/basket.ts).
const TWO_STORES_NONE: Record<TwoStoresNone, string> = {
  "no-pair": "No two stores between them stock every card.",
  "one-card": "There's only one card on this list, so there's nothing to split.",
  "one-store-cheaper": "No two-store split we found beats buying the whole list from one store — see Best single store.",
};

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
        {plan.topUpCents > 0 ? ` + ${fmt(plan.topUpCents)} to a minimum order` : ""}
      </div>
      <div className="text-[11px] text-slate-500">
        {plan.storeCount} {plural(plan.storeCount, "order", "orders")}
        {plan.storeCount <= 2 ? `: ${plan.stores.map((s) => s.name).join(" + ")}` : ""}
      </div>
      {/* Below the headline only by leaning on a store's "from" postage past
          its measured sizes (see RiskyNaive): said, not crowned. */}
      <div className={`mt-1 text-[11px] font-semibold ${extra !== 0 ? "text-slate-400" : "text-brand-400"}`}>
        {extra > 0 ? `+${fmt(extra)} vs the cheapest split` : extra < 0 ? `${fmt(-extra)} less on "from" postage` : "Cheapest"}
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
