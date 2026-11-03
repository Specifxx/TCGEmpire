// The "Cheapest on eBay" list as an RSS feed (DECISIONS.md, "eBay deals feed",
// 2026-10-27): the Deal Finder's free tab, one feed per market, for feed readers
// and for the auto-posters (Telegram, Discord webhooks, IFTTT) that watch a feed.
//
// Items link to OUR card page, never straight to eBay: a feed is read and
// re-posted where we can't put the "paid link" line beside it, and EPN forbids
// sending a reader to eBay through anything but a disclosed link. The card page
// carries the tagged eBay link with its disclosure.
//
// Pure: the route passes in the ranking it read (getCheapestOnEbayPage).
import { COUNTRIES, type Country } from "./country";
import { formatMoney } from "./format";
import type { CheapestOnEbayItem } from "./arbitrage";

export const EBAY_FEED_PATH = "/feeds/ebay-deals.xml";
export const EBAY_FEED_SIZE = 25;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function ebayFeedUrl(siteUrl: string, country: Country): string {
  return `${siteUrl}${EBAY_FEED_PATH}${country === "US" ? "" : `?market=${country}`}`;
}

export function buildEbayDealsFeed(siteUrl: string, country: Country, items: readonly CheapestOnEbayItem[], now = new Date()): string {
  const c = COUNTRIES[country];
  const day = now.toISOString().slice(0, 10);
  const body = items
    .filter((it) => it.card.slug)
    .map((it) => {
      const link = `${siteUrl}/card/${it.card.slug}?utm_source=rss&utm_medium=ebay-deals`;
      const price = formatMoney(it.ebayCents, c.currency);
      const store = formatMoney(it.storeCents, c.currency);
      const gap = formatMoney(it.gapCents, c.currency);
      const title = `${it.card.name} (${it.card.setCode} ${it.card.collectorNumber}): ${price} on eBay, ${gap} under every store`;
      const desc = `Cheapest eBay listing in ${c.place}: ${price}${it.postageKnown ? " delivered" : " plus postage"}. Cheapest store we track: ${store} (item price). Open the card to compare every store before buying.`;
      // A new guid when the price changes, so readers show a real new deal, not a stale one.
      const guid = `rc-ebay-${country}-${it.card.id}-${it.ebayCents}`;
      return `    <item>
      <title>${esc(title)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="false">${guid}</guid>
      <pubDate>${new Date(`${day}T00:00:00Z`).toUTCString()}</pubDate>
      <description>${esc(desc)}</description>
    </item>`;
    })
    .join("\n");
  const self = ebayFeedUrl(siteUrl, country);
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(`Riftbound cards cheapest on eBay (${c.label}) | RiftCompare`)}</title>
    <link>${siteUrl}/tools/deal-finder?view=ebay</link>
    <atom:link href="${esc(self)}" rel="self" type="application/rss+xml"/>
    <description>${esc(`Riftbound cards whose cheapest eBay listing in ${c.place} costs less than every store RiftCompare tracks, ranked by how much less. Updated daily.`)}</description>
    <language>${c.locale.toLowerCase()}</language>
    <ttl>360</ttl>
    <lastBuildDate>${now.toUTCString()}</lastBuildDate>
${body}
  </channel>
</rss>`;
}
