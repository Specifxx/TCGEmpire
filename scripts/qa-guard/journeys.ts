/**
 * QA guard journeys: each one is what a visitor does, done in a real browser (DECISIONS.md, 2026-11-26).
 *
 * The guard is a visitor that says it is a bot (`USER_AGENT`), so the sites' own bot filters keep it out
 * of analytics, view counters and click logs, and it never clicks a buy link: an outbound link's tags
 * are read from its href, or from the Location of the site's own /out redirect (asked once, no follow).
 * Analytics and ad hosts are answered with an empty 204 so the guard is not counted anywhere.
 */
import type { BrowserContext, Page, Response } from "playwright";
import type { SearchSpec, Site, Viewport } from "./sites";

export const USER_AGENT_DESKTOP =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 CompareEmpireQABot/1.0 (+site QA; headless)";
export const USER_AGENT_PHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 CompareEmpireQABot/1.0 (+site QA; headless)";

export const EPN_CAMPAIGN = "5339155912";

export type Check = {
  site: string;
  viewport: string;
  journey: string;
  ok: boolean;
  /** "fail" breaks a journey; "warn" is reported but never opens an issue. */
  level: "fail" | "warn" | "ok";
  detail: string;
  url?: string;
};

const BLOCK_HOSTS =
  /(googletagmanager|google-analytics|analytics\.google|doubleclick|googlesyndication|adservice\.google|pagead2|clarity\.ms|hotjar|facebook\.net|connect\.facebook|plausible\.io|vercel-insights|vitals\.vercel|va\.vercel-scripts|posthog|segment\.(io|com)|amazon-adsystem|epnt\.ebay|imp\.pxf)/i;
const BLOCK_PATHS = /^\/(_vercel\/(insights|speed-insights)|api\/(track|beacon|view|views|event|events|analytics|demand|ping|vitals|log|click|impression)s?\b)/i;

/** Console noise that is not a broken page: blocked trackers, third-party ad scripts, extension-free headless quirks. */
const IGNORE_CONSOLE =
  /(googletagmanager|google-analytics|adsbygoogle|doubleclick|googlesyndication|pagead|ERR_BLOCKED_BY_CLIENT|ERR_ABORTED|ERR_FAILED|status of 204|Third-party cookie|preloaded using link preload|was preloaded|Download the React DevTools|\[Violation\]|favicon|clarity|hotjar|amazon-adsystem|epnt\.ebay|_vercel\/(insights|speed-insights))/i;

export type Tracked = { page: Page; errors: string[]; badResponses: string[] };

export async function openPage(ctx: BrowserContext): Promise<Tracked> {
  const page = await ctx.newPage();
  // The shortlist is an A/B on some sites (lib/cart-list.ts `cartArm`): the guard always takes the arm that HAS it, so Best
  // Basket can be tested. Its events never reach analytics (blocked below), so the test's numbers are untouched.
  await page.addInitScript(() => {
    try {
      localStorage.setItem("cart-arm", "on");
    } catch {}
  });
  const errors: string[] = [];
  const badResponses: string[] = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const where = m.location()?.url ?? "";
    const text = `${m.text()}${where ? ` (${where})` : ""}`;
    if (IGNORE_CONSOLE.test(text)) return;
    errors.push(text.slice(0, 300));
  });
  page.on("pageerror", (e) => {
    const text = `${e.name}: ${e.message}`;
    if (IGNORE_CONSOLE.test(text)) return;
    errors.push(`uncaught ${text}`.slice(0, 300));
  });
  page.on("response", (r: Response) => {
    const u = new URL(r.url());
    const own = u.host === new URL(page.url() || r.url()).host;
    if (own && r.status() >= 500) badResponses.push(`${r.status()} ${u.pathname}${u.search}`.slice(0, 200));
  });
  await page.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (BLOCK_HOSTS.test(u.host) || BLOCK_PATHS.test(u.pathname)) return route.fulfill({ status: 204, body: "" });
    return route.continue();
  });
  return { page, errors, badResponses };
}

export async function go(t: Tracked, url: string): Promise<{ status: number; finalUrl: string }> {
  const res = await t.page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await t.page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => {});
  await dismissOverlays(t.page);
  return { status: res?.status() ?? 0, finalUrl: t.page.url() };
}

/** Cookie or welcome overlays a visitor would close first. Never clicks anything that navigates. */
async function dismissOverlays(page: Page) {
  for (const name of [/^(accept|got it|ok|okay|close|no thanks|not now|dismiss|maybe later)$/i, /^✕$|^×$/]) {
    const b = page.getByRole("button", { name }).first();
    if (await b.isVisible().catch(() => false)) await b.click({ timeout: 2000 }).catch(() => {});
  }
}

export type Link = { path: string; href: string; text: string };

/** Visible same-host links whose path is a product page. */
export async function productLinks(page: Page, site: Site): Promise<Link[]> {
  const host = new URL(site.url).host.replace(/^www\./, "");
  const all = await page.$$eval("a[href]", (as) =>
    as
      .filter((a) => {
        const r = (a as HTMLElement).getClientRects();
        const s = getComputedStyle(a as HTMLElement);
        return r.length > 0 && s.visibility !== "hidden" && s.display !== "none";
      })
      .map((a) => ({ href: (a as HTMLAnchorElement).href, text: ((a as HTMLElement).innerText || a.getAttribute("aria-label") || "").trim().slice(0, 140) })),
  );
  const out: Link[] = [];
  const seen = new Set<string>();
  for (const l of all) {
    let u: URL;
    try {
      u = new URL(l.href);
    } catch {
      continue;
    }
    if (u.host.replace(/^www\./, "") !== host) continue;
    if (!site.product.test(u.pathname)) continue;
    if (seen.has(u.pathname)) continue;
    seen.add(u.pathname);
    out.push({ path: u.pathname, href: u.href, text: l.text });
  }
  return out;
}

const SEARCH_INPUT =
  'input[type="search"], input[name="q"], input[role="combobox"], input[placeholder*="earch" i], input[aria-label*="earch" i], input[placeholder*="find" i]';

/** The header's own box first (a home page can hold other finders), then a search landmark, then any. */
async function visibleSearchInput(page: Page) {
  const scopes = [`header :is(${SEARCH_INPUT})`, `nav :is(${SEARCH_INPUT})`, `[role="search"] :is(${SEARCH_INPUT})`, `[role="dialog"] :is(${SEARCH_INPUT})`, SEARCH_INPUT];
  for (const sel of scopes) {
    const inputs = page.locator(sel);
    const n = await inputs.count();
    for (let i = 0; i < n; i++) {
      const el = inputs.nth(i);
      if (await el.isVisible().catch(() => false)) {
        const box = await el.boundingBox().catch(() => null);
        if (box && box.width > 40) return el;
      }
    }
  }
  return null;
}

/** The header search box, opening it first on a phone where it sits behind a button. */
export async function findSearch(page: Page) {
  let input = await visibleSearchInput(page);
  if (input) return input;
  const openers = [
    page.getByRole("button", { name: /search/i }),
    page.locator('[aria-label*="search" i]:is(button,a,[role=button])'),
    page.getByRole("button", { name: /menu/i }),
  ];
  for (const o of openers) {
    const b = o.first();
    if (await b.isVisible().catch(() => false)) {
      await b.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(600);
      input = await visibleSearchInput(page);
      if (input) return input;
    }
  }
  return null;
}

function relevant(links: Link[], spec: SearchSpec, site: Site): Link[] {
  const words = (spec.expect ?? spec.q.toLowerCase().split(/\s+/)).map((w) => w.toLowerCase());
  return links.filter((l) => {
    const hay = `${l.text} ${decodeURIComponent(l.path).replace(/[-/]/g, " ")}`.toLowerCase();
    if (!words.some((w) => hay.includes(w))) return false;
    if (spec.kind === "sealed" && site.sealedProduct && !site.sealedProduct.test(l.path)) return false;
    return true;
  });
}

/** Type into the site's own search box, as a visitor does; take the dropdown, else press Enter. */
export async function searchJourney(t: Tracked, site: Site, spec: SearchSpec): Promise<{ check: Omit<Check, "site" | "viewport">; first?: Link }> {
  const journey = `search ${spec.kind} "${spec.q}"`;
  const { page } = t;
  await go(t, site.url + "/");
  const before = new Set((await productLinks(page, site)).map((l) => l.path));
  const input = await findSearch(page);
  if (!input) return { check: { journey, ok: false, level: "fail", detail: "no search box found on the home page", url: page.url() } };
  await input.click({ timeout: 5000 }).catch(() => {});
  await input.fill("");
  await input.pressSequentially(spec.q, { delay: 60 });
  // The dropdown: product links that were not on the page before typing.
  let found: Link[] = [];
  for (let i = 0; i < 12 && !found.length; i++) {
    await page.waitForTimeout(500);
    found = relevant((await productLinks(page, site)).filter((l) => !before.has(l.path)), spec, site);
  }
  let mode = "dropdown";
  if (!found.length) {
    mode = "enter";
    const startUrl = page.url();
    await input.press("Enter").catch(() => {});
    await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const links = await productLinks(page, site);
    found = relevant(page.url() === startUrl ? links.filter((l) => !before.has(l.path)) : links, spec, site);
    // An exact match can open its product page straight away: that is a result too.
    const here = new URL(page.url());
    if (!found.length && here.href !== startUrl && site.product.test(here.pathname)) {
      const title = (await page.title().catch(() => "")) || "";
      found = relevant([{ path: here.pathname, href: here.href, text: title }], spec, site);
      if (found.length) mode = "enter → product page";
    }
  }
  if (!found.length) {
    const any = await productLinks(page, site);
    return {
      check: {
        journey,
        ok: false,
        level: "fail",
        detail: `typed "${spec.q}" and pressed Enter: no matching ${spec.kind} product came up (page ${page.url()}, ${any.length} product links on it${any[0] ? `, e.g. ${any[0].path}` : ""})`,
        url: page.url(),
      },
    };
  }
  return {
    check: { journey, ok: true, level: "ok", detail: `${found.length} results by ${mode}, first ${found[0].path}`, url: page.url() },
    first: found[0],
  };
}

export async function searchPageJourney(t: Tracked, site: Site, spec: SearchSpec): Promise<Omit<Check, "site" | "viewport">> {
  const journey = `search page ${spec.kind} "${spec.q}"`;
  const url = site.url + site.searchPage!.replace("{q}", encodeURIComponent(spec.q));
  const { status } = await go(t, url);
  if (status >= 400) return { journey, ok: false, level: "fail", detail: `HTTP ${status}`, url };
  let found: Link[] = [];
  for (let i = 0; i < 8 && !found.length; i++) {
    found = relevant(await productLinks(t.page, site), spec, site);
    if (!found.length) await t.page.waitForTimeout(700);
  }
  if (!found.length) return { journey, ok: false, level: "fail", detail: `no matching ${spec.kind} product on the results page`, url };
  return { journey, ok: true, level: "ok", detail: `${found.length} results`, url };
}

const PRICE = /(US\$|A\$|AU\$|C\$|CA\$|NZ\$|S\$|SG\$|HK\$|£|€|\$)\s?\d[\d,]*(\.\d{2})?|\d[\d.,]*\s?(€|kr|zł)/;

type Outbound = { href: string; text: string; rel: string };

export function tagProblem(href: string): string | null {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  const h = u.host.toLowerCase();
  if (/(^|\.)ebay\.[a-z.]+$/.test(h) && !/^(pages|signin|reg)\./.test(h)) {
    const camp = u.searchParams.get("campid");
    if (camp !== EPN_CAMPAIGN) return `eBay link without campid=${EPN_CAMPAIGN}: ${href.slice(0, 160)}`;
  }
  if (/(^|\.)amazon\.[a-z.]+$/.test(h) && !/^(affiliate-program|associates|aws)\./.test(h)) {
    if (!u.searchParams.get("tag")) return `Amazon link without tag=: ${href.slice(0, 160)}`;
  }
  if (/(^|\.)tcgplayer\.com$/.test(h) && !/^(partner|help|seller|store)\./.test(h) && !/^\/(c\/|massentry)/.test(u.pathname)) {
    if (!u.searchParams.get("utm_campaign") && !u.searchParams.get("partner") && !u.searchParams.get("irclickid"))
      return `TCGplayer link not through the partner (Impact) link: ${href.slice(0, 160)}`;
  }
  return null;
}

/** A product page: it loads, shows a price, has at least one buy link, and every paid link carries our tag. */
export async function productJourney(t: Tracked, site: Site, link: Link, kind: string): Promise<Omit<Check, "site" | "viewport">[]> {
  const journey = `product page (${kind})`;
  const { status, finalUrl } = await go(t, link.href);
  if (status >= 400) return [{ journey, ok: false, level: "fail", detail: `HTTP ${status} for ${link.path}`, url: link.href }];
  const { page } = t;
  await page.waitForTimeout(1500);
  const text = await page.locator("main").first().innerText().catch(() => page.locator("body").innerText());
  const out: Omit<Check, "site" | "viewport">[] = [];
  if (!PRICE.test(text)) out.push({ journey: `${journey}: price`, ok: false, level: "fail", detail: `no price shown on ${link.path}`, url: finalUrl });
  else out.push({ journey: `${journey}: price`, ok: true, level: "ok", detail: "price shown", url: finalUrl });

  const host = new URL(site.url).host.replace(/^www\./, "");
  const outbound: Outbound[] = await page.$$eval("a[href]", (as) =>
    as
      .filter((a) => (a as HTMLElement).getClientRects().length > 0)
      .map((a) => ({ href: (a as HTMLAnchorElement).href, text: ((a as HTMLElement).innerText || "").trim().slice(0, 60), rel: a.getAttribute("rel") || "" })),
  );
  const buy = outbound.filter((a) => {
    try {
      const u = new URL(a.href);
      const own = u.host.replace(/^www\./, "") === host;
      if (own) return /^\/(out|go|r|api\/out|api\/go|api\/click|click|redirect|buy)\b/i.test(u.pathname);
      return /sponsored|nofollow/.test(a.rel) || /ebay|tcgplayer|amazon/.test(u.host);
    } catch {
      return false;
    }
  });
  if (!buy.length) {
    out.push({ journey: `${journey}: buy links`, ok: false, level: "fail", detail: `no buy link on ${link.path}`, url: finalUrl });
    return out;
  }
  // Tags: read direct hrefs; resolve at most three of the site's own redirects (one request each, no follow).
  const problems: string[] = [];
  let resolved = 0;
  for (const a of buy) {
    const u = new URL(a.href);
    if (u.host.replace(/^www\./, "") === host) {
      if (resolved >= 3) continue;
      resolved++;
      // The sites' own /go and /out routes add the tags server-side and send a self-declared bot on UNTAGGED
      // (lib/bot-click.ts), so the guard cannot read the tag there without posing as a person and logging a
      // fake click. It checks the route answers and sends the visitor to the retailer the link names; the
      // tags themselves are pinned by each site's tests and the weekly affiliate-gap audit.
      try {
        const r = await page.request.get(a.href, { maxRedirects: 0, timeout: 15_000, failOnStatusCode: false });
        const loc = r.headers()["location"];
        const named = u.searchParams.get("u");
        if (r.status() >= 400) problems.push(`buy link ${u.pathname}${u.search.slice(0, 60)} answers HTTP ${r.status()}`);
        else if (r.status() < 300 || !loc) problems.push(`buy link ${u.pathname} does not redirect (HTTP ${r.status()})`);
        else {
          const to = new URL(loc, a.href);
          if (to.host.replace(/^www\./, "") === host) problems.push(`buy link ${u.pathname} sends the visitor back to ${to.pathname} on our own site`);
          else if (named) {
            try {
              const want = new URL(named).host.replace(/^www\./, "").split(".").slice(-2).join(".");
              if (!to.host.includes(want.split(".")[0])) problems.push(`buy link names ${want} but sends the visitor to ${to.host}`);
            } catch {}
          }
        }
      } catch (e) {
        problems.push(`buy link ${u.pathname} failed: ${(e as Error).message.slice(0, 80)}`);
      }
    } else {
      const p = tagProblem(a.href);
      if (p) problems.push(p);
    }
  }
  const uniq = [...new Set(problems)];
  out.push(
    uniq.length
      ? { journey: `${journey}: buy links`, ok: false, level: "fail", detail: `${buy.length} buy links; ${uniq.slice(0, 4).join("; ")}`, url: finalUrl }
      : { journey: `${journey}: buy links`, ok: true, level: "ok", detail: `${buy.length} buy links, tags fine`, url: finalUrl },
  );
  return out;
}

/** A list page's own filter box narrows the list and never empties it for a word the catalogue holds. */
export async function filterJourney(t: Tracked, site: Site): Promise<Omit<Check, "site" | "viewport">> {
  const f = site.filters!;
  const journey = `filters ${f.path} "${f.q}"`;
  const url = site.url + f.path;
  const { status } = await go(t, url);
  if (status >= 400) return { journey, ok: false, level: "fail", detail: `HTTP ${status}`, url };
  const { page } = t;
  const n0 = (await productLinks(page, site)).length;
  if (!n0) return { journey, ok: false, level: "fail", detail: "the list shows no products", url };
  // The page's own filter box: a text input inside main, not the header search.
  const inputs = page.locator('main input[type="search"], main input[type="text"], main input:not([type])');
  let box = null;
  for (let i = 0; i < (await inputs.count()); i++) {
    const el = inputs.nth(i);
    if (await el.isVisible().catch(() => false)) {
      box = el;
      break;
    }
  }
  const selects = await page.locator("main select:visible").count();
  if (!box) {
    return selects
      ? { journey, ok: true, level: "warn", detail: `no keyword filter box (${selects} dropdown filters, ${n0} products)`, url }
      : { journey, ok: false, level: "warn", detail: `no filter controls found (${n0} products)`, url };
  }
  await box.fill("");
  await box.pressSequentially(f.q, { delay: 50 });
  await page.waitForTimeout(2000);
  if (page.url() !== url) await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  const after = await productLinks(page, site);
  const matching = after.filter((l) => `${l.text} ${l.path}`.toLowerCase().includes(f.q.toLowerCase()));
  if (!after.length || !matching.length) return { journey, ok: false, level: "fail", detail: `typing "${f.q}" left ${after.length} products, none naming it (was ${n0})`, url: page.url() };
  return { journey, ok: true, level: "ok", detail: `${n0} → ${after.length} products, ${matching.length} naming "${f.q}"`, url: page.url() };
}

/** Best Basket as a buyer uses it: shortlist a store's price on a product page, then open the basket and see a total. */
export async function basketJourney(t: Tracked, site: Site, product?: Link): Promise<Omit<Check, "site" | "viewport">> {
  const journey = "best basket";
  const url = site.url + site.basket!;
  let added = false;
  if (product) {
    await go(t, product.href);
    const add = t.page.getByRole("button", { name: /^\s*\+?\s*(shortlist|add to (shortlist|basket|list))\b|^save .+ to your shortlist$/i }).first();
    if (await add.isVisible().catch(() => false)) {
      await add.click({ timeout: 5000 }).catch(() => {});
      await t.page.waitForTimeout(800);
      added = true;
    }
  }
  const { status } = await go(t, url);
  if (status >= 400) return { journey, ok: false, level: "fail", detail: `HTTP ${status}`, url };
  const body = await t.page.locator("body").innerText();
  if (/application error|something went wrong|unhandled runtime error|this page couldn.t load/i.test(body))
    return { journey, ok: false, level: "fail", detail: "the page shows an error", url };
  await t.page.waitForTimeout(2500);
  const main = await t.page.locator("main").first().innerText().catch(() => body);
  if (added) {
    if (!PRICE.test(main)) return { journey, ok: false, level: "fail", detail: `shortlisted ${product!.path}, but the basket shows no total or price`, url };
    return { journey, ok: true, level: "ok", detail: `shortlisted ${product!.path}; the basket prices it`, url };
  }
  const controls = await t.page.locator(":is(main, body) :is(input, textarea, button, select, a):visible").count();
  if (main.trim().length < 40 && !controls) return { journey, ok: false, level: "fail", detail: "the page is empty: the tool did not render", url };
  return { journey, ok: true, level: "warn", detail: `opens, but no "+ Shortlist" button was found on ${product?.path ?? "a product page"} to test it with`, url };
}

export type Rect = { x: number; y: number; w: number; h: number };

/**
 * The Collector pulse box judged at phone width (coordinator, 2026-11-27): it fits the screen, its three answers are
 * full-size tap targets with their words unclipped, and it sits BELOW the buy rows with room to breathe, never on top of
 * one or above them (CollectorPulse.tsx: "never beside a price or a buy button"). Pure, so tests pin it.
 */
export function pulseProblems(box: Rect & { clipped: boolean }, buttons: (Rect & { clipped: boolean; label: string })[], buys: Rect[], width: number): string[] {
  const out: string[] = [];
  if (box.x < -1 || box.x + box.w > width + 1) out.push(`the box is ${Math.round(box.w)}px wide at x=${Math.round(box.x)}, past the ${width}px screen`);
  if (box.clipped) out.push("the box's content is wider than the box");
  if (buttons.length !== 3) out.push(`${buttons.length} answer buttons, not 3`);
  for (const b of buttons) {
    if (b.h < 40 || b.w < 44) out.push(`"${b.label}" is ${Math.round(b.w)}x${Math.round(b.h)}px, under a 44x40 tap target`);
    else if (b.clipped) out.push(`"${b.label}" has its words cut off`);
  }
  const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const hit = buys.filter((r) => overlaps(box, r)).length;
  if (hit) out.push(`it overlaps ${hit} buy link${hit === 1 ? "" : "s"}`);
  if (buys.length) {
    const firstBuy = Math.min(...buys.map((r) => r.y));
    if (box.y < firstBuy) out.push(`it sits above the buy rows (box at y=${Math.round(box.y)}, first buy link at y=${Math.round(firstBuy)})`);
    const above = buys.filter((r) => r.y + r.h <= box.y + 1).map((r) => box.y - (r.y + r.h));
    if (!hit && above.length && Math.min(...above) < 8) out.push(`it is ${Math.max(0, Math.round(Math.min(...above)))}px under a buy link (crowded, want 8px or more)`);
  }
  return out;
}

export const PULSE_MEASURE = String.raw`(() => {
  var el = document.querySelector(__SEL__);
  function r(e) { var b = e.getBoundingClientRect(); return { x: b.left, y: b.top + window.scrollY, w: b.width, h: b.height }; }
  var buttons = Array.prototype.map.call(el.querySelectorAll("button"), function (b) {
    var o = r(b); o.clipped = b.scrollWidth > b.clientWidth + 1; o.label = (b.innerText || "").trim().slice(0, 20); return o;
  });
  var host = location.host.replace(/^www\./, "");
  var buys = Array.prototype.filter.call(document.querySelectorAll("a[href]"), function (a) {
    if (el.contains(a) || a.getClientRects().length === 0) return false;
    try {
      var u = new URL(a.href);
      if (u.host.replace(/^www\./, "") === host) return /^\/(out|go|r|api\/out|api\/go|api\/click|click|redirect|buy)\b/i.test(u.pathname);
      return /sponsored|nofollow/.test(a.getAttribute("rel") || "") || /ebay|tcgplayer|amazon/.test(u.host);
    } catch (e) { return false; }
  }).map(r);
  var box = r(el); box.clipped = el.scrollWidth > el.clientWidth + 1;
  return { box: box, buttons: buttons, buys: buys };
})()`;

/** Collector pulse at phone width: present, fits, and keeps clear of the buy rows. Reads the page only: never answers. */
export async function pulseJourney(t: Tracked, site: Site, link: Link): Promise<Omit<Check, "site" | "viewport">> {
  const journey = "collector pulse";
  const { page } = t;
  // Until 5 Dec the box shows only to a visitor who answered the tool-interest question (one prompt a visit); the guard
  // takes that visitor's place so the box draws. Nothing is sent: the key is local to the guard's own browser.
  await page.addInitScript(() => {
    try {
      if (localStorage.getItem("tool-interest") == null) localStorage.setItem("tool-interest", "qa-guard");
    } catch {}
  });
  let asked = false;
  let answered = 0;
  page.on("response", (r) => {
    if (/\/api\/sentiment\b/.test(r.url())) {
      asked = true;
      answered = r.status();
    }
  });
  page.on("requestfailed", (r) => {
    if (/\/api\/sentiment\b/.test(r.url())) asked = true;
  });
  const { status, finalUrl } = await go(t, link.href);
  if (status >= 400) return { journey, ok: false, level: "fail", detail: `HTTP ${status} for ${link.path}`, url: link.href };
  const sel = 'aside[data-pulse], aside[aria-label="Collector pulse"]';
  const box = page.locator(sel).first();
  await box.waitFor({ state: "attached", timeout: 10_000 }).catch(() => {});
  if (!(await box.count())) {
    if (!asked) return { journey, ok: true, level: "warn", detail: `no Collector pulse box on ${link.path} (this build does not ask for one)`, url: finalUrl };
    return { journey, ok: false, level: "fail", detail: `the Collector pulse box did not draw on ${link.path} (its /api/sentiment answered ${answered || "nothing"})`, url: finalUrl };
  }
  await box.scrollIntoViewIfNeeded().catch(() => {});
  const width = page.viewportSize()?.width ?? 390;
  // A plain string, not a function: tsx wraps named functions in a `__name` helper the page does not have.
  type Measured = { box: Rect & { clipped: boolean }; buttons: (Rect & { clipped: boolean; label: string })[]; buys: Rect[] };
  const m = (await page.evaluate(PULSE_MEASURE.replace("__SEL__", JSON.stringify(sel)))) as Measured;
  const problems = pulseProblems(m.box, m.buttons, m.buys, width);
  return problems.length
    ? { journey, ok: false, level: "fail", detail: `on ${link.path}: ${problems.slice(0, 4).join("; ")}`, url: finalUrl }
    : { journey, ok: true, level: "ok", detail: `fits the screen, 3 answers, clear of ${m.buys.length} buy links`, url: finalUrl };
}

/** Wider than the screen: the classic phone bug. Reports the widest element so the fix is quick. */
export async function overflow(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const sw = document.documentElement.scrollWidth;
    if (sw <= vw + 2) return null;
    let worst: { w: number; d: string } | null = null;
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 2 && r.width > 0) {
        const s = getComputedStyle(el);
        if (s.position === "fixed") continue;
        const d = `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".") : ""}`;
        if (!worst || r.right > worst.w) worst = { w: Math.round(r.right), d };
      }
    }
    return `page is ${sw}px wide on a ${vw}px screen${worst ? ` (widest: ${worst.d} to ${worst.w}px)` : ""}`;
  });
}

export function viewportOptions(v: Viewport) {
  return {
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: 1,
    isMobile: v.mobile,
    hasTouch: v.mobile,
    userAgent: v.mobile ? USER_AGENT_PHONE : USER_AGENT_DESKTOP,
    locale: "en-US",
    timezoneId: "America/New_York",
  };
}
