"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { cardHref } from "@/lib/card-url";
import { cardDisplayName } from "@/lib/card-name";
import { displayRarity, rarityInfo } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import {
  SET_FOOTER_COPY,
  SET_SCOPES,
  isOwned,
  listRows,
  missingCsv,
  missingText,
  otherSourceLabel,
  preReleaseLine,
  raritiesIn,
  stockOf,
  summarise,
  summarisePreRelease,
  type ChecklistCard,
  type OwnedMap,
  type SetScope,
  type ShowFilter,
  type SortKey,
} from "@/lib/set-scope";
import { OwnedTick, SetLimitPanel, useSetOwned } from "./SetOwned";
import { SetMissingActions } from "./SetMissingActions";

// THE SET CHECKLIST (/portfolio/sets/[set], 2026-09-29, DECISIONS.md, "Set
// tracker"): what a binder is missing from one set, and the cheapest listing for
// each missing card.
//
// A client component on purpose. The page hands over the set's cached catalogue
// and the account's owned map once; scope, filters, sort, the progress numbers,
// the cost to finish and the missing-list export all follow from those with the
// pure functions in lib/set-scope.ts, so a tick updates every number at once with
// no round trip, and the page needs no searchParams (a loading.tsx sits above
// /portfolio, and scripts/adsense-guard.ts refuses one above a searchParams
// route).
//
// NO P&L IN THIS VIEW. The cost to finish is "the cheapest listing today, before
// postage" for cards you do not have. Nothing here says what a card is worth,
// what a binder gained, or what to buy before it moves.

const btn = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
    on ? "border-brand-400/60 bg-brand-500/20 text-brand-200" : "border-ink-700 text-slate-300 hover:border-brand-500"
  }`;

export function SetTracker({
  setName,
  setSlug,
  cards,
  initialOwned,
  currency,
  place,
  country,
  preRelease,
  releasedLabel,
  freeLimit,
}: {
  setName: string;
  setSlug: string;
  cards: ChecklistCard[];
  initialOwned: OwnedMap;
  currency: string;
  /** "the United States", for "not in stock in …". */
  place: string;
  country: string;
  /** The set has not released: "N revealed", no denominator, no prices. */
  preRelease: boolean;
  /** "23 October 2026", or null. */
  releasedLabel: string | null;
  freeLimit: number;
}) {
  const ctx = useSetOwned();
  const owned: OwnedMap = ctx?.owned ?? initialOwned;
  const [scope, setScope] = useState<SetScope>("base");
  const [show, setShow] = useState<ShowFilter>("missing");
  const [rarity, setRarity] = useState<string>("");
  const [sort, setSort] = useState<SortKey>("cheapest");
  // What was owned when the page loaded. A card ticked just now stays in the
  // "missing" list, dimmed, so a row never jumps away under a finger.
  const atLoad = useRef<OwnedMap>(initialOwned);

  const base = useMemo(() => summarise(cards, owned, "base"), [cards, owned]);
  const all = useMemo(() => summarise(cards, owned, "all"), [cards, owned]);
  const s = scope === "base" ? base : all;
  const rarities = useMemo(() => raritiesIn(cards, scope), [cards, scope]);
  const activeRarity = rarities.includes(rarity) ? rarity : "";

  const rows = useMemo(() => {
    // "Missing" is judged against what was owned at load, so a fresh tick stays visible.
    const judge = show === "missing" ? atLoad.current : owned;
    return listRows(cards, judge, { scope, show, rarity: activeRarity || null, sort });
  }, [cards, owned, scope, show, activeRarity, sort]);
  // The export is the live missing list in the current scope, rarity and order.
  const missingNow = useMemo(
    () => listRows(cards, owned, { scope, show: "missing", rarity: activeRarity || null, sort }),
    [cards, owned, scope, activeRarity, sort],
  );
  const pre = useMemo(() => summarisePreRelease(cards, owned), [cards, owned]);

  if (preRelease) {
    const list = cards.filter((c) => !c.isPromo).sort((a, b) => a.collectorNumber.localeCompare(b.collectorNumber, "en", { numeric: true }));
    return (
      <div className="flex flex-col gap-4">
        <section className="card-surface p-5" data-set-prerelease>
          <p className="font-display text-2xl font-extrabold text-white">{preReleaseLine(pre)}</p>
          <p className="mt-1 text-sm text-slate-400">
            {pre.owned > 0 ? `You have ${pre.owned} of them in your binder. ` : ""}
            {setName} isn&apos;t out yet, so there is no total to count against: cards appear here as they are revealed, and the
            progress bar and the cost to finish start once the set is released{releasedLabel ? ` on ${releasedLabel}` : ""}. Tick
            what you pull as you go.
          </p>
          <SetLimitPanel className="mt-3" />
        </section>
        <ul className="card-surface divide-y divide-ink-800 overflow-hidden">
          {list.map((c) => (
            <Row key={c.id} c={c} owned={owned} currency={currency} place={place} country={country} priced={false} />
          ))}
        </ul>
        <Notes setSlug={setSlug} setName={setName} freeLimit={freeLimit} />
      </div>
    );
  }

  const scopeInfo = SET_SCOPES.find((x) => x.key === scope)!;
  const counts = { missing: s.missing, owned: s.owned, all: s.total };
  return (
    <div className="flex flex-col gap-4">
      <section className="card-surface p-5" aria-labelledby="set-progress-h">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Which printings count">
          {SET_SCOPES.map((x) => (
            <button key={x.key} type="button" aria-pressed={scope === x.key} onClick={() => setScope(x.key)} className={btn(scope === x.key)}>
              {x.label} <span className="num text-slate-400">({(x.key === "base" ? base : all).total})</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">{scopeInfo.hint} Counts are printings in our catalogue.</p>

        <h2 id="set-progress-h" className="mt-4 font-display text-2xl font-extrabold text-white">
          {s.owned} of {s.total} {s.total === 1 ? "card" : "cards"}
          {s.percent != null && <span className="ml-2 text-base font-bold text-brand-300">{s.percent}%</span>}
        </h2>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={s.percent ?? 0}
          aria-label={`${setName} ${scopeInfo.label.toLowerCase()} owned`}
          className="mt-2 h-2.5 overflow-hidden rounded-full bg-ink-800"
        >
          <div className="h-full rounded-full bg-brand-500 transition-[width] duration-base" style={{ width: `${s.percent ?? 0}%` }} />
        </div>

        {s.missing === 0 ? (
          <p className="mt-3 text-sm text-slate-300">Every printing we track in this list is ticked.</p>
        ) : (
          <div className="mt-3 text-sm text-slate-300" data-set-cost>
            <p>
              <span className="font-semibold text-white">{s.priced > 0 ? formatMoney(s.costCents, currency) : "No store listing yet"}</span>
              {s.priced > 0 && (
                <>
                  {" "}
                  for the cheapest listing of {s.priced} missing {s.priced === 1 ? "card" : "cards"} in {place}
                </>
              )}
              .
            </p>
            {(s.notInStock > 0 || s.otherOnly > 0) && (
              <p className="mt-1 text-xs text-slate-400">
                Not in that total:{" "}
                {[
                  s.notInStock > 0 ? `${s.notInStock} not in stock in ${place}` : null,
                  s.otherOnly > 0 ? `${s.otherOnly} ${otherSourceLabel(country)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                .
              </p>
            )}
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">{SET_FOOTER_COPY}</p>
        <SetLimitPanel className="mt-3" />
      </section>

      <section className="flex flex-col gap-3" aria-label="Filter the list">
        <div className="flex flex-wrap items-center gap-2">
          {(["missing", "owned", "all"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={show === k} onClick={() => setShow(k)} className={btn(show === k)}>
              {k === "missing" ? "Missing" : k === "owned" ? "Owned" : "All"} <span className="num text-slate-400">({counts[k]})</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <label className="flex items-center gap-1.5">
            Rarity
            <select value={activeRarity} onChange={(e) => setRarity(e.target.value)} className="input py-1 text-xs sm:text-xs">
              <option value="">All</option>
              {rarities.map((r) => (
                <option key={r} value={r}>{rarityInfo(r).label}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="input py-1 text-xs sm:text-xs">
              <option value="cheapest">Cheapest first</option>
              <option value="dearest">Dearest first</option>
              <option value="number">Card number</option>
            </select>
          </label>
          <SetMissingActions
            text={missingText(missingNow)}
            csv={missingCsv(missingNow, currency)}
            filename={`riftcompare-${setSlug}-missing.csv`}
            count={missingNow.length}
          />
        </div>
      </section>

      {rows.length === 0 ? (
        <p className="card-surface p-6 text-center text-sm text-slate-400">
          {show === "missing" ? "Nothing missing here." : show === "owned" ? "Nothing ticked here yet." : "No cards match."}
        </p>
      ) : (
        <ul className="card-surface divide-y divide-ink-800 overflow-hidden">
          {rows.map((c) => (
            <Row key={c.id} c={c} owned={owned} currency={currency} place={place} country={country} priced justTicked={isOwned(owned, c.id) && !isOwned(atLoad.current, c.id)} />
          ))}
        </ul>
      )}
      <Notes setSlug={setSlug} setName={setName} freeLimit={freeLimit} />
    </div>
  );
}

function Row({
  c,
  owned,
  currency,
  place,
  country,
  priced,
  justTicked = false,
}: {
  c: ChecklistCard;
  owned: OwnedMap;
  currency: string;
  place: string;
  country: string;
  priced: boolean;
  justTicked?: boolean;
}) {
  const r = rarityInfo(displayRarity(c));
  const stock = stockOf(c);
  return (
    <li className={`flex items-center gap-3 px-3 py-2 sm:px-4 ${justTicked ? "opacity-60" : ""}`} data-card={c.id} data-owned={isOwned(owned, c.id) ? "1" : "0"}>
      <div className="w-[6.75rem] shrink-0 sm:w-[7.5rem]">
        <OwnedTick cardId={c.id} cardName={c.name} variant="row" />
      </div>
      <div className="min-w-0 flex-1">
        <Link href={cardHref(c)} className="block truncate text-sm font-semibold text-slate-100 hover:text-brand-300 hover:underline">
          {cardDisplayName(c.name, c)}
        </Link>
        <p className="text-xs text-slate-500">
          <span className="num">{c.setCode} · {c.collectorNumber}</span> ·{" "}
          <span style={{ color: r.color }}>{r.label}</span>
        </p>
      </div>
      {priced && (
        <div className="shrink-0 text-right text-xs">
          {stock === "store" ? (
            <>
              <div className="num text-sm font-bold text-white">{formatMoney(c.minCents ?? 0, currency)}</div>
              <div className="text-slate-500">
                {c.stores} {c.stores === 1 ? "store" : "stores"}
              </div>
            </>
          ) : stock === "other" ? (
            <span className="font-medium text-slate-400">{otherSourceLabel(country)}</span>
          ) : (
            <span className="font-medium text-slate-500">Not in stock in {place}</span>
          )}
        </div>
      )}
    </li>
  );
}

function Notes({ setSlug, setName, freeLimit }: { setSlug: string; setName: string; freeLimit: number }) {
  return (
    <div className="text-xs leading-relaxed text-slate-500">
      <p>
        Any finish and any condition counts as owned, one copy is enough, and promos are not part of the list. A free account
        tracks up to {freeLimit} cards; if you already hold more you keep all of them, and a paid plan has no limit.
      </p>
      <p className="mt-1">
        Ticked a card by mistake? Change its quantity in <Link href="/portfolio#collection" className="text-brand-400 hover:underline">My binder</Link>.
        Bringing in a whole binder? Import a CSV with a set, collector number, finish and quantity from the same place: it keeps the
        printing and tells you what it skipped. To price the delivered order for what&apos;s missing, paste the copied list into{" "}
        <Link href="/tools/best-basket" className="text-brand-400 hover:underline">Best Basket</Link>.
      </p>
      <p className="mt-1">
        <Link href={`/sets/${setSlug}`} className="text-brand-400 hover:underline">Back to the {setName} card list &amp; prices →</Link>
      </p>
    </div>
  );
}
