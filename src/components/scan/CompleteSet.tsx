"use client";

// "Complete your set" under the card scanner (DECISIONS.md 2026-11-19 "Complete my set after a scan"). After a scan it
// shows what the member is still missing from that card's set, cheapest first, six at a time, each with the site's row
// order: eBay (a tagged search link, zero eBay API calls), TCGplayer, then the cheapest real store with its price and
// "Add to cart". Under the list, one link prices every missing card in one basket (Best Basket's "Finish this set").
// It reads /api/scan/set-gap; nothing here calls eBay.
import { useCallback, useEffect, useState } from "react";
import { OutboundLink } from "@/components/OutboundLink";
import { CartAddButton } from "@/components/cart/CartAddButton";
import { useCountry } from "@/components/CountryProvider";

interface GapItem {
  id: string;
  name: string;
  number: string;
  rarity: string;
  image: string | null;
  href: string;
  minCents: number | null;
  stores: number;
  ebayHref: string;
  tcgplayer: { href: string; priceCents: number; currency: string } | null;
  store: { key: string; name: string; href: string; productUrl: string; priceCents: number; currency: string; condition: string | null } | null;
}
interface Gap {
  set: { code: string; name: string; slug: string };
  total: number;
  have: number;
  buyable: number;
  costCents: number;
  notStocked: number;
  items: GapItem[];
  next: number | null;
}

export function CompleteSet({ setCode, refresh, onBasket }: { setCode: string; refresh: number; onBasket: () => void }) {
  const { country, fmt } = useCountry();
  const [gap, setGap] = useState<Gap | null>(null);
  const [more, setMore] = useState<GapItem[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (offset: number) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/scan/set-gap?set=${encodeURIComponent(setCode)}&offset=${offset}`, { cache: "no-store" });
      if (!r.ok) return null;
      return (await r.json()) as Gap;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }, [setCode]);

  useEffect(() => {
    let live = true;
    load(0).then((g) => {
      if (!live) return;
      setGap(g);
      setMore([]);
      setNext(g?.next ?? null);
    });
    return () => {
      live = false;
    };
  }, [load, refresh]);

  if (!gap || gap.total === 0) return null;
  const missing = gap.total - gap.have;
  const pct = Math.round((gap.have / gap.total) * 100);
  const items = [...gap.items, ...more];

  return (
    <section className="card-surface rounded-2xl p-4" aria-labelledby="complete-set-h">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="complete-set-h" className="text-base font-bold text-white">Complete your {gap.set.name}</h2>
        <span className="text-xs text-slate-300">{gap.have} of {gap.total}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={gap.total} aria-valuenow={gap.have} aria-label={`${gap.have} of ${gap.total} ${gap.set.name} cards`}>
        <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-emerald-400" style={{ width: `${Math.max(2, pct)}%` }} />
      </div>
      {missing === 0 ? (
        <p className="mt-3 text-sm text-emerald-300">You have every card of the base set. Nice.</p>
      ) : (
        <p className="mt-2 text-sm text-slate-300">
          {missing} to go.{" "}
          {gap.buyable > 0 && <>The {gap.buyable} in stock cost about <span className="font-semibold text-white">{fmt(gap.costCents)}</span> at the cheapest store each. Cheapest first:</>}
        </p>
      )}

      {items.length > 0 && (
        <ul className="mt-3 divide-y divide-white/10">
          {items.map((c, i) => (
            <li key={c.id} className="flex gap-3 py-3">
              <a href={c.href} target="_blank" rel="noopener" className="flex-none" aria-label={`${c.name} card page`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.image ?? ""} alt="" aria-hidden="true" className="h-20 w-[3.6rem] rounded object-cover ring-1 ring-white/10" loading="lazy" />
              </a>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{c.name}</p>
                <p className="text-xs text-slate-400">{c.number} · {c.rarity}{c.minCents != null && <> · from <span className="font-semibold text-slate-200">{fmt(c.minCents)}</span></>}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <OutboundLink href={c.ebayHref} retailer="ebay" country={country} cardId={c.id} cardName={c.name} pageType="scan" surface="scan_set" positionInList={i + 1} className="rounded-full bg-[#0064d2] px-3 py-1 text-xs font-semibold text-white hover:brightness-110">
                    eBay
                  </OutboundLink>
                  {c.tcgplayer && (
                    <OutboundLink href={c.tcgplayer.href} retailer="tcgplayer" country={country} cardId={c.id} cardName={c.name} price={c.tcgplayer.priceCents / 100} pageType="scan" surface="scan_set" positionInList={i + 1} inStock className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/15 hover:bg-white/15">
                      TCGplayer
                    </OutboundLink>
                  )}
                  {c.store && (
                    <OutboundLink href={c.store.href} retailer={c.store.key} country={country} cardId={c.id} cardName={c.name} price={c.store.priceCents / 100} cheapestPrice={c.store.priceCents / 100} pageType="scan" surface="scan_set" positionInList={i + 1} inStock condition={c.store.condition} className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-400/25">
                      {fmt(c.store.priceCents)} at {c.store.name}
                    </OutboundLink>
                  )}
                  {c.store && (
                    <CartAddButton
                      inline
                      href={c.store.href}
                      productUrl={c.store.productUrl}
                      storeName={c.store.name}
                      title={c.name}
                      detail={[c.number, c.store.condition].filter(Boolean).join(" · ")}
                      priceCents={c.store.priceCents}
                      currency={c.store.currency}
                      image={c.image}
                      page="/scan"
                    />
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {next !== null && (
        <button
          type="button"
          disabled={loading}
          className="mt-1 w-full rounded-xl py-2 text-sm text-slate-200 ring-1 ring-white/10 hover:bg-white/5 disabled:opacity-60"
          onClick={async () => {
            const g = await load(next);
            if (!g) return;
            setMore((xs) => [...xs, ...g.items]);
            setNext(g.next);
          }}
        >
          {loading ? "Loading…" : "Show 6 more"}
        </button>
      )}

      {gap.buyable > 1 && (
        <a
          href={`/tools/best-basket?source=set&set=${encodeURIComponent(gap.set.slug)}`}
          onClick={onBasket}
          className="btn-primary mt-3 block rounded-xl py-2.5 text-center text-sm"
        >
          Price all {gap.buyable} in one basket
        </a>
      )}
      <p className="mt-2 text-center text-xs text-slate-400">
        {gap.notStocked > 0 && <>{gap.notStocked} more aren&apos;t in stock at a store today. </>}
        <a href={`/portfolio/sets/${gap.set.slug}`} className="underline">See the full checklist</a>
      </p>
    </section>
  );
}
