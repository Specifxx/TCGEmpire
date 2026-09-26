// "Tell me when this set lands" — the set-level release alert (2026-09-26).
//
// Signed up on every Radiance post, /radiance-preorders and every Radiance card
// page (components/ReleaseAlertSignup). Stored in SetReleaseAlert — a new alert
// TYPE, deliberately not a PriceAlert (see the schema comment). At most TWO
// emails per address and set, ever:
//
//  1. SINGLES — once singles of the set have a store price in the subscriber's
//     market. A card-page signup (scope = that card's id) waits for THAT card;
//     a set-wide one for any single of the set. Prices are the importer's
//     per-market cheapest-price columns (the card tiles' figure), read once per
//     run for the whole set.
//  2. RESTOCK — once a pre-order product of the set that every tracked store
//     showed SOLD OUT (lib/sealed-offers soldOutEverywhere, fresh reads only)
//     has an open offer again. Only while the set is still unreleased. The
//     "was sold out" memory is a Counter row per product and market, written
//     only when that state flips.
//
// Honest by construction: every email states a fact true at send time (a count
// of priced singles, the named card's price, the named product back in stock)
// and never a prediction. Sends are capped per run (RELEASE_ALERT_SEND_CAP) on
// the shared transactional quota; the rest go out on the next run, twice a day.

import { SITE_URL } from "./site";
import { COUNTRIES, type Country } from "./country";
import { formatMoney } from "./format";

export const RELEASE_ALERT_SEND_CAP = 40;

export type ReleaseAlertSource = "article" | "preorders" | "card" | "card_unlisted";
export const RELEASE_ALERT_SOURCES: readonly ReleaseAlertSource[] = ["article", "preorders", "card", "card_unlisted"];

export interface ReleaseAlertRow {
  id: string;
  email: string;
  scope: string; // "set" or a Card.id
  market: string;
  unsubToken: string;
  singlesNotifiedAt: Date | null;
  restockNotifiedAt: Date | null;
}

export interface SinglesFacts {
  /** Singles of the set with a store price, per market. */
  pricedCount: Partial<Record<Country, number>>;
  /** Card id → { name, href, price per market } for card-scoped rows. */
  cards: Record<string, { name: string; href: string; price: Partial<Record<Country, number | null>> }>;
}

export interface SinglesNotice {
  kind: "singles";
  market: Country;
  pricedCount: number;
  /** Set when a card-page signup's own card is now priced. */
  card: { name: string; href: string; priceCents: number } | null;
}

export interface RestockNotice {
  kind: "restock";
  market: Country;
  products: string[];
}

const asCountry = (m: string): Country => (m in COUNTRIES ? (m as Country) : "US");

/** Which untold rows the singles fact now covers, one notice per row. Pure. */
export function singlesNotices(rows: ReleaseAlertRow[], facts: SinglesFacts): Map<string, SinglesNotice> {
  const out = new Map<string, SinglesNotice>();
  for (const r of rows) {
    if (r.singlesNotifiedAt) continue;
    const market = asCountry(r.market);
    const pricedCount = facts.pricedCount[market] ?? 0;
    if (r.scope === "set") {
      if (pricedCount > 0) out.set(r.id, { kind: "singles", market, pricedCount, card: null });
      continue;
    }
    const c = facts.cards[r.scope];
    const price = c?.price[market];
    if (c && price != null) out.set(r.id, { kind: "singles", market, pricedCount, card: { name: c.name, href: c.href, priceCents: price } });
  }
  return out;
}

export type OfferState = "soldout" | "open" | "other";

/**
 * Restock transitions for one market. `prevSoldOut` holds the product keys the
 * last run saw sold out everywhere. Returns the products that restocked (were
 * sold out, now open), and the Counter keys to set and to clear. Pure.
 */
export function restockTransitions(
  products: { key: string; state: OfferState }[],
  prevSoldOut: ReadonlySet<string>,
): { restocked: string[]; markSoldOut: string[]; clear: string[] } {
  const restocked: string[] = [];
  const markSoldOut: string[] = [];
  const clear: string[] = [];
  for (const p of products) {
    if (p.state === "soldout" && !prevSoldOut.has(p.key)) markSoldOut.push(p.key);
    if (p.state === "open" && prevSoldOut.has(p.key)) {
      restocked.push(p.key);
      clear.push(p.key);
    }
  }
  return { restocked, markSoldOut, clear };
}

/** One email per ADDRESS per event, even when an address has several rows (set + cards). */
export function groupByEmail<T extends { email: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) m.set(r.email, [...(m.get(r.email) ?? []), r]);
  return m;
}

export const releaseCounterKey = (setCode: string, market: Country, groupKey: string) =>
  `release-soldout:${setCode}:${market}:${groupKey}`;

// ── Email ────────────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function releaseStopUrl(token: string): string {
  return `${SITE_URL}/alerts/release?token=${encodeURIComponent(token)}`;
}
export function releaseOneClickUrl(token: string): string {
  return `${SITE_URL}/api/alerts/release/unsubscribe?token=${encodeURIComponent(token)}`;
}

export interface BuiltReleaseEmail {
  subject: string;
  heading: string;
  lines: string[]; // plain sentences, already true
  cta: { label: string; url: string };
}

export function buildReleaseEmail(
  setName: string,
  setPath: string,
  notices: (SinglesNotice | RestockNotice)[],
): BuiltReleaseEmail {
  const singles = notices.find((n): n is SinglesNotice => n.kind === "singles");
  const restock = notices.find((n): n is RestockNotice => n.kind === "restock");
  const lines: string[] = [];
  if (singles) {
    const place = COUNTRIES[singles.market].place;
    if (singles.card) {
      lines.push(
        `${singles.card.name} now has a store price in ${place}: ${formatMoney(singles.card.priceCents, COUNTRIES[singles.market].currency)} is the cheapest we track right now.`,
      );
    }
    if (singles.pricedCount > 0) {
      lines.push(
        `${singles.pricedCount} ${setName} single${singles.pricedCount === 1 ? " has" : "s have"} a store price in ${place} so far.`,
      );
    }
  }
  if (restock) {
    const names = restock.products.slice(0, 5);
    lines.push(
      `Back in stock for pre-order in ${COUNTRIES[restock.market].place}: ${names.join(", ")}${restock.products.length > names.length ? ` and ${restock.products.length - names.length} more` : ""}.`,
    );
  }
  const subject = singles?.card
    ? `${singles.card.name} is listed`
    : singles
      ? `${setName} singles have store prices`
      : `${setName} pre-orders are back in stock`;
  const cta = singles?.card
    ? { label: `Compare ${singles.card.name} prices`, url: `${SITE_URL}${singles.card.href}` }
    : restock && !singles
      ? { label: `See ${setName} pre-orders`, url: `${SITE_URL}/radiance-preorders` }
      : { label: `See ${setName} prices`, url: `${SITE_URL}${setPath}` };
  return { subject, heading: subject, lines, cta };
}

export function renderReleaseEmailHtml(e: BuiltReleaseEmail, token: string, shell: (h: string, inner: string, footer: string, pre?: string) => string): string {
  const inner =
    e.lines.map((l) => `<tr><td style="padding:6px 32px;font-size:15px;line-height:1.55;color:#d6dbe3">${esc(l)}</td></tr>`).join("") +
    `<tr><td style="padding:14px 32px 8px"><a href="${esc(e.cta.url)}" style="display:inline-block;background:#34d17e;color:#06210f;font-size:15px;font-weight:700;text-decoration:none;padding:10px 18px;border-radius:10px">${esc(e.cta.label)}</a></td></tr>`;
  const footer = `<tr><td style="padding:18px 32px 26px;font-size:12px;line-height:1.5;color:#7d8796">You asked us to email you about this release. This alert sends at most two emails. <a href="${esc(releaseStopUrl(token))}" style="color:#9aa4b2">Unsubscribe</a></td></tr>`;
  return shell(esc(e.heading), inner, footer, e.lines[0]);
}

export function renderReleaseEmailText(e: BuiltReleaseEmail, token: string): string {
  return [e.heading, "", ...e.lines, "", `${e.cta.label}: ${e.cta.url}`, "", `Unsubscribe: ${releaseStopUrl(token)}`].join("\n");
}
