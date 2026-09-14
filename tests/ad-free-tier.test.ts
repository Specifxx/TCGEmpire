import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
// AD-FREE IS A PREMIUM ENTITLEMENT (2026-09-14). See DECISIONS.md.
//
// Plus at $4.99 included ad-free AND the full Deal Finder list — the two things
// the site sells hardest — which left Premium at $9.99 differentiated only by
// four bulk/screener tools most visitors have no use for. With the pricing page
// defaulting to annual, a reader saw $3.33 immediately left of $6.67 and the
// cheaper card ticked every broadly-appealing box.
//
// Moving ad-free up is the smallest change that gives the higher tier a reason
// to exist. Nobody who already bought Plus loses it: premiumTierFloor raises
// their tier at read time (scripts/grandfather-plus-adfree.ts).
//
// The trap this file exists to catch: `premium` and `adFree` are now DIFFERENT
// questions. `isPremium(user)` defaults to min "plus" and is still what gates
// the Plus-level features. Wiring the ad components back to `premium` would
// silently hand ad-free to every Plus account again, and nothing else would
// fail.
// ─────────────────────────────────────────────────────────────────────────────

test("the tier table says ad-free is Premium-only", () => {
  const row = TIER_COMPARISON.find((r) => r.feature === "Ad-free experience");
  assert.ok(row, "expected an Ad-free experience row — the feature string is matched verbatim by DIALOG_OMIT_FEATURES and by three other tests");
  assert.equal(row!.anon, false);
  assert.equal(row!.account, false);
  assert.equal(row!.plus, false, "Plus must no longer include ad-free");
  assert.equal(row!.premium, true);
});

test("the ad components gate on adFree, which is computed at the premium minimum", () => {
  const me = code("src/app/api/me/route.ts");
  assert.match(me, /adFree: isPremium\(user, "premium"\)/, "/api/me must publish adFree at the premium minimum");
  assert.match(me, /premium: isPremium\(user\)/, "`premium` must stay at the default (plus) minimum — other gates depend on it");

  const useMe = code("src/lib/use-me.ts");
  assert.match(useMe, /adFree: boolean/, "the Me type must carry adFree");
  assert.match(useMe, /adFree: !!d\.adFree/, "fetchMe must map it");

  const provider = code("src/components/PremiumProvider.tsx");
  assert.match(provider, /const \{ adFree \} = useMe\(\)/, "the ad provider must read adFree, not premium");
  assert.ok(!/const \{ premium \} = useMe\(\)/.test(provider), "reading `premium` here would give ad-free back to every Plus account");
});

test("no surface still sells ad-free as a Plus benefit", () => {
  for (const f of [
    "src/components/PremiumPricingCards.tsx",
    "src/app/premium/page.tsx",
    "src/app/dashboard/page.tsx",
  ]) {
    const src = code(f);
    assert.ok(!/Ad-free &amp; the full lists|Ad-free & the full lists/.test(src), `${f}: the Plus tagline must not claim ad-free`);
    assert.ok(!/Plus adds the full lists and no ads/.test(src), `${f}: the comparison subhead must not put no-ads in Plus`);
  }
  // Plus's own feature list must not list it; Premium's must.
  const cards = code("src/components/PremiumPricingCards.tsx");
  const plusList = cards.slice(cards.indexOf("const PLUS_FEATURES"), cards.indexOf("const PREMIUM_FEATURES_ON_PLUS"));
  assert.ok(!/Ad-free/.test(plusList), "PLUS_FEATURES must not advertise ad-free");
  const premiumLists = cards.slice(cards.indexOf("const PREMIUM_FEATURES_ON_PLUS"), cards.indexOf("function FreeCard"));
  assert.match(premiumLists, /Ad-free browsing/, "Premium's feature lists must advertise ad-free");
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
