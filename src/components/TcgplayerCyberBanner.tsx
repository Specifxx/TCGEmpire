"use client";

import { useEffect, useState } from "react";
import { OutboundLink } from "./OutboundLink";
import { useCountry } from "./CountryProvider";
import { creativeImage, cyberBannerState, cyberBannerText, pickCreatives } from "@/lib/tcgplayer-cyber";

// TCGplayer's Cyber Weekend banner (lib/tcgplayer-cyber.ts): under the price table and on the Black Friday and Cyber Monday pages,
// never above a price, labelled Ad. The moment is read again in the browser, so a page the CDN kept a day still switches on and off
// on time. TCGplayer's own creative when one is set, else our own text version. Its link is a tagged TCGplayer search (affiliateUrl).
// Clicks: surface "cyber_banner".
export function TcgplayerCyberBanner({
  href,
  at,
  pageType,
  name,
  className = "",
}: {
  href: string;
  at: number;
  pageType: string;
  name?: string;
  className?: string;
}) {
  const { country } = useCountry();
  const [now, setNow] = useState(at);
  useEffect(() => setNow(Date.now()), []);
  const state = cyberBannerState(now);
  if (state === "off") return null;
  const { wide, small } = pickCreatives(now);
  const text = cyberBannerText(state);
  const alt = `${text.head}: ${text.line}`;
  const link = (children: React.ReactNode, extra = "") => (
    <OutboundLink href={href} retailer="tcgplayer" country={country} kind="sealed" cardName={name} pageType={pageType} surface="cyber_banner" className={extra}>
      {children}
    </OutboundLink>
  );
  return (
    <aside aria-label="Advertisement: TCGplayer Cyber Weekend" data-tcgplayer-cyber="" className={`relative ${className}`}>
      <span className="absolute right-2 top-2 z-10 rounded border border-ink-700 bg-ink-900 px-1.5 text-[11px] font-semibold uppercase leading-5 text-slate-400">Ad</span>
      {wide || small ? (
        <div className="flex justify-center">
          {wide &&
            link(
              // eslint-disable-next-line @next/next/no-img-element
              <img src={creativeImage(wide.adId)} width={wide.width} height={wide.height} alt={alt} loading="lazy" className="h-auto max-w-full" />,
              small ? "hidden sm:block" : "block",
            )}
          {small &&
            link(
              // eslint-disable-next-line @next/next/no-img-element
              <img src={creativeImage(small.adId)} width={small.width} height={small.height} alt={alt} loading="lazy" className="h-auto max-w-full" />,
              wide ? "block sm:hidden" : "block",
            )}
        </div>
      ) : (
        link(
          <span className="card-surface flex flex-col gap-1 px-5 py-4 pr-12 sm:flex-row sm:items-center sm:gap-4">
            <span className="text-lg font-bold text-white">{text.head}</span>
            <span className="text-sm text-slate-400">{text.line}</span>
            <span className="text-sm font-semibold text-white underline decoration-ink-600 underline-offset-2 sm:ml-auto sm:shrink-0">Shop on TCGplayer →</span>
          </span>,
          "block",
        )
      )}
    </aside>
  );
}
