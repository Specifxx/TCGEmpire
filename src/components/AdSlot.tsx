"use client";

import Link from "next/link";
import { usePremium } from "./PremiumProvider";

// ── House promos ─────────────────────────────────────────────────────────────────
// First-party promo units — these slots only ever render RiftCompare's own
// content (links to the movers list, the Box EV tool, the Index, price alerts).
// No third-party ad network is loaded anywhere on the site: the previous
// HilltopAds integration was removed entirely in favour of affiliate revenue
// (eBay / TCGplayer, see EbayAd + FooterAds) and Premium subscriptions, because
// a popunder/push network sits badly next to the marketplace's buyer-protection
// promises. Premium members get an ad-free site (renders nothing).
const HOUSE_ADS = [
  { emoji: "📈", title: "Today's biggest price moves", sub: "Risers, drops and best-value buys — updated daily", cta: "See the movers", href: "/movers" },
  { emoji: "🎲", title: "Is that booster box worth opening?", sub: "Run the numbers against live singles prices", cta: "Box EV calculator", href: "/tools/box-ev" },
  { emoji: "📊", title: "The RiftCompare Index", sub: "The whole Riftbound market in one number", cta: "View the index", href: "/market" },
  { emoji: "🔔", title: "Never overpay for a card again", sub: "Free price alerts when a card hits your target", cta: "Browse & set an alert", href: "/browse" },
];

// Deterministic pick so server render === hydration (no Math.random) and each
// placement keeps a stable promo.
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function HouseAd({ seed, height }: { seed: string; height: number }) {
  const ad = HOUSE_ADS[hashStr(seed) % HOUSE_ADS.length];
  return (
    <Link
      href={ad.href}
      className="relative flex h-full w-full items-center justify-between gap-3 overflow-hidden rounded-xl border border-ink-700 bg-gradient-to-r from-ink-900 to-ink-850 px-4 transition-colors hover:border-brand-500"
      style={{ height }}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="text-2xl" aria-hidden>{ad.emoji}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-white">{ad.title}</span>
          <span className="block truncate text-xs text-slate-400">{ad.sub}</span>
        </span>
      </span>
      <span className="hidden shrink-0 rounded-lg border border-brand-500/40 bg-brand-500/10 px-3 py-1.5 text-xs font-bold text-brand-400 sm:block">
        {ad.cta} →
      </span>
      <span className="absolute right-1 top-1 rounded bg-ink-950/70 px-1 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
        RiftCompare
      </span>
    </Link>
  );
}

// In-content placement: a fixed-height, overflow-hidden frame (zero CLS by
// construction) showing a first-party HouseAd. Premium members see nothing.
export function AdSlot({
  slot,
  label = "Advertisement",
  height = 90,
  className,
}: {
  slot?: string;
  label?: string;
  height?: number;
  format?: string;
  responsive?: boolean;
  className?: string;
}) {
  const premium = usePremium();
  if (premium) return null;
  return (
    <div className={`relative overflow-hidden ${className ?? ""}`} style={{ height }}>
      <HouseAd seed={slot || `${label}-${height}-${className ?? ""}`} height={height} />
    </div>
  );
}
