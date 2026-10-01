"use client";

import { useCountry } from "../CountryProvider";
import { OutboundLink } from "../OutboundLink";
import { CheckedAgo } from "../CheckedAgo";
import { AffiliateDisclosure, PaidLinkTag } from "../AffiliateDisclosure";
import { COUNTRIES } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { gbpCentsToEur } from "@/lib/fx";
import { offerStock, offerStockLabel } from "@/lib/sealed-offers";
import type { PkBoard } from "@/lib/pokemon/types";

// One market's Pokémon price board: the comparison, the references beneath it,
// and an eBay search that is always there. Shared by the quick view and the
// product page, so the two can never describe a product differently.
//
// Everything arrives built (hrefs included) from lib/pokemon/board.ts on the
// server. This only formats: in the visitor's own market through useCountry's
// fmt, which honours the UK "show in EUR" preference like every Riftbound price.
export function PokemonBoardView({
  board,
  preorder,
  pageType,
  surface,
}: {
  board: PkBoard;
  preorder: boolean;
  pageType: string;
  surface: "modal" | "table";
}) {
  // Formatted from the board's OWN currency. The provider's fmt() follows its
  // `currency` state, which for a UK visitor with no recorded preference stays
  // on the default market's USD until the geo lookup answers, and printed
  // pounds as "US$". Only the UK euro preference is taken from it.
  const { isEurDisplay } = useCountry();
  const eur = board.market === "UK" && isEurDisplay;
  const money = (cents: number) => (eur ? formatMoney(gbpCentsToEur(cents), "EUR") : formatMoney(cents, board.currency));
  const place = COUNTRIES[board.market].place;
  const best = board.headline;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 px-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Price comparison · {place}</h3>
        <span className="text-[11px] text-slate-500">cheapest first, item price</span>
      </div>

      {board.listings.length === 0 ? (
        <p className="rounded-lg border border-ink-800 bg-ink-950/40 px-3 py-4 text-sm text-slate-400">
          No listing we track in {place} for this one yet. eBay below is the quickest place to look.
        </p>
      ) : (
        <ul className="divide-y divide-ink-800">
          {board.listings.map((l) => {
            const state = offerStock(l);
            const open = state === "open";
            const isBest = l === best;
            const ebay = l.source === "ebay";
            return (
              <li key={l.source} data-stock={state} className={`flex items-center gap-3 py-2.5 ${open ? "" : "opacity-55"}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 truncate text-sm font-semibold text-white">
                    <span className={ebay ? "text-sky-300" : undefined}>{l.label}</span>
                  </div>
                  <div className="text-[11px] text-slate-500">{l.basis}</div>
                  <div className="flex flex-wrap items-center gap-x-2 text-[11px]">
                    <span className={open ? "text-brand-400" : "text-slate-500"}>● {offerStockLabel(state, preorder)}</span>
                    <CheckedAgo iso={l.lastSeen} className="text-slate-500" />
                  </div>
                </div>
                {isBest && <span className="chip shrink-0 bg-brand-500/15 text-brand-300">Cheapest</span>}
                <div className="text-right">
                  <div className={`num text-sm font-bold ${isBest ? "text-accent" : "text-white"} ${open ? "" : "text-slate-500 line-through"}`}>
                    {money(l.priceCents)}
                  </div>
                  {ebay && (
                    <div className="text-[10px] text-slate-500">
                      {l.shippingCents == null ? "+ postage" : l.shippingCents === 0 ? "free postage" : `+ ${money(l.shippingCents)} postage`}
                    </div>
                  )}
                </div>
                <OutboundLink
                  href={l.href}
                  retailer={l.retailer}
                  country={board.market}
                  kind="sealed"
                  pageType={pageType}
                  surface={surface}
                  price={l.priceCents / 100}
                  inStock={open}
                  className={
                    open
                      ? `px-3 py-1.5 text-xs ${ebay ? "btn-ebay" : isBest ? "btn-accent" : "btn-primary"}`
                      : "px-3 py-1.5 text-xs text-slate-500 underline-offset-2 hover:underline"
                  }
                >
                  View →
                </OutboundLink>
              </li>
            );
          })}
        </ul>
      )}

      {/* The search claims no price and no stock: it is a search, beside the list. */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#0064d2]/40 bg-[#0064d2]/10 px-3 py-2.5">
        <span className="flex items-center gap-2 text-xs text-slate-300">
          Every listing on {board.ebaySearch.label.replace(/^Search /, "")}, not just the ones we track
          <PaidLinkTag />
        </span>
        <OutboundLink
          href={board.ebaySearch.href}
          retailer="pkmn_ebay_search"
          country={board.market}
          kind="sealed"
          pageType={pageType}
          surface="ebay_search"
          className="btn-ebay px-3 py-1.5 text-xs"
        >
          {board.ebaySearch.label} →
        </OutboundLink>
      </div>

      {board.references.length > 0 && (
        <div className="mt-3">
          <h3 className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Reference prices</h3>
          <ul className="space-y-1">
            {board.references.map((r) => (
              <li key={r.source} className="flex items-center justify-between gap-3 rounded-md bg-ink-950/40 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="text-slate-200">{r.label}</span>
                  <span className="block text-[11px] text-slate-500">{r.basis}</span>
                </span>
                <span className="num shrink-0 font-semibold text-slate-200">
                  {r.converted ? "≈ " : ""}
                  {money(r.priceCents)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1 px-1 text-[11px] text-slate-500">
            References, not offers: a converted figure uses an approximate exchange rate.
          </p>
        </div>
      )}

      <AffiliateDisclosure partner="both" />
    </div>
  );
}
