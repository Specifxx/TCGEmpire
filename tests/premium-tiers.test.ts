import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isPremium,
  premiumTierOf,
  normalizeTier,
  tierFromPriceId,
  priceIdFor,
  effectiveTier,
  grantPremiumDays,
} from "../src/lib/premium";
import { TIER_COMPARISON } from "../src/components/TierComparisonTable";
import { PLUS_PRICE_AMOUNT, PLUS_ANNUAL_AMOUNT, annualSavingPct, premiumFromLine } from "../src/lib/site";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// Premium went two-tier on 2026-09-11: Plus ($4.99/mo, ad-free + the full
// lists) and Premium ($9.99/mo, Plus + the four pro tools). This file guards
// the parts of that split most likely to break silently — tier resolution
// from a Stripe price id, the entitlement check's `min` argument, and the
// places a wrong tier means either overcharging or over-granting access.
// ─────────────────────────────────────────────────────────────────────────────

test("prisma schema carries premiumTier, additive and grandfathered to premium", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /premiumTier\s+String\s+@default\("premium"\)/, "must default every existing/comp row to full access");
});

test("tierFromPriceId resolves unknown/absent price ids to premium, never plus", () => {
  // The grandfather rule: an unrecognized or retired price — including the
  // empty string PLUS_PRICE_ID resolves to when Plus isn't configured — must
  // never be mistaken for a live Plus price.
  assert.equal(tierFromPriceId("price_totally_unknown"), "premium");
  assert.equal(tierFromPriceId(null), "premium");
  assert.equal(tierFromPriceId(undefined), "premium");
  assert.equal(tierFromPriceId(""), "premium");
});

test("normalizeTier only ever returns plus for the literal string 'plus'", () => {
  assert.equal(normalizeTier("plus"), "plus");
  assert.equal(normalizeTier("premium"), "premium");
  assert.equal(normalizeTier(undefined), "premium");
  assert.equal(normalizeTier(null), "premium");
  assert.equal(normalizeTier("Plus"), "premium", "case must matter — DB values are written by this codebase, not user input");
  assert.equal(normalizeTier(""), "premium");
});

test("isPremium's min argument defaults to plus, so every pre-existing call site is unchanged", () => {
  const now = Date.now();
  const future = new Date(now + 86_400_000);
  const past = new Date(now - 86_400_000);

  // A Plus subscriber: entitled at the default (plus) threshold, not at premium.
  const plusUser = { premiumUntil: future, premiumTier: "plus" };
  assert.equal(isPremium(plusUser), true, "isPremium(user) with no min arg must mean ANY paid tier");
  assert.equal(isPremium(plusUser, "premium"), false, "a Plus subscriber must not pass a premium-only gate");

  // A Premium subscriber: entitled at both thresholds.
  const premiumUser = { premiumUntil: future, premiumTier: "premium" };
  assert.equal(isPremium(premiumUser), true);
  assert.equal(isPremium(premiumUser, "premium"), true);

  // A lapsed subscriber, whatever tier is stored, is not entitled at all.
  assert.equal(isPremium({ premiumUntil: past, premiumTier: "plus" }), false);
  assert.equal(isPremium({ premiumUntil: past, premiumTier: "premium" }), false);

  // Admins bypass tier entirely, at both thresholds.
  assert.equal(isPremium({ premiumUntil: null, isAdmin: true }), true);
  assert.equal(isPremium({ premiumUntil: null, isAdmin: true }, "premium"), true);

  // A user with no premiumTier field at all (a caller that predates Plus)
  // must still read as "premium" — normalizeTier(undefined).
  assert.equal(isPremium({ premiumUntil: future }, "premium"), true);
});

test("premiumTierOf names the real tier, or null when not entitled", () => {
  const future = new Date(Date.now() + 86_400_000);
  const past = new Date(Date.now() - 86_400_000);
  assert.equal(premiumTierOf({ premiumUntil: future, premiumTier: "plus" }), "plus");
  assert.equal(premiumTierOf({ premiumUntil: future, premiumTier: "premium" }), "premium");
  assert.equal(premiumTierOf({ premiumUntil: past, premiumTier: "plus" }), null);
  assert.equal(premiumTierOf(null), null);
  assert.equal(premiumTierOf({ premiumUntil: null, isAdmin: true }), "premium", "an admin reads as the top tier");
});

test("priceIdFor falls back to monthly when the requested tier's annual price is unset", () => {
  // With no Stripe env configured in this test run, every price id constant
  // is "" — priceIdFor must not throw and must return the (empty) monthly
  // fallback rather than undefined.
  assert.equal(priceIdFor("premium", "annual"), priceIdFor("premium", "monthly"));
  assert.equal(priceIdFor("plus", "annual"), priceIdFor("plus", "monthly"));
});

test("checkout stamps tier on BOTH the session and the subscription metadata", () => {
  // Session metadata does NOT propagate to the subscription object — a tier
  // stamped only in `metadata` would be lost on every renewal and on the
  // reconcile cron, which only ever sees the subscription.
  const src = read("src/app/api/premium/checkout/route.ts");
  assert.match(src, /metadata:\s*\{\s*kind:\s*"premium",\s*userId:\s*user\.id,\s*trial:[^}]*tier\s*\}/s, "session metadata must carry tier");
  assert.match(src, /subscription_data:\s*\{[\s\S]{0,400}metadata:\s*\{\s*userId:\s*user\.id,\s*tier\s*\}/, "subscription_data.metadata must ALSO carry tier");
  // The lock-in guarantee test (premium-price-increase.test.ts) already pins
  // `price: priceId` — confirm the tier/plan resolution feeds that same var.
  assert.match(src, /const priceId = priceIdFor\(tier, plan\)/);
});

test("the webhook's tier write is not gated behind an extend-only premiumUntil change", () => {
  // stampPremium's early return used to be `if (!next && !linkCustomer) return;`
  // — a same-period tier CHANGE (an upgrade that doesn't move current_period_end)
  // has next === null, so a tier write conditioned on `next` would silently drop
  // the change. The early return must also check for a real tier change.
  const src = read("src/app/api/marketplace/stripe/webhook/route.ts");
  const fnAt = src.indexOf("async function stampPremium(");
  assert.ok(fnAt >= 0, "expected stampPremium to exist");
  const body = src.slice(fnAt, fnAt + 1200);
  assert.match(body, /tierChange/, "the write must track whether the tier actually changed");
  assert.match(body, /if \(!next && !linkCustomer && !tierChange\) return;/, "the early return must not skip a pure tier change");
  assert.match(body, /\.\.\.\(tierChange \? \{ premiumTier: tier \} : \{\}\)/, "the tier write must be unconditional on tierChange, not on next");

  // stampFromSubscription (renewals, trial→paid, AND plan switches via
  // customer.subscription.updated) must resolve tier from the LIVE price.
  const stampFromAt = src.indexOf("async function stampFromSubscription(");
  assert.ok(stampFromAt >= 0);
  const stampFromBody = src.slice(stampFromAt, src.indexOf("async function stampPremium("));
  assert.match(stampFromBody, /tierFromPriceId\(priceIdFromSubscription\(sub\)\)/, "must resolve tier from the subscription's live price, not stale metadata");

  // The grace path (subscription unreadable — no Stripe object to read a
  // price off at all) must fall back to the checkout-time metadata stamp.
  const graceAt = src.indexOf("grace — subscription unreadable");
  assert.ok(graceAt >= 0);
  assert.match(src.slice(Math.max(0, graceAt - 300), graceAt), /normalizeTier\(session\.metadata\?\.tier\)/, "the grace path has no subscription to read a price from, so it must trust session.metadata.tier");
});

test("the nightly reconcile and the audit script both resolve tier from the live price, not just premiumUntil", () => {
  // The single highest-risk file: without this, every Plus subscriber would
  // be silently upgraded to full Premium the next time either sweep runs,
  // since premiumUntil alone carries no tier information.
  const reconcile = read("src/lib/stripe-reconcile.ts");
  assert.match(reconcile, /tierFromPriceId\(priceIdFromSubscription\(sub\)\)/, "reconcile must resolve tier from the live subscription's price");
  assert.match(reconcile, /const tierChange = normalizeTier\(user\.premiumTier\) !== tier;/, "reconcile must detect a tier mismatch even when premiumUntil doesn't change");
  assert.doesNotMatch(
    reconcile.slice(reconcile.indexOf("if (!next && !link"), reconcile.indexOf("if (!next && !link") + 40),
    /if \(!next && !link\) continue;/,
    "the skip condition must also check tierChange, or a same-period tier switch is silently dropped"
  );

  const audit = read("scripts/audit-premium-vs-stripe.ts");
  assert.match(audit, /tierFromPriceId\(priceIdFromSubscription\(sub\)\)/, "the audit script must resolve tier from the live price too");
});

test("switch-to-annual and the new upgrade route guard on price id, not interval", () => {
  // An interval-only idempotency guard (price?.recurring?.interval === "year")
  // would let a same-interval TIER switch (Plus monthly → Premium monthly)
  // slip past undetected — the guard has to be able to tell tiers apart, which
  // only the price id can do.
  const switchSrc = read("src/app/api/premium/switch-to-annual/route.ts");
  assert.match(switchSrc, /price\.id === targetPriceId/, "switch-to-annual's idempotency guard must be price-based");
  assert.doesNotMatch(switchSrc, /price\?\.recurring\?\.interval === "year"\)/, "the old interval-only guard must be gone");

  const upgradeSrc = read("src/app/api/premium/upgrade/route.ts");
  assert.match(upgradeSrc, /tierFromPriceId\(price\.id\) === "premium"/, "the upgrade route's idempotency guard must be tier-based");
  assert.match(upgradeSrc, /always_invoice/, "an upgrade must bill the prorated difference now, not defer it");
  assert.match(upgradeSrc, /premiumPlusEnabled\(\)/, "must 503 while Plus isn't configured at all");
});

test("comp grants only write the tier when creating access, never when extending an active period", () => {
  // A day-granular comp (feedback: 7 days, referral: 3 days) landing on a
  // currently-paying Plus subscriber must not flip them to Premium and then
  // flip back on their next renewal.
  const src = read("src/lib/premium.ts");
  const fnAt = src.indexOf("export async function grantPremiumDays(");
  assert.ok(fnAt >= 0);
  const body = src.slice(fnAt, src.indexOf("export async function isSeedEmail"));
  assert.match(body, /const hadActive = !!u\.premiumUntil && u\.premiumUntil > now;/);
  assert.match(body, /\.\.\.\(hadActive \? \{\} : \{ premiumTier: tier \}\)/, "the tier write must be skipped when extending an already-active period");
});

test("TIER_COMPARISON's plus column agrees with the real server gates", () => {
  // For every row where Plus and Premium genuinely differ (a flat premium-only
  // tool), the page it names must gate on isPremium(user, "premium") — and for
  // every row where Plus already matches Premium (the full-list tools), the
  // page must NOT require the "premium" minimum.
  const proToolPages: Record<string, string> = {
    "Value Finder screener": "src/app/tools/value-finder/page.tsx",
    "Bulk Pricer — price a whole list at once": "src/app/bulk-pricer/page.tsx",
    "Best Basket — cheapest store split, postage included": "src/app/tools/best-basket/page.tsx",
    "Demand Finder — most searched & viewed cards": "src/app/tools/demand/page.tsx",
  };
  for (const [feature, file] of Object.entries(proToolPages)) {
    const row = TIER_COMPARISON.find((r) => r.feature === feature);
    assert.ok(row, `expected a TIER_COMPARISON row for "${feature}"`);
    assert.equal(row!.plus, false, `"${feature}" must be marked plus:false — it's a pro-tool row`);
    assert.equal(row!.premium, true, `"${feature}" must be marked premium:true`);
    const src = read(file);
    assert.match(src, /isPremium\(user,\s*"premium"\)/, `${file} must gate on isPremium(user, "premium")`);
  }

  const listToolPages: Record<string, string> = {
    "Deal Finder": "src/app/tools/deal-finder/page.tsx",
    "Rising Cards": "src/app/tools/rising/page.tsx",
  };
  for (const [feature, file] of Object.entries(listToolPages)) {
    const row = TIER_COMPARISON.find((r) => r.feature === feature);
    assert.ok(row, `expected a TIER_COMPARISON row for "${feature}"`);
    assert.equal(row!.plus, "Full list", `"${feature}" must give Plus the full list too`);
    const src = read(file);
    assert.doesNotMatch(src, /isPremium\(user,\s*"premium"\)/, `${file} must not require the premium minimum — Plus gets the full list here`);
  }

  // The basket API 403 is the one non-page pro-tool gate.
  const basketApi = read("src/app/api/basket/route.ts");
  assert.match(basketApi, /isPremium\(user,\s*"premium"\)/, "the Best Basket API must also require the premium minimum, matching the page");
});

test("Plus's display prices and helpers are real and match the decided figures", () => {
  assert.equal(PLUS_PRICE_AMOUNT, "$4.99");
  assert.equal(PLUS_ANNUAL_AMOUNT, "$39.99");
  // $39.99 vs 12×$4.99=$59.88 — a real ~33% saving, matching Premium's own.
  assert.equal(annualSavingPct("plus"), 33);
  assert.match(premiumFromLine("plus"), /^from \$[\d.]+\/mo billed yearly, or \$4\.99\/month month-to-month$/);
});

test("no new fake scarcity or invented numbers on any of the new tier surfaces", () => {
  for (const file of [
    "src/app/premium/page.tsx",
    "src/components/PremiumPricingCards.tsx",
    "src/components/SubscriptionActions.tsx",
    "src/app/api/premium/upgrade/route.ts",
    "src/app/api/premium/checkout/route.ts",
  ]) {
    const src = read(file);
    assert.ok(!/only \d+ (left|spots|seats)/i.test(src), `${file} must not invent scarcity`);
    assert.ok(!/expires? in/i.test(src), `${file} must not invent an expiry countdown`);
  }
});

test("the dialog's tier toggle still defaults to monthly — the smaller of its two headline numbers", () => {
  // Unchanged: the dialog's non-trial annual view (AnnualPriceBlock) shows
  // the once-a-year LUMP SUM as its headline, not a per-month rate, so
  // defaulting it to annual would show a BIGGER number to someone who hasn't
  // decided to pay anything yet — exactly what defaulting to monthly here
  // was written to avoid (see the dialog's own comment on `plan`).
  const src = read("src/components/PremiumDialog.tsx");
  assert.match(src, /useState<"monthly" \| "annual">\("monthly"\)/, "the dialog must default to the monthly plan");
});

test("/premium's billing-cycle toggle defaults to annual, when annual is actually live", () => {
  // 2026-09-11, owner: "default to annual billing so the prices look cheaper
  // at initial glance" — this only works honestly because /premium's annual
  // headline is the EFFECTIVE MONTHLY rate (premiumEffectiveMonthly()), a
  // SMALLER number than the monthly-plan price, not the dialog's once-a-year
  // lump sum. A tier missing its own annual price still displays monthly
  // regardless of this default (PaidTierCard's own effectiveCycle guard).
  const src = read("src/components/PremiumPricingCards.tsx");
  assert.match(
    src,
    /useState<"monthly" \| "annual">\(anyAnnualLive \? "annual" : "monthly"\)/,
    "must default to annual whenever annual billing is actually configured",
  );
  assert.match(src, /effectiveCycle/, "a tier without its own annual price must still fall back to monthly display");
});

test("grantPremiumDays and grantPremiumMonths accept an optional tier, defaulting to premium", () => {
  // Signature check only — a real grant needs a DB. Confirms the exported
  // function type still matches what the comp call sites (feedback, referral)
  // rely on positionally (userId, days) with no forced third argument.
  assert.equal(typeof grantPremiumDays, "function");
  assert.equal(grantPremiumDays.length <= 3, true, "must accept at most (userId, days, tier)");
});

// ─────────────────────────────────────────────────────────────────────────────
// Tier guardrails (2026-09-11, same day): the member-facing half of the split.
// A Plus member must never be told they're Premium, never be handed a tool
// they can't open, and must be able to move between tiers from inside the app.
// ─────────────────────────────────────────────────────────────────────────────

test("the dashboard's tool list tags each tool with the tier that can actually open it", () => {
  // Every "premium" entry here must be a page that gates on the premium
  // minimum, and every "plus" entry one that doesn't — otherwise the dashboard
  // either dangles a tool that bounces a Plus member to /premium, or hides one
  // they've paid for. This is the same invariant TIER_COMPARISON carries, read
  // from the other end.
  const src = read("src/app/dashboard/page.tsx");
  const toolsAt = src.indexOf("const TOOLS");
  assert.ok(toolsAt >= 0);
  const tools = src.slice(toolsAt, src.indexOf("];", toolsAt));

  const expected: Record<string, "plus" | "premium"> = {
    "Bulk Pricer": "premium",
    "Best Basket": "premium",
    "Value Finder": "premium",
    "Demand Finder": "premium",
    "Rising Cards": "plus",
    "Rising Sealed": "plus",
    "Deal Finder": "plus",
    "Condition Calculator": "plus",
  };
  for (const [title, tier] of Object.entries(expected)) {
    const line = tools.split("\n").find((l) => l.includes(`title: "${title}"`));
    assert.ok(line, `expected a dashboard entry for ${title}`);
    assert.match(line!, new RegExp(`tier:\\s*"${tier}"`), `${title} must be tagged ${tier} on the dashboard`);
  }

  // …and the filter that uses those tags must be tier-driven, not a blanket
  // "show everything to anyone who paid".
  assert.match(src, /TOOLS\.filter\(/, "the dashboard must filter its tools by tier");
  assert.match(src, /premiumTierOf\(user\)/, "the dashboard must read the member's real tier");
});

test("the dashboard never calls a Plus member Premium", () => {
  const src = read("src/app/dashboard/page.tsx");
  // Everything that names the viewer's own plan must interpolate the tier.
  assert.match(src, /Your \{tierName\} tools/, "the tools heading must name the member's real tier");
  assert.match(src, /Your \{tierName\} hub/, "the subheading must name the member's real tier");
  assert.match(src, /you&apos;re \{tierName\}/, "the ad-free footer must name the member's real tier");
  // The Premium-only tools are shown to Plus as locked, not as links.
  assert.match(src, /lockedTools/, "Premium-only tools must be rendered separately for Plus, not hidden or linked");
});

test("the downgrade route credits rather than charges, and mirrors the upgrade route's tier guard", () => {
  const src = read("src/app/api/premium/downgrade/route.ts");
  // The money direction is the whole difference between this route and the
  // upgrade one: a downgrade must never take a payment.
  assert.match(src, /proration_behavior:\s*"create_prorations"/, "a downgrade must credit the unused period, not invoice for it");
  // (the comment names always_invoice to contrast with the upgrade route, so
  // match the actual argument, not the bare word)
  assert.doesNotMatch(src, /proration_behavior:\s*"always_invoice"/, "a downgrade must never charge the customer immediately");
  assert.match(src, /tierFromPriceId\(price\.id\) === "plus"/, "must be idempotent on tier, not on interval — the interval doesn't change here");
  assert.match(src, /premiumPlusEnabled\(\)/, "must 503 when there's no Plus price configured to move to");
  assert.match(src, /priceIdFor\("plus",\s*interval\)/, "must keep the customer's existing billing interval");
});

test("the subscription actions card states the money consequence of every button it offers", () => {
  const src = read("src/components/SubscriptionActions.tsx");
  // Each of the three actions posts to its own route, and each is only offered
  // when it's actually possible for this member.
  assert.match(src, /"\/api\/premium\/upgrade"/);
  assert.match(src, /"\/api\/premium\/downgrade"/);
  assert.match(src, /"\/api\/premium\/switch-to-annual"/);
  assert.match(src, /canUpgrade = plusLive && tier === "plus"/, "only a Plus member can upgrade");
  assert.match(src, /canDowngrade = plusLive && tier === "premium"/, "only a Premium member can move down");
  assert.match(src, /canGoAnnual = annualAvailable && interval === "month"/, "annual is only offered to a monthly subscriber");
  // The three consequence lines must match what the routes actually do — the
  // upgrade invoices now, the downgrade credits forward.
  assert.match(src, /Billed the difference/, "the upgrade button must say it charges now");
  assert.match(src, /credited against your next invoice/, "the downgrade button must say it credits rather than refunds");
});

test("the admin revoke route clears the entitlement and nothing else", () => {
  const src = read("src/app/api/admin/revoke-premium/route.ts");
  assert.match(src, /keyOk \|\| me\?\.isAdmin/, "must carry the same dual gate as every other admin mutation");
  assert.match(src, /data:\s*\{\s*premiumUntil:\s*null,\s*earlyPremiumGranted:\s*false\s*\}/, "must clear the entitlement");
  // The three deliberate non-actions. Each would be a bigger change than the
  // one being asked for, and each is reported back instead.
  assert.doesNotMatch(src, /isAdmin:\s*false/, "must never silently strip admin rights");
  assert.doesNotMatch(src, /trialStartedAt:\s*null/, "must never hand back a used free trial");
  assert.doesNotMatch(src, /subscriptions\.(cancel|update|del)/, "must never touch the Stripe subscription");
  assert.match(src, /stillAdmin/, "must report that an admin still reads as premium");
  assert.match(src, /hasStripeCustomer/, "must report a live Stripe customer whose next webhook re-grants");
  assert.match(src, /console\.log\(/, "an entitlement change by hand must be traceable in the logs");
});

test("the admin accounts page separates Plus from Premium and only ever counts an ACTIVE entitlement as either", () => {
  const src = read("src/app/admin/accounts/page.tsx");
  // premiumTier is a plain column defaulting to "premium", so counting it
  // without an active premiumUntil would report every free account as Premium.
  assert.match(src, /const active = \{ premiumUntil: \{ gt: now \} \}/, "tier filters must be anchored to a live entitlement");
  // …and on the EFFECTIVE tier, so a grandfathered account billed Plus but
  // pinned to Premium counts as Premium here, the same as it reads on the site.
  assert.match(src, /const effPlus = \{ AND: \[active, isEffPlus\] \}/, "the Plus count must be active AND effectively plus");
  assert.match(src, /const effPremium = \{ AND: \[active, \{ NOT: isEffPlus \}\] \}/, "the Premium count must be active AND not effectively plus");
  assert.match(src, /premiumTierFloor: null/, "the effective-tier query must account for an unset floor");
  assert.match(src, /label="Plus \(active\)"/, "Plus must get its own stat, not be folded into a single paid number");
  assert.match(src, /label="Premium \(active\)"/);
  // "When was this account last seen", the other thing the page gained. That
  // was Last LOGIN until 2026-09-11 and is now Last ACTIVE — sessions are
  // long-lived JWTs, so a login date could be months stale for a daily
  // visitor (see lib/activity.ts). lastLoginAt stays in the select purely as
  // the fallback for accounts that predate activity tracking.
  assert.match(src, /lastActiveAt: true/, "the row select must carry lastActiveAt");
  assert.match(src, /lastLoginAt: true/, "and lastLoginAt, still needed as the pre-tracking fallback");
  assert.match(src, /Last active/, "the table must show it");
});

test("last login is stamped on sign-in without being able to fail the sign-in", () => {
  // The site is OAuth-only, so the callback is the single place a login
  // happens. The write is fire-and-forget on purpose: a failed bookkeeping
  // update must never cost someone their session.
  const src = read("src/app/api/auth/oauth/[provider]/callback/route.ts");
  assert.match(
    src,
    /void prisma\.user\.update\(\{[\s\S]{0,140}lastLoginAt: new Date\(\)[\s\S]{0,60}\)\.catch\(\(\) => \{\}\)/,
    "must stamp lastLoginAt without awaiting or throwing",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Grandfathering (2026-09-11): the August $4.99 subscribers were promised
// their price would hold. That Price object later became the PLUS price, so
// billing legitimately resolves them to Plus while the promise says Premium —
// and they now share a price id with genuine new Plus customers, so nothing
// derived from the price alone can separate the two cohorts. The difference
// is a fact about the customer, so it lives on the customer.
// ─────────────────────────────────────────────────────────────────────────────

test("a tier floor raises the effective tier without touching what billing wrote", () => {
  const future = new Date(Date.now() + 86_400_000);

  // The grandfathered case: billed Plus, promised Premium.
  const grandfathered = { premiumUntil: future, premiumTier: "plus", premiumTierFloor: "premium" };
  assert.equal(effectiveTier(grandfathered), "premium");
  assert.equal(premiumTierOf(grandfathered), "premium");
  assert.equal(isPremium(grandfathered, "premium"), true, "a grandfathered account must pass a pro-tool gate");

  // A floor NEVER lowers anyone — that's the whole point of it being a floor.
  // A Premium subscriber with a stale "plus" floor keeps Premium.
  const premiumWithLowFloor = { premiumUntil: future, premiumTier: "premium", premiumTierFloor: "plus" };
  assert.equal(effectiveTier(premiumWithLowFloor), "premium");
  assert.equal(isPremium(premiumWithLowFloor, "premium"), true);

  // No floor, or a junk value, changes nothing. A junk floor must NOT be run
  // through normalizeTier, which maps anything unrecognized to "premium" — an
  // empty or malformed column would then be a free upgrade for everyone.
  assert.equal(effectiveTier({ premiumUntil: future, premiumTier: "plus" }), "plus");
  assert.equal(effectiveTier({ premiumUntil: future, premiumTier: "plus", premiumTierFloor: null }), "plus");
  assert.equal(effectiveTier({ premiumUntil: future, premiumTier: "plus", premiumTierFloor: "" }), "plus");
  assert.equal(effectiveTier({ premiumUntil: future, premiumTier: "plus", premiumTierFloor: "PREMIUM" }), "plus");
  assert.equal(effectiveTier({ premiumUntil: future, premiumTier: "plus", premiumTierFloor: "nonsense" }), "plus");

  // A floor raises a tier; it never GRANTS one. A lapsed account with a floor
  // is still not entitled to anything.
  const lapsed = { premiumUntil: new Date(Date.now() - 86_400_000), premiumTier: "plus", premiumTierFloor: "premium" };
  assert.equal(isPremium(lapsed), false);
  assert.equal(premiumTierOf(lapsed), null);
});

test("the floor is applied at read time, so billing can keep re-stamping the real tier", () => {
  // The design claim worth pinning: nothing in the Stripe pipeline knows about
  // the floor. If a webhook or the reconcile ever started writing
  // premiumTierFloor, a renewal could silently undo a promise — and a floor
  // that had to be re-applied after every plan change would be a freeze with
  // extra steps.
  for (const f of [
    "src/app/api/marketplace/stripe/webhook/route.ts",
    "src/lib/stripe-reconcile.ts",
    "src/app/api/premium/upgrade/route.ts",
    "src/app/api/premium/downgrade/route.ts",
  ]) {
    assert.doesNotMatch(read(f), /premiumTierFloor/, `${f} must not read or write the floor — billing writes premiumTier only`);
  }
  // Exactly one route may set it, and it's an admin one behind the dual gate.
  const route = read("src/app/api/admin/tier-floor/route.ts");
  assert.match(route, /keyOk \|\| me\?\.isAdmin/, "setting a floor must be admin-gated");
  assert.match(route, /floor !== "plus" && floor !== "premium"/, "must reject a floor that isn't a real tier");
  assert.match(route, /console\.log\(/, "an entitlement change by hand must be traceable in the logs");
});

test("the session user carries the floor, so the four pro-tool gates actually see it", () => {
  // isPremium takes premiumTierFloor as OPTIONAL so narrow selects still
  // compile — which means a gate whose user object lacks the field silently
  // ignores the floor. All four pro gates read SessionUser, so SessionUser is
  // the one shape that must carry it.
  const auth = read("src/lib/auth.ts");
  assert.match(auth, /premiumTierFloor: string \| null;/, "SessionUser must declare the floor");
  assert.match(auth, /premiumTierFloor: user\.premiumTierFloor,/, "…and actually populate it");
});

test("schema and admin surface describe the floor as a floor, not an override", () => {
  assert.match(read("prisma/schema.prisma"), /premiumTierFloor\s+String\?/);
  // The admin page must show BOTH halves for a pinned account: an admin
  // looking at a grandfathered subscriber needs to see the promise AND what
  // Stripe is really billing, not a merged answer that hides the discrepancy.
  const page = read("src/app/admin/accounts/page.tsx");
  assert.match(page, /pinned · billed \{u\.premiumTier\}/, "a pinned account must show its real billing tier too");
});
