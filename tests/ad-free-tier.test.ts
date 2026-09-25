import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { TIER_COMPARISON } from "../src/components/TierComparisonTable";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

// ─────────────────────────────────────────────────────────────────────────────
// AD-FREE IS ON EVERY PAID TIER — Plus included (2026-09-25). See DECISIONS.md,
// "Plus is ad-free again" and "Premium lineup: fewer tools, each one worth
// paying for".
//
// History: ad-free moved from Plus to Premium on 2026-09-14, to give the $9.99
// tier a broad reason to exist (nobody who had bought Plus lost it:
// premiumTierFloor raised them at read time, scripts/grandfather-plus-adfree.ts).
// With the half-price intro, Plus is the entry tier and "no ads on any page" is
// its headline, so ad-free is back on both paid tiers and every surface that
// describes Plus must say so.
//
// `premium` and `adFree` stay DIFFERENT flags even though they agree today:
// `isPremium(user)` (min "plus") gates the Plus-level features, and `adFree`
// is what the ad placements read, so the ad-free line can move again in
// /api/me alone without touching a single placement.
// ─────────────────────────────────────────────────────────────────────────────
test("the tier table says ad-free is on both paid tiers", () => {
  const row = TIER_COMPARISON.find((r) => r.feature === "Ad-free experience");
  assert.ok(row, "expected an Ad-free experience row — the feature string is matched verbatim by DIALOG_OMIT_FEATURES and by three other tests");
  assert.equal(row!.account, false);
  assert.equal(row!.plus, true, "Plus includes ad-free again");
  assert.equal(row!.premium, true);
});

test("the ad components gate on adFree, which is computed at the plus minimum", () => {
  const me = code("src/app/api/me/route.ts");
  assert.match(me, /adFree: isPremium\(user\)/, "/api/me must publish adFree for every paid tier");
  assert.match(me, /premium: isPremium\(user\)/, "`premium` must stay at the default (plus) minimum — other gates depend on it");

  const useMe = code("src/lib/use-me.ts");
  assert.match(useMe, /adFree: boolean/, "the Me type must carry adFree");
  assert.match(useMe, /adFree: !!d\.adFree/, "fetchMe must map it");

  const provider = code("src/components/PremiumProvider.tsx");
  assert.match(provider, /const \{ adFree(, [a-z]+)* \} = useMe\(\)/, "the ad provider must read adFree, not premium");
  assert.doesNotMatch(provider, /\bpremium\b[^,}]*\} = useMe/, "…and not premium");
  assert.ok(!/const \{ premium \} = useMe\(\)/.test(provider), "reading `premium` here would give ad-free back to every Plus account");
});

test("both paid tiers' feature lists sell ad-free, and Plus LEADS with it", () => {
  const cards = code("src/components/PremiumPricingCards.tsx");
  const plusList = cards.slice(cards.indexOf("const PLUS_FEATURES"), cards.indexOf("const PREMIUM_FEATURES_ON_PLUS"));
  // 2026-09-25 lineup: "No ads on any page" is Plus's first bullet, the benefit
  // a first-time payer understands without a tour.
  assert.match(plusList, /const PLUS_FEATURES = \[\s*"No ads on any page",/, "PLUS_FEATURES must lead with ad-free");
  const premiumLists = cards.slice(cards.indexOf("const PREMIUM_FEATURES_ON_PLUS"), cards.indexOf("function FreeCard"));
  const onPlus = premiumLists.slice(0, premiumLists.indexOf("const PREMIUM_FEATURES_STANDALONE"));
  const standalone = premiumLists.slice(premiumLists.indexOf("const PREMIUM_FEATURES_STANDALONE"));
  assert.match(onPlus, /no ads/i, "Premium-on-Plus must say it keeps Plus's ad-free");
  assert.match(standalone, /No ads on any page/, "standalone Premium must advertise ad-free");
  assert.ok(!/Premium adds an ad-free site/.test(code("src/app/premium/page.tsx")), "/premium must not sell ad-free as Premium-only");
});

// ─────────────────────────────────────────────────────────────────────────────
// NO SURFACE MAY SELL AD-FREE AS PREMIUM-ONLY (2026-09-25). The /premium
// caption said "Premium adds no ads" for a day after Plus went ad-free again,
// because each surface was checked by hand. This sweeps every component and
// page, the articles and the email templates, with comments stripped (the
// history of the 09-14 move is recorded in comments on purpose).
// ─────────────────────────────────────────────────────────────────────────────
const PREMIUM_ONLY_AD_FREE = /Premium adds (no ads|an ad-free|ad-free)|ad-free for Premium/i;

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...tsxFiles(rel));
    else if (entry.name.endsWith(".tsx")) out.push(rel);
  }
  return out;
}

test("nothing sells ad-free as a Premium-only benefit", () => {
  const files = [...tsxFiles("src"), "src/lib/articles.ts", "src/lib/email.ts"];
  assert.ok(files.length > 100, `fixture check: expected the whole src tree, found ${files.length} files`);
  const offenders = files.filter((f) => PREMIUM_ONLY_AD_FREE.test(code(f)));
  assert.deepEqual(offenders, [], `these files say ad-free is Premium-only: ${offenders.join(", ")}`);
  // The regex must actually catch the shapes it was written for.
  for (const bad of ["Premium adds no ads", "Premium adds an ad-free site", "Premium adds ad-free browsing", "ad-free for Premium members"]) {
    assert.match(bad, PREMIUM_ONLY_AD_FREE, bad);
  }
});

test("the ad placements that leaked to paying members now read adFree", () => {
  // The card page's eBay carousel is labelled "Ad" and rendered for everyone;
  // a Plus buyer's first card page showed it (2026-09-25).
  const carousel = code("src/components/EbayAdCarouselLive.tsx");
  assert.match(carousel, /const adFree = usePremium\(\)/, "the carousel must read the ad-free flag");
  assert.match(carousel, /if \(adFree \|\| items\.length === 0\) \{/, "an ad-free viewer gets the plain buy-path");
  const fallbackAt = carousel.indexOf("if (adFree || items.length === 0) {");
  assert.match(carousel.slice(fallbackAt, fallbackAt + 400), /<EbayBuyCta /, "…the non-ad EbayBuyCta, as EbayPicksLive does");
  assert.doesNotMatch(read("src/components/EbayBuyCta.tsx"), /Ad ·/, "the fallback CTA itself carries no 'Ad' label");

  // The native app's AdMob banner was shown unconditionally.
  const shell = code("src/components/NativeShell.tsx");
  const meAt = shell.indexOf("await fetchMe()");
  const showAt = shell.indexOf("AdMob.showBanner(");
  assert.ok(meAt > 0 && showAt > meAt, "the session must be read before the banner is shown");
  assert.match(shell.slice(meAt, showAt), /if \(me\.adFree\) \{[\s\S]*?return;/, "an ad-free viewer never gets the banner");
  assert.match(shell, /AdMob\.hideBanner\(\)/, "a banner left from before sign-in is taken down");
  assert.match(shell, /ME_INVALIDATED_EVENT/, "and it comes down when the session changes in place (a purchase activating)");
  assert.match(code("src/lib/use-me.ts"), /window\.dispatchEvent\(new Event\(ME_INVALIDATED_EVENT\)\)/);
});

test("the grandfather script is idempotent, floors rather than rewrites the billed tier, and prints no PII", () => {
  const src = read("scripts/grandfather-plus-adfree.ts");
  assert.match(src, /premiumTierFloor: "premium"/, "must set the floor, not premiumTier — billing keeps writing the real tier");
  assert.ok(!/premiumTier:/.test(src.replace(/premiumTier: true/g, "")), "must never write premiumTier itself");
  assert.match(src, /effectiveTier\(u\) === "plus"/, "must decide who is on Plus with the same helper the runtime uses");
  assert.match(src, /APPLY === "1"/, "must be report-only by default");
  // Comment-stripped: the script's own comment explains that it prints no
  // emails, and that sentence must not read as the thing it forbids.
  const body = code("scripts/grandfather-plus-adfree.ts").split("async function main")[1] ?? "";
  assert.ok(body.length > 0, "fixture check: expected a main()");
  assert.ok(!/email/i.test(body), "must not select or print emails — this runs in collaborator-visible CI logs");
});

test("the funnel report never writes, and resolves its connection the approved way", () => {
  const src = read("scripts/funnel-report.ts");
  for (const forbidden of [/prisma\.[a-zA-Z]+\.create/, /prisma\.[a-zA-Z]+\.update/, /prisma\.[a-zA-Z]+\.upsert/, /prisma\.[a-zA-Z]+\.delete/, /\$executeRaw/]) {
    assert.ok(!forbidden.test(src), `the report must never write (${forbidden})`);
  }
  assert.ok(!/subscriptions\.(update|cancel|create)/.test(src), "must never mutate Stripe");
  assert.match(src, /from "\.\.\/src\/lib\/db"/, "must go through lib/db (which resolves via db-chains), never a hand-rolled connection string");
  // One definition of "currently paying", shared with the admin page.
  assert.match(src, /isActive/, "must reuse subscription-metrics' isActive rather than restating which statuses count");
  assert.match(read("src/lib/subscription-metrics.ts"), /export function isActive/, "isActive must be exported for that reuse");
  // The caveats are the point — a number read without them is misleading.
  for (const caveat of [/3 -> 14 days/, /past_due/, /premium_cta/, /2026-08-20\.\.22/]) {
    assert.match(src, caveat, `the report must print its own caveat (${caveat})`);
  }
});

test("both maintenance tasks are registered and runnable", () => {
  const wf = read(".github/workflows/maintenance.yml");
  for (const task of ["funnel-report", "grandfather-plus-adfree"]) {
    assert.ok(wf.includes(`          - ${task}`), `${task} must be in the task choice list`);
    assert.match(wf, new RegExp(`if: inputs\\.task == '${task}'`), `${task} must have a step that runs on it`);
    assert.match(wf, new RegExp(`scripts/${task}\\.ts`), `${task} must invoke its script`);
  }
  // The write-capable one must be gated behind the same dry_run input every
  // other writing task uses, not run unconditionally.
  const grandfatherStep = wf.slice(wf.indexOf("if: inputs.task == 'grandfather-plus-adfree'"));
  assert.match(grandfatherStep.slice(0, 400), /inputs\.dry_run/, "the write half must respect the dry_run input");
});

// ── Ad-free from the first byte (review + QA, 2026-09-25) ────────────────────
// The AdSense loader must stay ungated, so Auto ads — once switched on after
// approval — would fill for paid members; and adFree resolves only after
// /api/me, so the HTML a member got carried the site's own placements. The
// rc_adfree hint cookie + an inline boot script close both (lib/ad-free-boot.ts).

test("the ad-free boot script pauses AdSense and marks <html> for a hinted member, and does nothing otherwise", async () => {
  const { AD_FREE_BOOT_SCRIPT, AD_FREE_ATTR } = await import("../src/lib/ad-free-boot");
  const run = (cookie: string) => {
    const attrs: Record<string, string> = {};
    const window: { adsbygoogle?: unknown[] & { pauseAdRequests?: number } } = {};
    const document = { cookie, documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) } };
    new Function("window", "document", AD_FREE_BOOT_SCRIPT)(window, document);
    return { attrs, paused: window.adsbygoogle?.pauseAdRequests };
  };
  assert.deepEqual(run("theme=light; rc_adfree=1"), { attrs: { [AD_FREE_ATTR]: "1" }, paused: 1 });
  assert.deepEqual(run("rc_adfree=1"), { attrs: { [AD_FREE_ATTR]: "1" }, paused: 1 });
  assert.deepEqual(run("theme=dark"), { attrs: {}, paused: undefined }, "no hint: the loader runs untouched");
  assert.deepEqual(run("xrc_adfree=1; rc_adfree=0"), { attrs: {}, paused: undefined });
});

test("the boot script runs before the (still ungated) AdSense loader, and the hint follows adFree", () => {
  const layout = code("src/app/layout.tsx");
  const boot = layout.indexOf("__html: AD_FREE_BOOT_SCRIPT");
  const loader = layout.indexOf("<AdSenseLoader />");
  assert.ok(boot > 0 && loader > boot, "inline boot script before the loader");
  assert.match(code("src/components/AdSenseLoader.tsx"), /return <script async src=\{ADSENSE_LOADER_SRC\}/, "the loader itself is not gated");
  const provider = code("src/components/PremiumProvider.tsx");
  assert.match(provider, /const \{ adFree, loaded, answered \} = useMe\(\);/, "reads adFree, not premium");
  assert.match(provider, /if \(loaded && answered\) syncAdFree\(adFree\);/, "only a real /api/me answer writes or clears the hint");
  assert.match(read("src/lib/use-me.ts"), /r\.ok \? r\.json\(\)\.then\(\(d\) => \(\{ \.\.\.d, answered: true \}\)\) : EMPTY_ME/);
});

test("every site ad placement is hidden under the hint until React takes over", () => {
  assert.match(read("src/app/globals.css"), /:root\[data-adfree\] \[data-ad-placement\] \{\s*display: none !important;/);
  for (const f of ["AdSlot", "EbayAd", "TcgplayerAd", "EbayPicksLive", "FooterAds", "EbayAdCarouselLive"]) {
    assert.match(read(`src/components/${f}.tsx`), /data-ad-placement=""/, `${f} is marked`);
  }
});
