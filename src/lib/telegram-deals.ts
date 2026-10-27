// The daily Telegram deals post (DECISIONS.md, "Telegram deals channel",
// 2026-10-27). scripts/telegram-deals.ts reads the live eBay deals feed
// (/feeds/ebay-deals.xml, lib/ebay-deals-feed.ts) and posts its top cards to the
// owner's channel once a day. Links go to our card pages, like the feed's: a
// channel post is re-shared where we cannot put a paid-link line beside it, so
// it carries no affiliate link of its own. No database, no secrets in here.

export interface FeedDeal {
  title: string;
  link: string;
}

const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const htmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The feed's items, in order. Tolerant: an item without a title or an https link is skipped. */
export function parseFeedDeals(xml: string): FeedDeal[] {
  const out: FeedDeal[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const title = /<title>([\s\S]*?)<\/title>/.exec(m[1])?.[1];
    const link = /<link>([\s\S]*?)<\/link>/.exec(m[1])?.[1];
    if (!title || !link) continue;
    const url = unesc(link.trim());
    if (!/^https:\/\//.test(url)) continue;
    out.push({ title: unesc(title.trim()), link: url.replace("utm_source=rss", "utm_source=telegram") });
  }
  return out;
}

export const TELEGRAM_DEALS_TAKE = 5;

/** One HTML-formatted Telegram message, or null when there is nothing to post. */
export function telegramDealsMessage(deals: readonly FeedDeal[], placeLabel: string, siteUrl: string): string | null {
  const top = deals.slice(0, TELEGRAM_DEALS_TAKE);
  if (!top.length) return null;
  return [
    `<b>Riftbound cards cheapest on eBay today (${htmlEsc(placeLabel)})</b>`,
    "",
    ...top.map((d, i) => `${i + 1}. <a href="${htmlEsc(d.link)}">${htmlEsc(d.title)}</a>`),
    "",
    `Every store compared, and the whole list: <a href="${htmlEsc(`${siteUrl}/tools/deal-finder?view=ebay&utm_source=telegram`)}">RiftCompare Deal Finder</a>`,
  ].join("\n");
}
