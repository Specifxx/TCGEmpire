"use client";

import type { ReactNode } from "react";
import { track } from "@vercel/analytics";
import { outboundRel } from "@/lib/affiliate";
import { gaEvent } from "@/lib/ga-events";

// An outbound "buy" link. Used to also fire a click beacon (to /api/click) for
// eBay retailer keys so click counts could be verified in our own DB — that
// beacon has been turned off (it wrote a row per click to the already
// egress-strained history DB; see /api/click/route.ts, which is now a no-op
// kept only so any stale cached page still calling it doesn't 404/error). The
// link itself stays a normal direct <a> — keeping eBay's affiliate attribution
// clean and adding zero redirect latency.
//
// Vercel Analytics' track() replaces that old beacon for click VOLUME
// visibility: it's a client-side pageview-adjacent event with no server
// round-trip and no database write, so it doesn't reintroduce the egress
// problem the beacon was turned off to fix. This is the single most
// commercially meaningful event on the site — it's the buy click every
// affiliate/marketplace dollar depends on.
//
// GA4 `store_click` (added alongside track() above, not instead of it — these
// are two separate products with two separate audiences: Vercel Analytics for
// quick click-volume glances, GA4 for everything that needs funnels/segments/
// key-event conversion tracking). This is the fix for the homepage-rebuild
// brief's core measurement finding: GA4 defines a "bounce" as a session under
// 10s with no key event and <2 pageviews, and an outbound retailer click is
// NOT a pageview — so today, a visitor who lands, searches, and clicks straight
// through to the cheapest store in eight seconds is recorded as a bounce, even
// though that is the best possible outcome this site can produce. Marking
// store_click as a GA4 key event (a manual admin-UI step — see DECISIONS.md
// for the exact click path) turns that session from "bounced" into "engaged".
//
// The five extra props below are all OPTIONAL and additive on purpose: every
// existing call site across the codebase (TodaysTopDeals, PartnersStrip,
// EbayPicksLive, card-detail buy buttons, the marketplace, etc. — 20+ files)
// keeps compiling and behaving unchanged without passing any of them. Only
// wire the richer params in a call site once you're already touching it for
// other reasons; an omitted prop just means that field is absent from the
// event, which is expected and fine — GA4 events don't require a fixed shape.
//
// `transport_type: 'beacon'` (not a hand-rolled navigator.sendBeacon call to
// GA4's collect endpoint) is gtag.js's own documented mechanism for exactly
// this situation — an event fired right as the page is about to unload via a
// real navigation. gtag.js already knows how to serialize a hit for its own
// endpoint (measurement protocol version, client/session ids, consent state,
// etc.); reimplementing that by hand to call sendBeacon directly would mean
// keeping a second, unofficial copy of that payload format in sync with
// Google's, for no benefit — the built-in param uses sendBeacon internally
// when available and a synchronous fallback otherwise. Verified in this phase
// (see DECISIONS.md) that with transport_type set, the beacon request is
// visible in the network panel and fires before the browser navigates away.
export function OutboundLink({
  href,
  retailer,
  country,
  kind = "single",
  className,
  children,
  cardId,
  cardName,
  price,
  positionInList,
  pageType,
}: {
  href: string;
  retailer: string;
  country: string;
  kind?: "single" | "sealed";
  className?: string;
  children: ReactNode;
  /** Card's id/slug, when this link is attached to a specific priced card. */
  cardId?: string;
  /** Card's display name, when known — lets the GA4 report read card_name
   *  directly instead of joining back to card_id. */
  cardName?: string;
  /** The price (in the visitor's display currency, major units — e.g. 4.20,
   *  not cents) shown next to this specific link, when known. */
  price?: number;
  /** 1-based rank of this link within whatever list it's rendered in (a top-
   *  deals row, a store-price table, search suggestions, etc.), when known. */
  positionInList?: number;
  /** What kind of page this click happened on (e.g. "homepage", "card_detail",
   *  "deals", "sealed") — lets the GA4 report segment store_click by origin
   *  without joining back to page_location. */
  pageType?: string;
}) {
  function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    track("buy_click", { retailer, country, kind });
    gaEvent("store_click", {
      card_id: cardId,
      card_name: cardName,
      store: retailer,
      market: country,
      price,
      position_in_list: positionInList,
      page_type: pageType,
      transport_type: "beacon",
    });
    // Inside the native app, open retailer links in the system browser so the user
    // leaves our WebView (and can come back), instead of getting stuck on the
    // store's site. On the web this branch never runs — it's a normal link.
    const cap = (window as any).Capacitor;
    if (cap?.isNativePlatform?.()) {
      e.preventDefault();
      import("@capacitor/browser")
        .then(({ Browser }) => Browser.open({ url: href }))
        .catch(() => window.open(href, "_blank"));
    }
  }
  return (
    <a
      href={href}
      target="_blank"
      rel={outboundRel(href)}
      className={className}
      onClick={onClick}
    >
      {children}
    </a>
  );
}
