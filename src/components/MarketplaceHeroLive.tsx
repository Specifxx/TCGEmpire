"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCountry } from "./CountryProvider";
import { formatMoney } from "@/lib/format";

export interface HeroListing {
  priceCents: number;
  quantity: number;
  country: string;
  currency: string;
  seller?: { displayName: string; sellerProfile: { shopName: string | null; isOfficial: boolean } | null };
}

const FLAG: Record<string, string> = { AU: "🇦🇺", UK: "🇬🇧", US: "🇺🇸" };

// Client half of the card-page marketplace hero (see MarketplaceHeroBlock for the
// server half). Renders instantly from the server-fetched listing set (all
// markets — cheap, cookie-free, so the page stays ISR-cacheable), then
// re-localises to the visitor's own market via useCountry() and does one live
// refetch on mount so listing churn shows up without waiting on the page's 24h
// ISR fallback (see lib/revalidate-card.ts for the write-side half of that).
export function MarketplaceHeroLive({ cardId, initial }: { cardId: string; initial: HeroListing[] }) {
  const { country } = useCountry();
  const [listings, setListings] = useState<HeroListing[]>(initial);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/marketplace/listings?cardId=${encodeURIComponent(cardId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !Array.isArray(data.listings)) return;
        setListings(
          data.listings.map((l: any) => ({
            priceCents: l.priceCents,
            quantity: l.quantity,
            country: l.country,
            currency: l.currency,
            seller: l.seller,
          }))
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  const { here, byCountry } = useMemo(() => {
    const here = listings.filter((l) => l.country === country);
    const byCountry = new Map<string, number>();
    for (const l of listings) byCountry.set(l.country, (byCountry.get(l.country) ?? 0) + 1);
    return { here, byCountry };
  }, [listings, country]);

  if (listings.length === 0) return null;

  // Cheapest listing decides the headline price (never overridden by official
  // status — that would misrepresent the actual best deal); its seller is who
  // gets named/badged here, since that's the listing the CTA sends buyers to.
  const cheapestListing = here.length
    ? here.reduce((best, l) => (l.priceCents < best.priceCents ? l : best), here[0])
    : null;
  const cheapest = cheapestListing?.priceCents ?? null;
  const sellerName = cheapestListing?.seller?.sellerProfile?.shopName ?? cheapestListing?.seller?.displayName ?? null;
  const isOfficial = !!cheapestListing?.seller?.sellerProfile?.isOfficial;
  const qty = here.reduce((n, l) => n + l.quantity, 0);
  const cur = here[0]?.currency ?? "AUD";
  const href = `/marketplace?cardId=${encodeURIComponent(cardId)}`;

  return (
    <div className={`card-surface mt-6 overflow-hidden bg-gradient-to-br via-ink-900 to-ink-900 p-5 ${isOfficial ? "border-gold/50 from-gold/10" : "border-brand-500/40 from-brand-500/10"}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip bg-brand-500 text-[10px] font-extrabold uppercase tracking-wide text-ink-950">RiftCompare Marketplace</span>
            {isOfficial && (
              <span className="chip bg-gold/20 text-[10px] font-extrabold uppercase tracking-wide text-gold">★ Official RiftCompare Store</span>
            )}
            <span className="text-xs text-slate-400">buy directly from a verified seller — funds held until delivery</span>
          </div>
          {cheapest != null ? (
            <div className="mt-2 flex flex-wrap items-baseline gap-2">
              <span className="num text-2xl font-extrabold text-accent">{formatMoney(cheapest, cur)}</span>
              <span className="text-sm text-slate-400">
                from {here.length} {here.length === 1 ? "listing" : "listings"} · {qty} in stock in your market
                {sellerName && <> · sold by <span className="text-slate-300">{sellerName}</span></>}
              </span>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-300">
              Listed by sellers in {[...byCountry.keys()].map((c) => `${FLAG[c] ?? ""} ${c}`).join(", ")} — switch your market to buy directly.
            </p>
          )}
          {byCountry.size > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[...byCountry.entries()].map(([c, n]) => (
                <span key={c} className="chip bg-ink-800 text-[10px] font-semibold text-slate-400">
                  {FLAG[c] ?? ""} {c} · {n}
                </span>
              ))}
            </div>
          )}
        </div>
        <Link href={href} className="btn-primary shrink-0 whitespace-nowrap">
          {here.length ? "View listings →" : "See marketplace →"}
        </Link>
      </div>
    </div>
  );
}
