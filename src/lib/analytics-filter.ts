// Which Web Analytics events are worth paying for (2026-10-23, DECISIONS.md
// "Web Analytics drops bots, previews and the owner"). Web Analytics bills per
// event; a page view from localhost, a *.vercel.app deployment URL, a headless
// browser, a crawler or the owner's own visits measures nothing a buyer did.
// Pure, so tests/analytics-filter.test.ts can pin it without a browser.

export const OPT_OUT_KEY = "va-disable";

const BOT_UA = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|python-requests|curl|wget|phantomjs|puppeteer|playwright|selenium/i;

export type AnalyticsEnv = { hostname: string; userAgent: string; webdriver: boolean; optedOut: boolean };

export function shouldDropAnalytics(env: AnalyticsEnv): boolean {
  const host = env.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".vercel.app")) return true;
  if (env.webdriver) return true;
  if (BOT_UA.test(env.userAgent)) return true;
  return env.optedOut;
}

/** `?notrack=1` opts this browser out, `?notrack=0` back in; anything else leaves it. */
export function optOutFromQuery(search: string): "1" | "0" | null {
  const v = new URLSearchParams(search).get("notrack");
  return v === "1" || v === "0" ? v : null;
}
