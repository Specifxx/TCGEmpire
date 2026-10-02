"use client";

import type { CSSProperties, MouseEvent } from "react";
import Link from "next/link";
import { PriceGuideChange } from "./PriceGuideChange";
import { useQuickView } from "../QuickView";
import type { CardTileData } from "../CardTile";
import { OutboundLink } from "../OutboundLink";
import { affiliateUrl, ebaySearchUrl, riftboundEbayQuery } from "@/lib/affiliate";

// The price guide's <tbody>, as a CLIENT component fed one compact object a
// row. Still server-rendered HTML (SSR), so crawlers and no-JS readers get the
// whole table; what changes is the inline RSC payload. Rendered by a server
// component, every row's element tree — tags, classNames, chip styles — was
// serialised a SECOND time into the document's __next_f pushes (~2.2 KB a row,
// escaped), which put the clean 100-row page at ~786 KB against the brief's
// ≤450 KB budget (DECISIONS.md, 2026-10-02). As props, a row is ~250 B.
//
// Everything that needs server-only data (set names, rarity rules, money
// formatting, card-art URLs) is resolved in PriceGuideTable before it gets
// here. The client imports beyond React and next/link (2026-10-02, owner's
// request: TCGplayer and eBay on every row, rows open the quick view) are all
// already in the root layout's bundle: QuickView's provider, OutboundLink and
// lib/affiliate. The outbound hrefs are BUILT here from the search name, not
// shipped per row, so the two buttons add ~40 B a row to the payload.

/** One row: short keys on purpose — each is written once per row into the RSC payload. */
export interface GuideRowProps {
  /** Row key (card id). */
  k: string;
  /** Card page href. */
  h: string;
  /** Thumbnail src (one small rendition), or null. */
  i: string | null;
  /** Display name. */
  n: string;
  /** Set name. */
  s: string;
  /** Collector number. */
  c: string;
  /** Rarity label and colour. */
  r: string;
  rc: string;
  /** Domain label and colour, card type. */
  d: string;
  dc: string;
  t: string;
  /** Formatted Lowest price (stores + eBay), or null when not in stock. */
  p: string | null;
  /** Formatted cheapest tracked eBay listing / TCGplayer figure, or null. */
  e: string | null;
  g: string | null;
  /** eBay / TCGplayer search keywords (cardSearchName). */
  q: string;
  /** Raw fields the quick view needs: name, set code, rarity, domain, variant, promo. */
  nr: string;
  sc: string;
  rr: string;
  dr: string;
  v: string | null;
  pr: 0 | 1;
  /** In-stock store count. */
  st: number;
  /** 7-day and 30-day moves (%), or null. */
  w: number | null;
  m: number | null;
}

// The Badge.tsx chips, inlined (that file pulls lib/constants into the
// client bundle). Alpha suffixes: rarity 0.16 → 29, domain 0.18 → 2e.
function Chip({ label, color, alpha, dot }: { label: string; color: string; alpha: string; dot?: boolean }) {
  return (
    <span className="chip data-ink" style={{ backgroundColor: color + alpha, "--data-ink": color } as CSSProperties}>
      {dot && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
      {label}
    </span>
  );
}

const TCG_SEARCH = "https://www.tcgplayer.com/search/riftbound-league-of-legends-trading-card-game/product?q=";

// Enough of CardTileData for the quick view, which fetches the card's prices
// itself (/api/card/[id]); the price columns here are left null on purpose.
function tileOf(r: GuideRowProps): CardTileData {
  return {
    id: r.k,
    slug: r.h.slice("/card/".length),
    name: r.nr,
    domain: r.dr,
    type: r.t,
    rarity: r.rr,
    variant: r.v,
    isPromo: r.pr === 1,
    setCode: r.sc,
    setName: r.s,
    collectorNumber: r.c,
    orientation: null,
    imageUrl: r.i,
    imageThumbUrl: r.i,
    lowestPriceCents: null,
    _count: { retailerPrices: r.st },
  } as CardTileData;
}

export function PriceGuideRows({ rows, showD30, market }: { rows: GuideRowProps[]; showD30: boolean; market: string }) {
  const { open } = useQuickView();
  const onCard = (e: MouseEvent, r: GuideRowProps) => {
    // Modified and middle clicks keep the real link (new tab, copy), exactly as
    // CardQuickLink does; a plain click opens the popup in place.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    open(tileOf(r));
  };
  return (
    <tbody className="divide-y divide-ink-800">
      {rows.map((r, i) => (
        <tr key={r.k}>
          <td className="pg-c1">
            {/* The whole cell is the link: the name, the set and the
                collector number, so every anchor is distinct (two
                printings of one card never share link text) and the
                tap target is the full row height on a phone. */}
            <Link href={r.h} prefetch={false} onClick={(e) => onCard(e, r)} className="pg-a">
              {r.i ? (
                // One 320w rendition, no srcSet: a 28px thumbnail is ≤84
                // device pixels even at 3x.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.i} alt="" aria-hidden="true" width={28} height={39} loading="lazy" decoding="async" className="pg-i" />
              ) : (
                <span aria-hidden="true" className="pg-i" />
              )}
              <span className="pg-b">
                <span className="pg-nm">{r.n}</span>
                <span className="pg-sub">
                  <span className="truncate">
                    {r.s} · <span className="num">{r.c}</span>
                  </span>
                  {/* Below 2xl the Rarity column is hidden, so the chip rides here. */}
                  <span className="shrink-0 2xl:hidden">
                    <Chip label={r.r} color={r.rc} alpha="29" />
                  </span>
                </span>
              </span>
            </Link>
          </td>
          <td className="pg-x2">
            <Chip label={r.r} color={r.rc} alpha="29" />
          </td>
          <td className="pg-x2">
            <span className="pg-sub">
              <Chip label={r.d} color={r.dc} alpha="2e" dot />
              <span className="truncate text-slate-400" title={`${r.d} ${r.t}`}>
                {r.t}
              </span>
            </span>
          </td>
          <td className="num pg-p">
            {r.p != null ? <b className="text-white">{r.p}</b> : <PriceGuideChange pct={null} label="Not in stock" />}
            {/* Below md the 7-day column is hidden, so a move rides
                under the price (and nothing, rather than a second dash,
                when there is none yet). */}
            {r.w != null && (
              <span className="pg-pc">
                <PriceGuideChange pct={r.w} />
              </span>
            )}
          </td>
          <td className="pg-g pg-sm">
            <OutboundLink
              href={affiliateUrl(TCG_SEARCH + encodeURIComponent(r.q), "tcgplayer", "/price-guide")}
              retailer="tcgplayer"
              country={market}
              pageType="price_guide"
              surface="price_guide_tcgplayer"
              cardId={r.k}
              cardName={r.n}
              positionInList={i + 1}
              className="btn-ghost pg-btn"
            >
              <span className="font-extrabold">TCGplayer</span>{" "}
              <span className="num font-semibold">{r.g ?? "Search"}</span>
            </OutboundLink>
          </td>
          <td className="pg-g">
            <OutboundLink
              href={ebaySearchUrl(market, riftboundEbayQuery(r.q), "price-guide")}
              retailer="ebay_search"
              country={market}
              pageType="price_guide"
              surface="price_guide_ebay"
              cardId={r.k}
              cardName={r.n}
              positionInList={i + 1}
              className="btn-ebay-ghost pg-btn"
            >
              <span className="font-extrabold">eBay</span>{" "}
              <span className="num font-semibold">{r.e ?? "Search"}</span>
            </OutboundLink>
          </td>
          <td className="num pg-n pg-md">
            <PriceGuideChange pct={r.w} />
          </td>
          {showD30 && (
            <td className="num pg-n pg-x2">
              <PriceGuideChange pct={r.m} />
            </td>
          )}
          <td className="num pg-s pg-x2">{r.st > 0 ? r.st : <span className="text-slate-600">—</span>}</td>
        </tr>
      ))}
    </tbody>
  );
}
