import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Fewer Google ads on a phone (2026-10-16, owner: "reduce the impact of ads on
// a mobile phone … especially on a homepage … you can't really even set up a
// cart"). Below 1024px: no ad intents anywhere, and no Google ads at all on the
// six market homepages, Best Basket and the deck builder. Desktop is unchanged.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

type AdsWin = {
  location: { pathname: string };
  matchMedia?: (q: string) => { matches: boolean };
  adsbygoogle?: unknown[] & { pauseAdRequests?: number };
};

const viewport = (width: number) => (q: string) => {
  const max = Number(/max-width:\s*(\d+)px/.exec(q)?.[1]);
  return { matches: width <= max };
};

async function boot(pathname: string, width: number | null, cookie = "") {
  const { AD_FREE_BOOT_SCRIPT } = await import("../src/lib/ad-free-boot");
  const attrs: Record<string, string> = {};
  const window: AdsWin = { location: { pathname }, ...(width === null ? {} : { matchMedia: viewport(width) }) };
  const document = { cookie, documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } };
  new Function("window", "document", AD_FREE_BOOT_SCRIPT)(window, document);
  return { attrs, paused: window.adsbygoogle?.pauseAdRequests };
}

const PHONE_FREE = ["/", "/au", "/uk", "/sg", "/ca", "/eu", "/tools/best-basket", "/tools/best-basket/x", "/deck"];
const PHONE_ADS = ["/card/x", "/blog/x", "/browse", "/au/x", "/decks", "/decks/x", "/tools/box-ev", "/tools/best-baskets", "/sets/radiance"];

test("on a phone the boot script pauses Google ads on the homepages and list builders, and nowhere else", async () => {
  for (const p of PHONE_FREE) {
    assert.deepEqual(await boot(p, 390), { attrs: {}, paused: 1 }, `${p} at 390px: paused, <html> unmarked`);
    assert.deepEqual(await boot(p, 1023), { attrs: {}, paused: 1 }, `${p} at 1023px (the mobile layout): paused`);
  }
  for (const p of PHONE_ADS) {
    assert.deepEqual(await boot(p, 390), { attrs: {}, paused: undefined }, `${p} at 390px keeps its ads`);
  }
});

test("desktop is unchanged, and so is a browser without matchMedia", async () => {
  for (const p of PHONE_FREE) {
    assert.deepEqual(await boot(p, 1024), { attrs: {}, paused: undefined }, `${p} at 1024px keeps its ads`);
    assert.deepEqual(await boot(p, null), { attrs: {}, paused: undefined }, `${p} with no matchMedia`);
  }
  // The arcade and the member hint still win at every width.
  assert.equal((await boot("/games/pack-sim", 1440)).paused, 1);
  assert.equal((await boot("/card/x", 1440, "rc_adfree=1")).paused, 1);
});

test("a client navigation on a phone re-decides the pause the same way", async () => {
  const { syncAdPause, isMobileAdFreeRoute } = await import("../src/lib/ad-free-boot");
  const g = globalThis as unknown as { window?: unknown; document?: unknown };
  const had = { window: g.window, document: g.document };
  const w: Omit<AdsWin, "location"> = { matchMedia: viewport(390) };
  g.window = w;
  g.document = { cookie: "" };
  try {
    syncAdPause("/");
    assert.equal(w.adsbygoogle?.pauseAdRequests, 1, "phone homepage");
    syncAdPause("/card/x");
    assert.equal(w.adsbygoogle?.pauseAdRequests, 0, "a card page on a phone keeps its ads");
    syncAdPause("/tools/best-basket");
    assert.equal(w.adsbygoogle?.pauseAdRequests, 1, "Best Basket on a phone");
    w.matchMedia = viewport(1440);
    syncAdPause("/");
    assert.equal(w.adsbygoogle?.pauseAdRequests, 0, "desktop homepage keeps its ads");
  } finally {
    g.window = had.window;
    g.document = had.document;
  }
  for (const p of PHONE_FREE) assert.ok(isMobileAdFreeRoute(p), p);
  for (const p of PHONE_ADS) assert.ok(!isMobileAdFreeRoute(p), p);
});

test("ad intents are off on a phone: google-anno-skip on <body>, first thing in it", async () => {
  const { MOBILE_AD_INTENTS_SCRIPT, AD_INTENTS_SKIP_CLASS } = await import("../src/lib/ad-free-boot");
  assert.equal(AD_INTENTS_SKIP_CLASS, "google-anno-skip", "Google's documented opt-out class");
  const fakeBody = () => {
    const set = new Set<string>();
    return { set, classList: { add: (c: string) => set.add(c), contains: (c: string) => set.has(c) } };
  };
  const run = (width: number | null) => {
    const body = fakeBody();
    const window = width === null ? {} : { matchMedia: viewport(width) };
    new Function("window", "document", MOBILE_AD_INTENTS_SCRIPT)(window, { body, documentElement: {} });
    return [...body.set];
  };
  assert.deepEqual(run(390), ["google-anno-skip"]);
  assert.deepEqual(run(1023), ["google-anno-skip"]);
  assert.deepEqual(run(1024), [], "desktop keeps ad intents");
  assert.deepEqual(run(null), []);
  assert.doesNotThrow(() => new Function("window", "document", MOBILE_AD_INTENTS_SCRIPT)({}, {}));

  // A failed hydration re-renders the root and resets <body>'s class: the
  // observer puts the opt-out back, on that <body> or on a replacement.
  const observed: { target: unknown; opts: unknown }[] = [];
  let callback: () => void = () => {};
  class FakeObserver {
    constructor(cb: () => void) {
      callback = cb;
    }
    observe(target: unknown, opts: unknown) {
      observed.push({ target, opts });
    }
  }
  const document = { body: fakeBody(), documentElement: { tag: "html" } };
  new Function("window", "document", MOBILE_AD_INTENTS_SCRIPT)({ matchMedia: viewport(390), MutationObserver: FakeObserver }, document);
  assert.deepEqual(observed.map((o) => o.opts), [{ childList: true }, { attributes: true, attributeFilter: ["class"] }]);
  assert.equal(observed[0].target, document.documentElement);
  document.body.set.clear();
  callback();
  assert.ok(document.body.set.has("google-anno-skip"), "re-added after React resets the class");
  document.body = fakeBody();
  callback();
  assert.ok(document.body.set.has("google-anno-skip"), "and on a replacement <body>");

  const layout = read("src/app/layout.tsx");
  const body = layout.indexOf("<body ");
  assert.match(layout.slice(body, body + 120), /^<body className="[^"]*" suppressHydrationWarning>/);
  const firstChild = layout.slice(layout.indexOf(">", body) + 1).replace(/\s*\{\/\*[\s\S]*?\*\/\}\s*/g, "").trimStart();
  assert.ok(firstChild.startsWith("<script dangerouslySetInnerHTML={{ __html: MOBILE_AD_INTENTS_SCRIPT }} />"), "first child of <body>");
});

test("the loader stays ungated: phones are paused, never stripped of the loader or consent message", () => {
  const layout = read("src/app/layout.tsx");
  assert.ok(layout.indexOf("__html: AD_FREE_BOOT_SCRIPT") < layout.indexOf("<AdSenseLoader />"));
  assert.match(read("src/components/AdSenseLoader.tsx"), /return <script async src=\{ADSENSE_LOADER_SRC\} crossOrigin="anonymous" \/>;/);
});
