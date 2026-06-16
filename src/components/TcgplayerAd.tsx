"use client";

import { OutboundLink } from "./OutboundLink";
import { usePremium } from "./PremiumProvider";

// TCGplayer affiliate banners (approved Impact contract). First-party placements,
// no ad network. We render our OWN evergreen creative rather than Impact's hosted
// banner images: those are seasonal campaign art (e.g. "Mayhem 2026") that expires
// the moment the campaign ends, leaving stale/irrelevant ads — and a click link
// tied to a deactivated creative can stop paying commission. Our banner is
// always-relevant and region-aware; clicks route through the evergreen tracking
// ids below (commission on click-through purchases). Fixed dimensions = zero CLS.
const ACCOUNT = "7385758";
const PROGRAM = "21018";

type Variant = "rect" | "leaderboard" | "billboard" | "mobile" | "mobileRect";

// Evergreen tracking ids (the non-seasonal "international" creatives from the
// Impact ads export). Used ONLY for the click/commission link — never expire, so
// attribution can't silently break when a seasonal campaign rotates out.
const ADS: Record<Variant, { id: string; w: number; h: number }> = {
  rect: { id: "3841228", w: 336, h: 280 }, // large rectangle
  leaderboard: { id: "3841229", w: 728, h: 90 },
  billboard: { id: "3841226", w: 970, h: 90 }, // large leaderboard
  mobile: { id: "3841227", w: 320, h: 100 }, // large mobile banner
  mobileRect: { id: "3841225", w: 300, h: 250 }, // medium rectangle
};

const click = (id: string) => `https://partner.tcgplayer.com/c/${ACCOUNT}/${id}/${PROGRAM}`;

// Region-aware tagline — the actual objection each visitor has. US shoppers care
// about speed; everyone else cares whether TCGplayer ships to them.
function tagline(country: string): string {
  if (country === "US") return "Fast US shipping";
  if (country === "NZ") return "Ships to New Zealand";
  if (country === "UK") return "Ships to the UK";
  if (country === "AU") return "Ships to Australia";
  return "Ships worldwide";
}

function Banner({ w, h, country }: { w: number; h: number; country: string }) {
  const horizontal = w >= 2.5 * h; // leaderboard / billboard / mobile strip
  return (
    <span
      className="relative inline-block overflow-hidden rounded-lg border border-sky-500/30 bg-gradient-to-r from-ink-900 via-[#0d1828] to-ink-900"
      style={{ width: w, height: h }}
    >
      <OutboundLink
        href={click(pickId(w, h))}
        retailer="tcgplayer_banner"
        country={country}
        className="absolute inset-0 block transition-colors hover:bg-sky-500/5"
      >
        <span
          className={`absolute inset-0 flex px-4 ${
            horizontal ? "flex-row items-center justify-center gap-3 text-left" : "flex-col items-center justify-center gap-1 text-center"
          }`}
        >
          <span className="text-base font-extrabold tracking-tight text-white">
            TCG<span className="text-sky-400">player</span>
          </span>
          <span className={horizontal ? "" : "leading-tight"}>
            <span className="block text-[13px] font-semibold text-slate-200">Shop Riftbound singles &amp; sealed</span>
            <span className="block text-[11px] text-slate-400">{tagline(country)}</span>
          </span>
          <span
            className={`shrink-0 rounded-md bg-sky-500/15 px-2.5 py-1 text-[11px] font-bold text-sky-300 ${
              horizontal ? "" : "mt-1.5"
            }`}
          >
            Shop now →
          </span>
        </span>
      </OutboundLink>
      <span className="pointer-events-none absolute left-1 top-1 rounded bg-ink-950/70 px-1 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
        Ad
      </span>
    </span>
  );
}

// Map a rendered size back to its evergreen tracking id (banners are fixed-size,
// so dimensions identify the variant unambiguously).
function pickId(w: number, h: number): string {
  const match = Object.values(ADS).find((a) => a.w === w && a.h === h);
  return match?.id ?? ADS.leaderboard.id;
}

// Responsive placement: `size` for larger screens, a mobile unit below `sm`.
// `mobile="rect"` swaps the slim 320x100 banner for the 300x250 rectangle — a
// far better in-content unit on phones. The billboard steps down to the 728
// leaderboard between sm and lg so it never overflows.
export function TcgplayerAd({
  size = "rect",
  mobile = "banner",
  country,
  className,
}: {
  size?: "rect" | "leaderboard" | "billboard";
  mobile?: "banner" | "rect";
  country: string;
  className?: string;
}) {
  if (usePremium()) return null; // ad-free for Premium subscribers
  const dims = (v: Variant) => ({ w: ADS[v].w, h: ADS[v].h });
  const desk = dims(size);
  const mid = dims("leaderboard");
  const mob = dims(mobile === "rect" ? "mobileRect" : "mobile");
  return (
    <div className={`flex justify-center ${className ?? ""}`}>
      {size === "billboard" ? (
        <>
          <span className="hidden lg:inline-block">
            <Banner {...desk} country={country} />
          </span>
          <span className="hidden sm:inline-block lg:hidden">
            <Banner {...mid} country={country} />
          </span>
        </>
      ) : (
        <span className="hidden sm:inline-block">
          <Banner {...desk} country={country} />
        </span>
      )}
      <span className="sm:hidden">
        <Banner {...mob} country={country} />
      </span>
    </div>
  );
}
