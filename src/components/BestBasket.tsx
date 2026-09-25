"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/format";
import { OutboundLink } from "./OutboundLink";
import { AffiliateDisclosure } from "./AffiliateDisclosure";
import { useCountry } from "./CountryProvider";
import { ebaySearchUrl } from "@/lib/affiliate";
import { pickPrice } from "@/lib/country";
import { cardDisplayName } from "@/lib/card-name";
import { cardImageAlt } from "@/lib/image-alt";
import { CardSearch, type SearchCard } from "./CardSearch";
import type { BasketPlan, BasketStoreGroup } from "@/lib/basket";
import { trackEvent } from "@/lib/analytics";
import { effectiveRegion, readPostagePrefs, writePostagePrefs } from "@/lib/postage-prefs";
import { freePrefix, joinList, planPostageNotes, postageLineBits, postagePrefix, trackedTag } from "@/lib/postage-display";

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

// The Best-Basket tool UI. Primary flow: search for a card, pick the exact
// printing, set a quantity — build up a list, then price it. Pasting a raw
// decklist is kept as a secondary "advanced" option for anyone who already
// has a list in TCGplayer Mass-Entry format (deck import links, etc.) rather
// than picking cards one at a time.
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
// and lib/postage-display.ts.
export function BestBasket({
  currency,
  initialList,
  market,
  regions,
  zonePriced,
  measuredAt,
  measuredTo,
  geoRegion,
}: {
  currency: string;
  initialList?: string;
  market: string;
  regions: BasketRegionOption[];
  zonePriced: boolean;
  measuredAt: string | null; // "25 Sep 2026"
  measuredTo: string[]; // the addresses the market was measured to: ["New York", "San Francisco", …]
  geoRegion: string | null; // the region the visitor's location suggests (a regions[] key), or null
}) {
  const { country } = useCountry();
  const [picked, setPicked] = useState<PickedLine[]>([]);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState(initialList ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<BasketPlan | null>(null);
  const validRegion = (k: string) => regions.some((r) => r.key === k);
  // The server knows the visitor's location, so the first render already
  // shows their region; a remembered choice replaces it after mount.
  const [region, setRegion] = useState<string | null>(geoRegion && validRegion(geoRegion) ? geoRegion : null);
  const [regionGuessed, setRegionGuessed] = useState(!!geoRegion && validRegion(geoRegion));
  const [trackedOnly, setTrackedOnly] = useState(false);
  const lastRun = useRef<{ kind: "lines"; lines: { cardId: string; qty: number }[] } | { kind: "text"; text: string } | null>(null);
  // Only the latest request's answer is shown: a delivery change re-prices
  // while an earlier request may still be in flight.
  const runSeq = useRef(0);

  // Remembered choices load after mount (localStorage is not readable on the
  // server); an unknown region prices at each store's highest regional rate.
  useEffect(() => {
    const p = readPostagePrefs(market);
    setRegion(effectiveRegion(p, geoRegion, validRegion));
    setRegionGuessed(!p.regionChosen && !!geoRegion && validRegion(geoRegion));
    setTrackedOnly(p.trackedOnly);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market, regions, geoRegion]);

  const postageQuery = (r: string | null, t: boolean) => {
    const q = new URLSearchParams();
    if (r) q.set("region", r);
    if (t) q.set("tracked", "1");
    const s = q.toString();
    return s ? `?${s}` : "";
  };

  async function runLines(lines: { cardId: string; qty: number }[], r = region, t = trackedOnly) {
    lastRun.current = { kind: "lines", lines };
    const seq = ++runSeq.current;
    setLoading(true);
    setError(null);
    setPlan(null);
    try {
      const res = await fetch(`/api/basket${postageQuery(r, t)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
      });
      const d = await res.json();
      if (seq !== runSeq.current) return;
      if (!res.ok) {
        setError(d.error ?? "Something went wrong");
        return;
      }
      const built = d.plan as BasketPlan;
      setPlan(built);
      trackEvent("best_basket_build", { card_count: built.matchedCards, total_price: built.totalCents / 100, region: country });
    } catch {
      if (seq === runSeq.current) setError("Network error — try again.");
    } finally {
      if (seq === runSeq.current) setLoading(false);
    }
  }

  async function runPasted(listText: string, r = region, t = trackedOnly) {
    lastRun.current = { kind: "text", text: listText };
    const seq = ++runSeq.current;
    setLoading(true);
    setError(null);
    setPlan(null);
    try {
      const res = await fetch(`/api/basket${postageQuery(r, t)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: listText }),
      });
      const d = await res.json();
      if (seq !== runSeq.current) return;
      if (!res.ok) {
        setError(d.error ?? "Something went wrong");
        return;
      }
      const built = d.plan as BasketPlan;
      setPlan(built);
      trackEvent("best_basket_build", { card_count: built.matchedCards, total_price: built.totalCents / 100, region: country });
    } catch {
      if (seq === runSeq.current) setError("Network error — try again.");
    } finally {
      if (seq === runSeq.current) setLoading(false);
    }
  }

  // A list arriving via ?list= (e.g. "Price this deck in Best Basket" from a
  // deck page) runs automatically — someone who followed that link is trying
  // to SEE a result, not re-paste a list they already had priced elsewhere.
  // Guarded to fire once, and only when a real list was actually handed in.
  // The paste panel opens too, since the auto-priced list lives there.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || !initialList?.trim()) return;
    autoRan.current = true;
    setShowPaste(true);
    // The remembered region is read here too: this runs in the same commit as
    // the prefs effect above, before its state update lands.
    const p = readPostagePrefs(market);
    void runPasted(initialList, effectiveRegion(p, geoRegion, validRegion), p.trackedOnly);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A changed delivery choice re-prices the basket already on screen.
  function changePostage(nextRegion: string | null, nextTracked: boolean) {
    setRegion(nextRegion);
    setRegionGuessed(false);
    setTrackedOnly(nextTracked);
    writePostagePrefs(market, { region: nextRegion, trackedOnly: nextTracked });
    const last = lastRun.current;
    if (!last) return; // nothing priced yet: the choice applies to the next run
    if (last.kind === "lines") void runLines(last.lines, nextRegion, nextTracked);
    else void runPasted(last.text, nextRegion, nextTracked);
  }
  const regionOpt = regions.find((r) => r.key === region) ?? null;
  // A MEASURED region the buyer is pricing for ("the Northeast"); "Elsewhere"
  // is priced like an unknown region and says so.
  const regionLabel = regionOpt && !regionOpt.unmeasured ? regionOpt.phrase : null;
  const places = joinList(measuredTo);

  const fmt = (c: number) => formatMoney(c, currency);

  function addCard(c: SearchCard) {
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
    setPicked((prev) => prev.map((p) => (p.card.id === cardId ? { ...p, qty: Math.max(1, Math.min(99, qty)) } : p)));
  }

  function removeCard(cardId: string) {
    setPicked((prev) => prev.filter((p) => p.card.id !== cardId));
  }

  return (
    <div className="space-y-5">
      <div className="card-surface p-5">
        <label className="mb-1 block text-xs font-medium text-slate-400">Search for a card and add it to your basket</label>
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
                    {(() => {
                      const c = pickPrice(p.card, country);
                      return c != null ? <> · <span className="text-accent">{fmt(c)}</span></> : null;
                    })()}
                  </div>
                </div>
                {/* sm:text-sm, not text-sm: .input is 16px below sm so iOS doesn't zoom the page on focus (2026-09-23). */}
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={p.qty}
                  onChange={(e) => setQty(p.card.id, parseInt(e.target.value, 10) || 1)}
                  aria-label={`Quantity for ${p.card.name}`}
                  className="input w-14 shrink-0 py-1 text-center sm:text-sm"
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

        {/* Delivery: where it is going, and whether untracked letters count. */}
        <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-2 rounded-lg border border-ink-800 p-2.5">
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

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => void runLines(picked.map((p) => ({ cardId: p.card.id, qty: p.qty })))}
            disabled={loading || picked.length === 0}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {loading ? "Optimising…" : "🧺 Find the cheapest basket"}
          </button>
          <button type="button" onClick={() => setShowPaste((v) => !v)} className="text-xs text-slate-500 hover:text-slate-300">
            {showPaste ? "Hide" : "Advanced: paste a decklist instead"}
          </button>
        </div>
        {error && <p role="alert" className="mt-2 text-sm text-rose-400">{error}</p>}

        {showPaste && (
          <div className="mt-4 border-t border-ink-800 pt-4">
            <label className="mb-1 block text-xs font-medium text-slate-400">Paste a decklist (or any card list)</label>
            {/* sm:text-sm, not text-sm: .input is 16px below sm so iOS doesn't zoom the page on focus (2026-09-23). */}
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={6}
              placeholder={"3 Jinx, Loose Cannon\n2 Vayne, Hunter\n1 Yasuo, the Unforgiven"}
              className="input font-mono sm:text-sm"
            />
            <div className="mt-3">
              <button
                onClick={() => void runPasted(pasteText)}
                disabled={loading || !pasteText.trim()}
                className="btn-ghost text-sm disabled:opacity-50"
              >
                {loading ? "Optimising…" : "🧺 Find the cheapest basket"}
              </button>
            </div>
          </div>
        )}
      </div>

      {plan && (
        <>
          {/* Summary */}
          <div className="card-surface p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Cheapest landed total</div>
                <div className="font-display text-4xl font-extrabold text-white">{fmt(plan.totalCents)}</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {fmt(plan.itemsCents)} cards + {fmt(plan.shippingCents)} postage
                  {plan.topUpCents > 0 && <> + {fmt(plan.topUpCents)} to reach a minimum order</>} · {plan.storeCount}{" "}
                  {plan.storeCount === 1 ? "store" : "stores"} · {plan.matchedCards} cards matched
                  {regionLabel ? ` · delivered to ${regionLabel}` : ""}
                </div>
                {(() => {
                  const notes = planPostageNotes(plan, !!regionLabel, !!regionOpt?.unmeasured);
                  return notes.length ? <div className="mt-0.5 text-xs text-amber-300/80">{notes.join(" · ")}</div> : null;
                })()}
              </div>
              {plan.savedCents > 0 && (
                <div className="rounded-lg bg-brand-500/10 px-3 py-2 text-right">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">vs buying each cheapest</div>
                  <div className="text-lg font-extrabold text-brand-400">save {fmt(plan.savedCents)}</div>
                  <div className="text-[10px] text-slate-500">that way needs {plan.naiveStoreCount} stores ({fmt(plan.naiveTotalCents)})</div>
                </div>
              )}
            </div>
          </div>

          {/* Per-store shopping lists */}
          {plan.stores.map((s) => (
            <div key={s.key} className="card-surface overflow-hidden">
              <div className="border-b border-ink-700 px-4 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold text-white">{s.name}</h3>
                  <span className="shrink-0 text-xs text-slate-400">
                    {fmt(s.subtotalCents)}
                    {s.freeShipping ? (
                      <span className="ml-1 text-brand-400">+ {freePrefix(s.postage)}free post</span>
                    ) : (
                      <span className="ml-1 text-slate-500">
                        + {postagePrefix(s.postage)}
                        {fmt(s.shippingCents)} post
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
                    <a href={l.url} target="_blank" rel="sponsored nofollow noopener noreferrer" className="min-w-0 flex-1 truncate font-medium text-white hover:text-brand-400">
                      {l.name}
                    </a>
                    <span className="shrink-0 text-slate-300">{fmt(l.unitCents)}{l.qty > 1 ? ` ea` : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {plan.unbuyable.length > 0 && (
            <div className="card-surface p-4 text-sm">
              <p className="font-semibold text-amber-300">No in-stock store listing for:</p>
              {/* Each card is now a live eBay search. The old copy named eBay as
                  the answer — "These may be eBay-only right now" — and then asked
                  the reader to open each card page one at a time to find it, in
                  slate-600. Having identified both the need and the marketplace
                  that fills it, sending them off to look it up themselves was the
                  one thing left to fix. */}
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
              <p className="mt-2 text-xs text-slate-500">
                No tracked store has these in stock right now — eBay usually carries the long tail.
              </p>
              <AffiliateDisclosure partner="ebay" tight />
            </div>
          )}

          {plan.excludedStores.length > 0 && (
            <div className="card-surface p-4 text-xs text-slate-400">
              {/* Neutral: a store is left out for its own reason — it quoted no
                  postage to the buyer's region, it offers only untracked
                  postage under "Tracked postage only", or it posts nowhere we
                  measured — and "doesn't post to you" was wrong for two of
                  those. */}
              <p className="font-semibold text-slate-300">Left out of this plan:</p>
              <ul className="mt-1 space-y-0.5">
                {plan.excludedStores.map((x) => (
                  <li key={x.key}>
                    <span className="text-slate-300">{x.name}</span> — {x.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-center text-[11px] leading-relaxed text-slate-600">
            Postage is priced from the nearest order sizes each store&apos;s checkout quoted
            {measuredAt ? `, measured ${measuredAt}` : ""}
            {regionLabel
              ? ` for delivery to ${regionLabel}`
              : ` — the highest rate we measured${places ? ` (to ${places})` : ""}${
                  regionOpt?.unmeasured ? `, since we haven't measured delivery ${regionOpt.phrase}` : ", until you pick your region"
                }`}
            . Stores marked <span className="text-slate-400">est.</span> haven&apos;t been measured yet (or not to your region);{" "}
            <span className="text-slate-400">from</span> means postage is at least that — an order bigger than any we measured, or
            a region further than any address we measured.
            Stores change their rates: the store&apos;s own checkout is final.
          </p>
        </>
      )}
    </div>
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
