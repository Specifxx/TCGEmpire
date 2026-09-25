// The demand counter's two guards (2026-09-25). Card.searchCount / viewCount feed
// Rising Cards (demand 1.0 and velocity 1.4 of its weights), the free "Most
// searched this week" strip on /movers and the eBay refresh priority — and until
// this change the counter was an unauthenticated POST with no limit, so a loop
// of `curl -X POST /api/card/<slug>/view?source=search` could put any card at #1
// on all three.
//
//   • In the browser: each card counts at most once per kind ("view" or
//     "search") per calendar day, per browser — CardViewBeacon, QuickView and
//     SearchBar all send through sendCardView() below.
//   • On the server (/api/card/[id]/view): a per-IP, per-card rate limit, and a
//     silent 204 for crawlers and HTTP libraries, which never count.
//
// Pure apart from sendCardView's fetch/localStorage — which are guarded, since
// storage can throw (Safari private mode, a full quota, disabled cookies) and a
// failure there must never stop the page, only fall back to counting.

export type CardViewKind = "view" | "search";

// Crawlers, link unfurlers, headless browsers and plain HTTP clients. A real
// visitor's beacon comes from a browser's fetch() and carries its user agent;
// an empty one is never a browser.
const BOT_UA =
  /bot|crawl|spider|slurp|mediapartners|facebookexternalhit|embedly|bingpreview|web preview|headless|lighthouse|pagespeed|phantomjs|puppeteer|playwright|selenium|curl\/|wget|python-requests|python-urllib|aiohttp|httpx|go-http-client|okhttp|java\/|node-fetch|^node$|undici|axios|postman|insomnia|scrapy|httpclient|libwww/i;

export function isBotUserAgent(ua: string | null | undefined): boolean {
  const s = (ua ?? "").trim();
  return s === "" || BOT_UA.test(s);
}

// Server-side ceiling per IP per card, across both kinds: a real visit sends at
// most one search and one view for a card (the browser guard), and a few people
// behind one NAT stay well under this. Per-instance memory (lib/rate-limit.ts),
// so a soft cap — but it turns a curl loop from unlimited into a handful.
export const VIEW_RATE_LIMIT = 4;
export const VIEW_RATE_WINDOW_MS = 6 * 60 * 60 * 1000;

const STORAGE_KEY = "rc_card_views";

type Seen = { day: string; keys: string[] };

// The browser's own calendar day, so "once a day" means the visitor's day.
function localDay(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Records `kind` for `cardKey` in `storage` and says whether to send it: true
 * the first time today, false after. One JSON entry that resets when the day
 * changes, so storage never grows past one day's cards. Storage errors (or no
 * storage at all) fail OPEN — the view is sent, and the server-side limit is
 * the backstop.
 */
export function shouldCountCardView(
  cardKey: string,
  kind: CardViewKind,
  storage: Pick<Storage, "getItem" | "setItem"> | null | undefined,
  now = new Date(),
): boolean {
  if (!storage) return true;
  const today = localDay(now);
  const key = `${kind}:${cardKey}`;
  try {
    let seen: Seen = { day: today, keys: [] };
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Seen>;
      if (parsed && parsed.day === today && Array.isArray(parsed.keys)) seen = { day: today, keys: parsed.keys.filter((k) => typeof k === "string") };
    }
    if (seen.keys.includes(key)) return false;
    seen.keys.push(key);
    storage.setItem(STORAGE_KEY, JSON.stringify(seen));
    return true;
  } catch {
    return true;
  }
}

function browserStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * The one way the client records a card view or search pick. `cardKey` should
 * be the card's id where the caller has it (so a QuickView open and a card-page
 * visit of the same card share one daily count); `ref` is what the route
 * resolves (slug or id).
 */
export function sendCardView(ref: string, kind: CardViewKind, cardKey: string = ref): void {
  if (!shouldCountCardView(cardKey, kind, browserStorage())) return;
  const qs = kind === "search" ? "?source=search" : "";
  fetch(`/api/card/${encodeURIComponent(ref)}/view${qs}`, { method: "POST", keepalive: true }).catch(() => {});
}
