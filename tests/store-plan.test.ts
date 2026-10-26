import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ABOUT_MAX,
  PROMO_MAX,
  STORE_PLAN_AMOUNT,
  STORE_PLAN_FEATURES,
  amountCents,
  guessRetailerKey,
  isStorePlanSubscription,
  planPartnerActive,
  storeCheckoutMetadata,
  storePlanEnabled,
  storePlanStatus,
  storePriceProblem,
  unlinkedTooLong,
  validateAbout,
  validatePromo,
  validateStoreName,
  validateStoreUrl,
} from "../src/lib/store-plan";
import { buildInboxEmail } from "../src/lib/ops/notify-owner";
import { missingEnv } from "../src/lib/ops/self-report";
import { storePlansUnlinked } from "../src/lib/ops/checks";
import type { OpsDeps } from "../src/lib/ops/deps";

// The Stores plan (2026-10-23, DECISIONS.md "The Stores plan").

const read = (p: string) => readFileSync(p, "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const DAY = 86_400_000;
const NOW = new Date("2026-10-23T12:00:00Z");

// ── Pure rules ───────────────────────────────────────────────────────────────

test("the plan is offered only when Stripe and the Stores price are both configured", () => {
  assert.equal(storePlanEnabled({}), false);
  assert.equal(storePlanEnabled({ STRIPE_SECRET_KEY: "sk_x" }), false);
  assert.equal(storePlanEnabled({ STRIPE_STORE_PRICE_ID: "price_x" }), false);
  assert.equal(storePlanEnabled({ STRIPE_SECRET_KEY: "sk_x", STRIPE_STORE_PRICE_ID: " " }), false);
  assert.equal(storePlanEnabled({ STRIPE_SECRET_KEY: "sk_x", STRIPE_STORE_PRICE_ID: "price_x" }), true);
});

test("the displayed amount defaults to $79.99 and parses to cents", () => {
  assert.equal(STORE_PLAN_AMOUNT, process.env.NEXT_PUBLIC_STORE_PLAN_AMOUNT || "$79.99");
  assert.equal(amountCents("$79.99"), 7999);
  assert.equal(amountCents("US$79.99"), 7999);
  assert.equal(amountCents("$80"), 8000);
  assert.equal(amountCents("$1,000.5"), 100050);
  assert.equal(amountCents("free"), null);
});

test("the checkout never sells a Price dearer than the page, or not monthly USD", () => {
  const ok = { active: true, currency: "usd", unit_amount: 7999, recurring: { interval: "month", interval_count: 1 } };
  assert.equal(storePriceProblem(ok, 7999), null);
  assert.equal(storePriceProblem({ ...ok, unit_amount: 4999 }, 7999), null, "cheaper than the page is fine");
  assert.match(storePriceProblem({ ...ok, unit_amount: 8000 }, 7999)!, /8000 cents/);
  assert.match(storePriceProblem({ ...ok, recurring: { interval: "year", interval_count: 1 } }, 7999)!, /not monthly/);
  assert.match(storePriceProblem({ ...ok, recurring: { interval: "month", interval_count: 3 } }, 7999)!, /not monthly/);
  assert.match(storePriceProblem({ ...ok, recurring: null }, 7999)!, /not recurring/);
  assert.match(storePriceProblem({ ...ok, currency: "aud" }, 7999)!, /not USD/);
  assert.match(storePriceProblem({ ...ok, unit_amount: null }, 7999)!, /no fixed unit amount/);
  assert.match(storePriceProblem({ ...ok, active: false }, 7999)!, /archived/);
  assert.ok(storePriceProblem(ok, null), "an unparseable page amount refuses too");
  assert.ok(storePriceProblem(null, 7999));
});

test("store name, URL, description and promo are validated as plain one-line text", () => {
  assert.equal(validateStoreName("A").ok, false);
  assert.equal(validateStoreName("x".repeat(81)).ok, false);
  assert.deepEqual(validateStoreName("  Cherry \n Collectables "), { ok: true, value: "Cherry Collectables" });
  assert.equal(validateStoreName(42).ok, false);

  assert.deepEqual(validateStoreUrl("https://WWW.Shop.com/"), { ok: true, value: "https://www.shop.com" });
  assert.deepEqual(validateStoreUrl("https://shop.com/au/"), { ok: true, value: "https://shop.com/au" });
  for (const bad of ["http://shop.com", "shop.com", "javascript:alert(1)", "https://localhost", "https://u:p@shop.com", "", "https://" + "a".repeat(200) + ".com"]) {
    assert.equal(validateStoreUrl(bad).ok, false, bad);
  }

  assert.deepEqual(validateAbout(""), { ok: true, value: null }, "empty clears it");
  assert.deepEqual(validateAbout(null), { ok: true, value: null });
  assert.deepEqual(validateAbout("Hi there\u0007"), { ok: true, value: "Hi there" });
  assert.equal(validateAbout("x".repeat(ABOUT_MAX)).ok, true);
  assert.equal(validateAbout("x".repeat(ABOUT_MAX + 1)).ok, false);
  assert.equal(validatePromo("x".repeat(PROMO_MAX)).ok, true);
  assert.equal(validatePromo("x".repeat(PROMO_MAX + 1)).ok, false);
  assert.equal(validatePromo(["array"]).ok, false);
  assert.equal(ABOUT_MAX, 280);
  assert.equal(PROMO_MAX, 120);
});

test("a plan stays active three days past its paid-through date; a pilot partner always is", () => {
  assert.equal(planPartnerActive(null, NOW), true, "pilot partner (no subscription) is unchanged");
  assert.equal(planPartnerActive({ activeUntil: null }, NOW), false, "linked but never paid");
  assert.equal(planPartnerActive({ activeUntil: new Date(NOW.getTime() + DAY) }, NOW), true);
  assert.equal(planPartnerActive({ activeUntil: new Date(NOW.getTime() - 2 * DAY) }, NOW), true, "inside the grace");
  assert.equal(planPartnerActive({ activeUntil: new Date(NOW.getTime() - 3 * DAY - 1) }, NOW), false, "grace over");
  assert.equal(planPartnerActive({ activeUntil: new Date(NOW.getTime() - 3 * DAY + 1).toISOString() }, NOW), true);
});

test("the buyer's status reads payment, linking and lapse in that order", () => {
  const future = new Date(NOW.getTime() + 10 * DAY);
  assert.equal(storePlanStatus({ activeUntil: null, partnerId: null }, NOW), "payment-pending");
  assert.equal(storePlanStatus({ activeUntil: future, partnerId: null }, NOW), "awaiting-link");
  assert.equal(storePlanStatus({ activeUntil: future, partnerId: "p1" }, NOW), "active");
  assert.equal(storePlanStatus({ activeUntil: new Date(NOW.getTime() - 5 * DAY), partnerId: "p1" }, NOW), "ended");
});

test("a paid plan unlinked for more than two days is overdue; unpaid or linked ones are not", () => {
  const paid = new Date(NOW.getTime() + 20 * DAY);
  assert.equal(unlinkedTooLong({ createdAt: new Date(NOW.getTime() - 3 * DAY), activeUntil: paid, partnerId: null }, NOW), true);
  assert.equal(unlinkedTooLong({ createdAt: new Date(NOW.getTime() - DAY), activeUntil: paid, partnerId: null }, NOW), false);
  assert.equal(unlinkedTooLong({ createdAt: new Date(NOW.getTime() - 3 * DAY), activeUntil: null, partnerId: null }, NOW), false);
  assert.equal(unlinkedTooLong({ createdAt: new Date(NOW.getTime() - 3 * DAY), activeUntil: paid, partnerId: "p" }, NOW), false);
});

test("a Stores subscription is recognised by its live price or its checkout stamp, never a Pro one", () => {
  assert.equal(isStorePlanSubscription({}, "price_store", "price_store"), true);
  assert.equal(isStorePlanSubscription({ metadata: { kind: "store" } }, "price_store", "price_other"), true);
  assert.equal(isStorePlanSubscription({ metadata: { kind: "premium" } }, "price_store", "price_premium"), false);
  assert.equal(isStorePlanSubscription({}, "", null), false, "an unset price id never matches a missing price");
  assert.deepEqual(storeCheckoutMetadata("u1", "Shop", "https://shop.com"), { kind: "store", userId: "u1", storeName: "Shop", storeUrl: "https://shop.com" });
});

test("the admin picker preselects the tracked store whose website the buyer named", () => {
  const list = [
    { key: "cherry", base: "https://www.cherrycollectables.com.au" },
    { key: "other", base: "https://other.com" },
  ];
  assert.equal(guessRetailerKey("https://cherrycollectables.com.au/collections", list), "cherry");
  assert.equal(guessRetailerKey("https://nope.com", list), null);
  assert.equal(guessRetailerKey("not a url", list), null);
});

test("the sales page lists what the plan includes", () => {
  const titles = STORE_PLAN_FEATURES.map((f) => f.title).join(" | ");
  for (const t of [/repricing report/i, /searching for/i, /Verified store/i, /Pro/]) assert.match(titles, t);
});

// ── Checkout ─────────────────────────────────────────────────────────────────

test("checkout: signed in, rate-limited, price-guarded, monthly subscription with no trial", () => {
  const src = code("src/app/api/stores/checkout/route.ts");
  assert.match(src, /if \(!storePlanEnabled\(\)\) \{\s*return NextResponse\.json\([^)]*\{ status: 503 \}\)/);
  assert.match(src, /if \(!user\) return NextResponse\.json\([^)]*\{ status: 401 \}\)/);
  assert.match(src, /rateLimit\(`store-checkout:\$\{user\.id\}`/);
  // The Price is read and checked BEFORE a session is created.
  const guard = src.indexOf("storePriceProblem(price, amountCents(STORE_PLAN_AMOUNT))");
  const create = src.indexOf("checkout.sessions.create(");
  assert.ok(guard > 0 && create > guard, "the price guard runs before checkout opens");
  assert.match(src, /prices\.retrieve\(STORE_PLAN_PRICE_ID\)/);
  assert.match(src, /if \(problem\) \{\s*console\.error\([\s\S]*?status: 503/);
  assert.match(src, /mode: "subscription"/);
  assert.match(src, /line_items: \[\{ price: STORE_PLAN_PRICE_ID, quantity: 1 \}\]/);
  assert.match(src, /user\.stripeCustomerId \? \{ customer: user\.stripeCustomerId \} : \{ customer_email: user\.email \}/);
  assert.match(src, /subscription_data: \{ metadata \}/);
  assert.doesNotMatch(src, /trial_period_days|trial_end/, "no trial");
  assert.match(src, /success_url: `\$\{SITE_URL\}\/stores\/account\?welcome=1`/);
  assert.match(src, /cancel_url: `\$\{SITE_URL\}\/stores`/);
});

// ── Webhook ──────────────────────────────────────────────────────────────────

test("webhook: a Stores checkout records the plan, grants Pro through the shared stamp, and tells the owner once", () => {
  const src = code("src/app/api/marketplace/stripe/webhook/route.ts");
  assert.match(src, /if \(session\.metadata\?\.kind === "store"\) await storePlanStarted\(session\);/);
  const fn = src.slice(src.indexOf("async function storePlanStarted"), src.indexOf("async function storePlanRenewed"));
  assert.match(fn, /subscriptions\.retrieve\(subId\)/);
  assert.match(fn, /entitledUntilFromSubscription\(sub\)/);
  assert.match(fn, /recordStorePlanStart\(\{ userId, stripeSubscriptionId: subId/);
  assert.match(fn, /updateMany\(\{ where: \{ id: userId, stripeCustomerId: null \}, data: \{ stripeCustomerId: customerId \} \}\)/, "links the customer only if unlinked");
  assert.match(fn, /await stampFromSubscription\(sub, `checkout \$\{session\.id\}`, customerId\);/, "Pro through the one stamping path");
  assert.match(fn, /if \(created\) \{[\s\S]*?notifyOwnerBounded\(\{\s*kind: "store-plan",\s*headline: `\$\{storeName\} bought the Stores plan`/);
  // The Premium branches are untouched.
  assert.match(src, /if \(session\.metadata\?\.kind === "premium"\) \{\s*await premiumStarted\(session\);\s*await creatorReferral\(session, event\.id\);\s*\}/);
});

test("webhook: renewals extend the plan (extend-only), keyed on the Stores price, never fatal to Pro", () => {
  const src = code("src/app/api/marketplace/stripe/webhook/route.ts");
  const stamp = src.slice(src.indexOf("async function stampFromSubscription("), src.indexOf("async function stampPremium("));
  const untilGuard = stamp.indexOf("if (!until) return;");
  const store = stamp.indexOf("isStorePlanSubscription(sub, STORE_PLAN_PRICE_ID, priceIdFromSubscription(sub))");
  assert.ok(untilGuard > 0 && store > untilGuard, "only an entitled subscription extends the plan");
  assert.match(stamp, /await storePlanRenewed\(sub, until, eventId\)/);
  const renewed = src.slice(src.indexOf("async function storePlanRenewed"));
  assert.match(renewed, /try \{\s*await extendStorePlan\(subId, until\);\s*\} catch \(e\) \{\s*console\.error/);
  const db = code("src/lib/store-plan-db.ts");
  assert.match(db, /OR: \[\{ activeUntil: null \}, \{ activeUntil: \{ lt: until \} \}\]/, "extend-only write");
  // The daily reconcile heals a missed renewal for the plan too.
  assert.match(code("src/lib/stripe-reconcile.ts"), /isStorePlanSubscription\(sub, STORE_PLAN_PRICE_ID, priceIdFromSubscription\(sub\)\)[\s\S]{0,80}extendStorePlan\(sub\.id, until\)/);
});

// ── Owner linking and the buyer's pages ──────────────────────────────────────

test("linking a plan creates the partner with its subscription, claims the plan once, and emails the buyer", () => {
  const src = code("src/app/api/admin/store-partners/route.ts");
  assert.match(src, /planSubscriptionId: z\.string\(\)\.min\(1\)\.max\(64\)\.optional\(\)/);
  assert.match(src, /if \(parsed\.data\.planSubscriptionId\) return linkPlan\(/);
  assert.match(src, /\$transaction\(async \(tx\) => \{[\s\S]*?planSubscriptionId: plan\.id[\s\S]*?updateMany\(\{ where: \{ id: plan\.id, partnerId: null \}, data: \{ partnerId: p\.id \} \}\)/);
  assert.match(src, /sendStoreReportEmail\(buyer\.email, name, reportUrl\)/);
  const page = code("src/app/admin/store-partners/page.tsx");
  assert.match(page, /storePlanSubscription\.findMany\(\{\s*where: \{ partnerId: null \}/);
  assert.match(page, /plan=\{\{ id: plan\.id, storeName: plan\.storeName, suggestedRetailer: guessRetailerKey\(plan\.storeUrl, RETAILER_LIST\) \}\}/);
});

test("the owner's inbox email for a Stores plan opens /admin/store-partners", () => {
  const m = buildInboxEmail({ kind: "store-plan", headline: "Shop bought the Stores plan", fields: [["Store", "Shop"]] });
  assert.match(m.subject, /^\[RiftCompare inbox\] Stores plan purchase: /);
  assert.match(m.html, /riftcompare\.com\/admin\/store-partners/);
});

test("the profile route: owner of the plan only, rate-limited, validated, revalidates the store page, tells the owner", () => {
  const src = code("src/app/api/stores/profile/route.ts");
  assert.match(src, /if \(!user\) return NextResponse\.json\([^)]*\{ status: 401 \}\)/);
  assert.match(src, /rateLimit\(`store-profile:\$\{user\.id\}`/);
  assert.match(src, /findFirst\(\{\s*where: \{ id: subscriptionId, userId: user\.id \}/, "only the buyer's own plan");
  assert.match(src, /planPartnerActive\(\{ activeUntil: plan\.activeUntil \}, new Date\(\)\)/);
  assert.match(src, /validateAbout\(body\?\.about\)/);
  assert.match(src, /validatePromo\(body\?\.promo\)/);
  assert.match(src, /profileUpdatedAt: new Date\(\)/);
  assert.match(src, /revalidatePath\(path\)/);
  assert.match(src, /import \{ notifyOwnerBounded \} from "@\/lib\/ops\/notify-owner";/);
  const save = src.indexOf("storePartner.update(");
  const notify = src.indexOf("notifyOwnerBounded({");
  assert.ok(save > 0 && notify > save, "the owner is told after the text is saved");
  assert.match(src.slice(notify), /kind: "store-plan"/);
});

test("/stores/account is private, per-request and offers billing and the report once linked", () => {
  const src = code("src/app/stores/account/page.tsx");
  assert.match(src, /export const dynamic = "force-dynamic";/);
  assert.match(src, /robots: \{ index: false, follow: false \}/);
  assert.match(src, /href="\/login\?next=\/stores\/account&src=stores_plan"/);
  assert.match(src, /where: \{ userId: user\.id \}/);
  assert.match(src, /<ManageSubscriptionButton label="Manage billing" back="\/stores\/account" \/>/);
  assert.match(src, /\/stores\/report\?token=\$\{partner\.token\}/);
  // The billing portal only ever returns to an allow-listed page.
  assert.match(code("src/app/api/premium/portal/route.ts"), /RETURN_PATHS\.has\(body\.back\)/);
});

test("the report locks for an ended plan, leaves pilot partners alone, and shows search demand from the cached loader", () => {
  const src = code("src/app/stores/report/page.tsx");
  const gate = src.indexOf("planPartnerActive(await planOfPartner(partner), new Date())");
  const mine = src.indexOf("prisma.retailerPrice.findMany(");
  assert.ok(gate > 0 && mine > gate, "an ended plan is turned away before any listing is read");
  assert.match(src, /Your Stores plan has ended/);
  assert.match(src, /href="\/stores"/);
  assert.match(src, /What buyers are searching for/);
  assert.match(src, /await getTopDemand\(7, 25\)/, "the self-cached demand loader, not a new query");
  assert.match(src, /const DEMAND_ROWS = 20;/);
  assert.equal((src.match(/await prisma\./g) ?? []).length, 3, "no new direct read on this uncached page");
  assert.match(code("src/lib/store-plan-db.ts"), /if \(!partner\.planSubscriptionId\) return null;/, "pilot partner → no plan → unchanged");
});

test("the store page shows the Verified mark in its header only and keeps its revalidate", () => {
  const src = code("src/app/stores/[slug]/page.tsx");
  assert.match(src, /export const revalidate = 86400;/);
  assert.match(src, /verifiedStoreProfile\(store\.key\)/);
  assert.match(src, /\{verified\.about && <p[^>]*>\{verified\.about\}<\/p>\}/, "plain text, escaped by React");
  assert.doesNotMatch(src, /dangerouslySetInnerHTML=\{\{ __html: [^}]*verified/);
  const table = src.slice(src.indexOf("Cheapest Riftbound singles at"), src.indexOf("</table>"));
  assert.doesNotMatch(table, /verified/i, "never in a price row");
  // Nothing that ranks or compares reads the plan.
  assert.doesNotMatch(read("src/lib/market-rows.ts"), /storePlan|verifiedStore|storePartner/i, "the comparison never reads the plan");
});

test("the sales page sells the plan, says paying never changes a comparison, and falls back to email", () => {
  const src = code("src/app/stores/page.tsx");
  assert.match(src, /export const revalidate = 86400;/);
  assert.match(src, /Paying never changes your place in any comparison\./);
  assert.match(src, /\{STORE_PLAN_AMOUNT\}/);
  assert.match(src, /STORE_PLAN_FEATURES\.map/);
  assert.match(src, /enabled \? \(\s*<StorePlanSignup amount=\{STORE_PLAN_AMOUNT\} \/>\s*\) : \(/);
  assert.match(src, /mailto:\$\{CONTACT_EMAIL\}/);
  assert.match(src, /Already a partner\?/);
  assert.doesNotMatch(src, /getCurrentUser/, "the ISR page never reads the session; the form asks \/api\/me");
  assert.match(code("src/components/stores/StorePlanSignup.tsx"), /fetch\("\/api\/stores\/checkout"/);
  assert.match(code("src/components/stores/StorePlanSignup.tsx"), /href="\/login\?next=\/stores&src=stores_plan"/);
  // The trust pages disclose the new revenue and repeat the rule.
  assert.match(code("src/app/editorial-policy/page.tsx").replace(/\s+/g, " "), /nothing it pays for changes its place in any comparison/);
  assert.match(code("src/app/about/page.tsx").replace(/\s+/g, " "), /including a store on the Stores plan/);
});

// ── Ops ──────────────────────────────────────────────────────────────────────

const deps = (storePlans?: NonNullable<OpsDeps["db"]>["storePlans"]): OpsDeps =>
  ({ now: NOW, env: {}, db: storePlans ? ({ storePlans } as unknown as OpsDeps["db"]) : null }) as unknown as OpsDeps;

test("ops: a paid plan unlinked for over two days warns; none is fine; no database is unknown", async () => {
  assert.equal((await storePlansUnlinked(deps())).severity, "unknown");
  assert.equal((await storePlansUnlinked(deps(async () => ({ total: 0, unlinked: [] })))).severity, "ok");
  const fresh = { storeName: "Fresh", createdAt: new Date(NOW.getTime() - DAY), activeUntil: new Date(NOW.getTime() + 20 * DAY) };
  assert.equal((await storePlansUnlinked(deps(async () => ({ total: 1, unlinked: [fresh] })))).severity, "ok");
  const old = { storeName: "Old Shop", createdAt: new Date(NOW.getTime() - 3 * DAY), activeUntil: new Date(NOW.getTime() + 20 * DAY) };
  const r = await storePlansUnlinked(deps(async () => ({ total: 2, unlinked: [fresh, old] })));
  assert.equal(r.severity, "warn");
  assert.match(r.summary, /A store paid for the Stores plan and has no report yet/);
  assert.match(r.summary, /Old Shop/);
  assert.match(r.action!, /\/admin\/store-partners/);
  assert.equal((await storePlansUnlinked(deps(async () => { throw new Error("down"); }))).severity, "unknown");
  assert.match(code("src/lib/ops/checks.ts"), /await add\("stores:unlinked", "money", [^)]*\(\) => storePlansUnlinked\(d\)\);/);
});

test("ops: STRIPE_STORE_PRICE_ID is required once any Stores plan exists, and only then", () => {
  const env = { AUTH_SECRET: "a", CRON_SECRET: "b", STRIPE_SECRET_KEY: "c" };
  assert.ok(!missingEnv(env).includes("STRIPE_STORE_PRICE_ID"));
  assert.ok(!missingEnv(env, { storePlanSubscriptions: 0 }).includes("STRIPE_STORE_PRICE_ID"));
  assert.ok(!missingEnv(env, { storePlanSubscriptions: null }).includes("STRIPE_STORE_PRICE_ID"));
  assert.ok(missingEnv(env, { storePlanSubscriptions: 1 }).includes("STRIPE_STORE_PRICE_ID"));
  assert.ok(!missingEnv({ ...env, STRIPE_STORE_PRICE_ID: "price_x" }, { storePlanSubscriptions: 1 }).includes("STRIPE_STORE_PRICE_ID"));
  assert.match(code("src/app/api/cron/ops-notify/route.ts"), /storePlanSubscription\.count\(\)\.catch\(\(\) => null\)/);
});

test("Stores plan data is private: never exported to data/public", async () => {
  const { PUBLIC_MODELS } = await import("../src/lib/public-data/models");
  for (const m of ["StorePlanSubscription", "StorePartner"]) assert.ok(!(PUBLIC_MODELS as readonly string[]).includes(m), m);
});
