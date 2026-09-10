import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PREMIUM_PRICE_AMOUNT,
  PREMIUM_ANNUAL_AMOUNT,
  premiumEffectiveMonthly,
  premiumFromLine,
  premiumZeroToday,
  premiumCurrencySymbol,
} from "../src/lib/site";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// The 2026-09-08 Premium pricing/conversion pass. See DECISIONS.md for the
// full account: the price ($14.99, since rolled back to $9.99 on 2026-09-09 —
// see that later entry) was held on the evidence at the time, the price
// framing changed from "hidden" to "$0 today, then from $X/mo", live proof
// numbers were added, /premium got an FAQ, and a one-time abandoned-checkout
// recovery email was added.
// ─────────────────────────────────────────────────────────────────────────────

test("premiumEffectiveMonthly() derives the annual per-month rate from the real configured price", () => {
  const expected = `${premiumCurrencySymbol()}${(Number(PREMIUM_ANNUAL_AMOUNT.replace(/[^0-9.]/g, "")) / 12).toFixed(2)}`;
  assert.equal(premiumEffectiveMonthly(), expected);
  // Sanity: with the real, currently-configured $79.99 annual price this is
  // $6.67 — the number the "from $6.67/mo" framing everywhere is built on.
  if (PREMIUM_ANNUAL_AMOUNT === "$79.99") {
    assert.equal(premiumEffectiveMonthly(), "$6.67");
  }
});

test("premiumEffectiveMonthly() falls back to empty when no annual price is configured", () => {
  // Can't unset PREMIUM_ANNUAL_AMOUNT at runtime (it's read once at module
  // load from the environment, same as every other price constant in this
  // file) — so this pins the guard clause in source instead.
  const src = read("src/lib/site.ts");
  const fnAt = src.indexOf("export function premiumEffectiveMonthly");
  assert.ok(fnAt >= 0, "expected premiumEffectiveMonthly to exist");
  assert.match(src.slice(fnAt, fnAt + 300), /if \(!annual\) return "";/, 'must return "" when there is nothing to derive from');
});

test("premiumFromLine() states both the annual and monthly framing together", () => {
  const line = premiumFromLine();
  assert.match(line, /^from \$[\d.]+\/mo billed yearly, or \$[\d.]+\/month month-to-month$/);
  assert.ok(line.includes(premiumEffectiveMonthly()), "must include the derived effective monthly rate");
  assert.ok(line.includes(PREMIUM_PRICE_AMOUNT), "must include the real monthly price");
});

test("premiumZeroToday() carries the real currency symbol, not a hardcoded dollar sign", () => {
  assert.equal(premiumZeroToday(), `${premiumCurrencySymbol()}0 today`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Live value-proof data plumbing.
// ─────────────────────────────────────────────────────────────────────────────

test("getEbayCheapest's result carries a savingsTotalCents aggregate on every return path", () => {
  const src = read("src/lib/arbitrage.ts");
  assert.match(src, /savingsTotalCents: number;/, "EbayDealPage must declare the field");
  const fnAt = src.indexOf("export async function getEbayCheapest");
  assert.ok(fnAt >= 0);
  const body = src.slice(fnAt, src.indexOf("\nexport async function getArbitrage"));
  assert.match(body, /const savingsTotalCents = rows\.reduce/, "must be computed as a real sum over every qualifying row");
  // Every PAGE-LEVEL return statement (the ones carrying `total`) must also
  // carry savingsTotalCents — a missing one would silently ship `undefined`
  // on that path. Narrowed to `total` returns so this doesn't also match the
  // unrelated per-row object built inside the `.map()` callback below.
  const returns = body.match(/return \{[^}]*\btotal\b[^}]*\};/g) ?? [];
  assert.ok(returns.length >= 3, "expected multiple return points to check");
  for (const r of returns) {
    assert.match(r, /savingsTotalCents/, `return statement is missing savingsTotalCents: ${r}`);
  }
});

test("TopDeals carries savingsVsMarketCents, sourced from getEbayCheapest's own aggregate", () => {
  const src = read("src/lib/top-deals.ts");
  assert.match(src, /savingsVsMarketCents: number;/, "TopDeals type must declare the field");
  assert.match(src, /savingsVsMarketCents: savings\.savingsTotalCents/, "must be threaded from the same getEbayCheapest call, not re-derived");
});

test("every reader of savingsVsMarketCents falls back to 0 for a stale cached object", () => {
  // A TopDeals value served from the 1h unstable_cache from before this field
  // existed won't have it for up to an hour after deploy — every read site
  // must tolerate that with `?? 0`, not assume the field is always present.
  const proofRoute = read("src/app/api/premium/proof/route.ts");
  assert.match(proofRoute, /savingsVsMarketCents \?\? 0/, "the proof route must guard the field with ?? 0");
  const premiumPage = read("src/app/premium/page.tsx");
  assert.match(premiumPage, /savingsVsMarketCents \?\? 0/, "/premium must guard the field with ?? 0");
});

test("the proof endpoint validates its country param and sets a long-lived cache header", () => {
  const src = read("src/app/api/premium/proof/route.ts");
  assert.match(src, /normalizeCountry/, "must resolve an arbitrary query param through the real country normaliser, not trust it raw");
  assert.match(src, /s-maxage=3600/, "must be cacheable at the edge for a meaningful duration");
  assert.match(src, /getCachedTopDeals/, "must reuse the shared, already-cached feed rather than computing its own");
});

test("the proof endpoint never throws — it degrades to zeroes", () => {
  const src = read("src/app/api/premium/proof/route.ts");
  assert.match(src, /catch \{/, "expected a catch-all fallback");
  const catchAt = src.indexOf("} catch {");
  assert.match(src.slice(catchAt, catchAt + 300), /deals: 0, savingsCents: 0/, "the catch branch must degrade to zeroes, not rethrow");
});

// ─────────────────────────────────────────────────────────────────────────────
// /premium: FAQ (visible + schema) and proof strip.
// ─────────────────────────────────────────────────────────────────────────────

test("/premium renders an FAQPage via faqPage(), and the same Q&A is rendered visibly", () => {
  const src = read("src/app/premium/page.tsx");
  assert.match(src, /faqPage\(FAQ\)/, "expected the FAQPage schema to be built from the real FAQ array");
  assert.match(src, /FAQ\.map\(/, "the FAQ must also be rendered as real content — Google only honours FAQPage when it matches visible copy");
  const faqMatch = src.match(/const FAQ: \{ q: string; a: string \}\[\] = \[([\s\S]*?)\n\];/);
  assert.ok(faqMatch, "expected a FAQ array declaration");
  const count = (faqMatch![1].match(/q: /g) ?? []).length;
  assert.ok(count >= 4, `expected a real FAQ (>=4 entries), found ${count}`);
});

test("/premium's proof strip hides any tile with nothing to show, and the whole strip if all are empty", () => {
  const src = read("src/app/premium/page.tsx");
  assert.match(src, /proofTiles\.length > 0/, "the strip itself must be conditionally rendered");
  assert.match(src, /savingsVsMarketTotal > 0/, "the deals-count tile must hide at zero");
});

// ─────────────────────────────────────────────────────────────────────────────
// Abandoned-checkout recovery email.
// ─────────────────────────────────────────────────────────────────────────────

test("runCheckoutRecovery targets abandoned checkouts only, excludes current Premium, and is idempotent per account", () => {
  const src = read("src/lib/premium.ts");
  const fnAt = src.indexOf("export async function runCheckoutRecovery");
  assert.ok(fnAt >= 0, "expected runCheckoutRecovery to exist");
  const body = src.slice(fnAt, fnAt + 2600);
  assert.match(body, /source: "checkout"/, "must select on the real checkout-click signal");
  assert.match(body, /checkoutRecoverySentAt: null/, "must exclude accounts already emailed");
  assert.match(body, /OR: \[\{ premiumUntil: null \}, \{ premiumUntil: \{ lt: new Date\(\) \} \}\]/, "must exclude anyone currently Premium");
  assert.match(body, /isAdmin: false/, "must exclude admin accounts");
  // Same idempotency shape as runPremiumTrialReminders: the stamp is written
  // unconditionally, outside the try, with .catch — a lost email must never
  // retry forever.
  assert.match(
    body,
    /await prisma\.user\.update\(\{ where: \{ id: u\.id \}, data: \{ checkoutRecoverySentAt: new Date\(\) \} \}\)\.catch\(\(\) => \{\}\);/,
    "the dedupe stamp must be written outside the try, unconditionally, swallowing its own failure",
  );
});

test("the recovery email is transactional (no unsubscribe link) and states it won't repeat", () => {
  const src = read("src/lib/email.ts");
  const fnAt = src.indexOf("export async function sendCheckoutRecoveryEmail");
  assert.ok(fnAt >= 0, "expected sendCheckoutRecoveryEmail to exist");
  const footerAt = src.indexOf("function checkoutRecoveryFooter");
  assert.ok(footerAt >= 0);
  const footer = src.slice(footerAt, footerAt + 400);
  assert.match(footer, /won't send it again/, "must tell the recipient this is a one-time email");
  assert.doesNotMatch(footer, /unsubscribe/i, "a one-time transactional email tied to the recipient's own action needs no opt-out link");
});

test("the checkout-recovery cron fails CLOSED, not open", () => {
  const src = read("src/app/api/cron/premium-checkout-recovery/route.ts");
  assert.match(src, /if \(!secret\) return false;/, "must fail closed when CRON_SECRET is unset — see premium-trial-reminders/route.ts's own fixed history");
});

test("the checkout-recovery workflow exists, is scheduled, and fails loudly with no CRON_SECRET", () => {
  const src = read(".github/workflows/premium-checkout-recovery.yml");
  assert.match(src, /schedule:/, "must run on a schedule, not only workflow_dispatch");
  assert.match(src, /workflow_dispatch: \{\}/, "must also be manually triggerable, with no inputs (nothing for the flag-polarity test to check)");
  assert.match(src, /::error::No CRON_SECRET secret set/, "must fail loudly rather than silently no-op when misconfigured");
  assert.match(src, /api\/cron\/premium-checkout-recovery/, "must call the real endpoint");
});

test("User.checkoutRecoverySentAt is additive — nullable, no default", () => {
  const src = read("prisma/schema.prisma");
  assert.match(src, /checkoutRecoverySentAt\s+DateTime\?/, "must be nullable so `prisma db push` can add it with no backfill");
});

// ─────────────────────────────────────────────────────────────────────────────
// Instrumentation.
// ─────────────────────────────────────────────────────────────────────────────

test("premium_checkout_started fires from both checkout entry points, before the fetch, and reaches Vercel too", () => {
  const analytics = read("src/lib/analytics.ts");
  const ga4Only = analytics.slice(analytics.indexOf("GA4_ONLY_EVENTS"), analytics.indexOf("export function trackEvent"));
  assert.ok(!ga4Only.includes("premium_checkout_started"), "this is a low-volume funnel step — it must reach Vercel, not GA4-only");

  for (const file of ["src/components/PremiumCta.tsx", "src/components/PremiumDialog.tsx"]) {
    const src = read(file);
    const eventAt = src.indexOf('trackEvent("premium_checkout_started"');
    assert.ok(eventAt >= 0, `expected premium_checkout_started in ${file}`);
    const fetchAt = src.indexOf("fetch(\"/api/premium/checkout\"");
    assert.ok(fetchAt > eventAt, `${file} must fire the event BEFORE starting checkout, not after`);
  }
});

test('"recovery" is a valid premium-click beacon source, both client-side and server-side', () => {
  const analytics = read("src/lib/analytics.ts");
  assert.match(analytics, /"dialog" \| "checkout" \| "premium-page" \| "button" \| "recovery"/, "the client-side type union must include recovery");
  const route = read("src/app/api/premium/click/route.ts");
  assert.match(route, /"recovery"/, "the server-side SOURCES allow-list must include recovery");
});

test("landing on /premium via the recovery email fires the beacon once, then strips the query param", () => {
  const src = read("src/components/PremiumRecoveryBeacon.tsx");
  assert.match(src, /firePremiumClickBeacon\("recovery"\)/);
  assert.match(src, /fired\.current = true/, "must guard against firing twice");
  assert.match(src, /router\.replace/, "must strip the param so a refresh/bookmark can't re-fire it");

  const page = read("src/app/premium/page.tsx");
  assert.match(page, /<PremiumRecoveryBeacon\s*\/>/, "must actually be mounted on /premium");
});
