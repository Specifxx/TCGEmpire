import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CONSULT_PRICE_CENTS,
  CONSULT_CURRENCY,
  CONSULT_MARKETS,
  normalizeStoreUrl,
  validateConsultBooking,
} from "../src/lib/consulting";
import { NAV_GROUPS, FOOTER_GROUPS } from "../src/components/nav-groups";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const readCode = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const ROUTE = "src/app/api/stores/consulting/route.ts";
const WEBHOOK = "src/app/api/marketplace/stripe/webhook/route.ts";
const PAGE = "src/app/stores/consulting/page.tsx";
const CONFIRMED = "src/app/stores/consulting/confirmed/page.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// Paid store consulting (/stores/consulting) — the first thing on this site a
// BUSINESS buys rather than a player, and the first one-off (non-subscription)
// Stripe charge. Most of what can go wrong here costs real money in both
// directions: charging without booking, or booking without charging.
// ─────────────────────────────────────────────────────────────────────────────

test("the price a store is QUOTED and the price Stripe is CHARGED come from one constant", () => {
  // The whole reason lib/consulting.ts exists. A literal 25000 or "$250" in
  // either the page or the route is a second source of truth that will one day
  // disagree with the other — and the losing side is either a store being
  // overcharged or us undercharging.
  for (const rel of [ROUTE, PAGE]) {
    const src = readCode(rel);
    assert.match(src, /from "@\/lib\/consulting"/, `${rel} must read the price from lib/consulting`);
    assert.doesNotMatch(src, /\b25_?000\b/, `${rel} must not hard-code the amount`);
  }
  const route = readCode(ROUTE);
  assert.match(route, /unit_amount:\s*CONSULT_PRICE_CENTS/, "Stripe must be charged the shared constant");
  assert.match(route, /currency:\s*CONSULT_CURRENCY/, "…in the shared currency");
});

test("the booking is charged as a one-off payment, not a subscription", () => {
  const src = readCode(ROUTE);
  assert.match(src, /mode:\s*"payment"/, "a consulting session is a one-off — subscription mode would bill it monthly");
  assert.doesNotMatch(src, /mode:\s*"subscription"/);
});

test("a store gets a real tax invoice, which needs BOTH invoice_creation and a customer", () => {
  // invoice_creation with no customer silently produces no invoice at all —
  // the store pays and gets nothing their bookkeeper accepts, which is the
  // single most likely way this feature disappoints a paying business.
  const src = readCode(ROUTE);
  assert.match(src, /invoice_creation:\s*\{\s*enabled:\s*true/, "one-off payments need invoice_creation to produce an invoice");
  assert.match(src, /customer_creation:\s*"always"/, "no customer object means invoice_creation generates nothing");
  // Both required for a compliant invoice, and the tax id is what lets a
  // business print their ABN/GST/VAT number on it.
  assert.match(src, /billing_address_collection:\s*"required"/);
  assert.match(src, /tax_id_collection:\s*\{\s*enabled:\s*true\s*\}/);
});

test("the booking row is written BEFORE Stripe, so an abandoned checkout still leaves the lead", () => {
  const src = readCode(ROUTE);
  const createAt = src.indexOf("prisma.consultBooking.create");
  const checkoutAt = src.indexOf("checkout.sessions.create");
  assert.ok(createAt >= 0, "the route must create a ConsultBooking");
  assert.ok(checkoutAt >= 0, "the route must create a Checkout Session");
  assert.ok(createAt < checkoutAt, "the DB row must exist before the Stripe session that references it");
  // The session must carry the id back, or the webhook can't find the row.
  assert.match(src, /metadata:\s*\{\s*kind:\s*"store_consult",\s*bookingId/);
});

test("the amount is recorded on the booking, never read back from config", () => {
  // A price change must not silently rewrite what past stores were charged.
  const schema = read("prisma/schema.prisma");
  const model = schema.slice(schema.indexOf("model ConsultBooking {"));
  const body = model.slice(0, model.indexOf("\n}"));
  assert.match(body, /amountCents\s+Int/, "the charged amount is stored per booking");
  assert.match(body, /stripeSessionId\s+String\?\s+@unique/, "unique, so a replayed webhook can't double-book");
  assert.match(body, /status\s+String\s+@default\("pending"\)/, "rows start pending — only the webhook marks them paid");
});

test("the webhook refuses to mark a booking paid until the payment actually cleared", () => {
  // checkout.session.completed fires when the customer finishes the Checkout
  // UI, which is NOT the same as money moving — the exact distinction that
  // cost this codebase the churchless incident on the subscription path.
  const src = readCode(WEBHOOK);
  const fn = src.slice(src.indexOf("async function consultBookingPaid"));
  assert.ok(fn.length > 0, "the webhook must handle store_consult sessions");
  assert.match(fn, /payment_status !== "paid"/, "must check payment_status before granting anything");
  assert.match(fn, /return;/, "…and bail out when it hasn't cleared");
  // Idempotency: both event types can fire for one session, and Stripe retries.
  assert.match(fn, /updateMany\(/, "must use a scoped update so a replay changes nothing");
  assert.match(fn, /status:\s*\{\s*not:\s*"paid"\s*\}/, "the scope is what makes a retried event a no-op");
  assert.match(fn, /updated\.count === 0/, "…and no rows changed must mean no duplicate emails");
});

test("the webhook routes by metadata.kind, so one endpoint still serves Premium and consulting", () => {
  const src = readCode(WEBHOOK);
  assert.match(src, /kind === "premium"/, "the premium branch must survive");
  assert.match(src, /kind === "store_consult"/, "the consulting branch is additive, not a replacement");
});

test("the confirmation page verifies the session and records nothing", () => {
  // A success_url is attacker-reachable: anyone can paste one. It may confirm,
  // it may never grant, and it must never be the thing that marks money taken.
  const src = readCode(CONFIRMED);
  assert.match(src, /checkout\.sessions\.retrieve/, "must re-read the session from Stripe, not trust the param");
  assert.match(src, /metadata\?\.kind !== "store_consult"/, "…and check it's actually one of ours");
  assert.doesNotMatch(src, /consultBooking\.(update|create|updateMany)/, "the success page must never write the booking — the webhook owns that");
  assert.match(src, /payment_status/, "must tell the truth about a payment that hasn't settled");
});

test("the sales page promises nothing the data can't deliver", () => {
  // Same editorial rule the rest of the site is held to: never describe a
  // mechanism (or an outcome) we don't actually produce. A consulting page is
  // where that discipline is most tempting to drop.
  const src = readCode(PAGE);
  assert.doesNotMatch(src, /\bguarantee(d|s)?\b/i, "no outcome guarantees — nobody can promise a store more sales");
  assert.doesNotMatch(src, /\bdouble your\b|\bincrease (your )?(sales|revenue|profit) by\b/i, "no invented uplift numbers");
  assert.doesNotMatch(src, /\brisk[- ]free\b/i, "the refund is stated plainly instead");
  // …and it states the three things it ISN'T, which is the part that keeps the
  // comparison's neutrality credible to every store that DIDN'T pay.
  assert.match(src, /What this isn&apos;t/, "the page must keep its explicit limits section");
  assert.match(src, /Not paid placement/, "booking must never be implied to change public ranking");
});

test("booking needs no account — the buyer is a shop owner, not a site member", () => {
  const src = readCode(ROUTE);
  assert.doesNotMatch(src, /getCurrentUser/, "requiring sign-in would wall off the highest-value action on the site");
  assert.match(src, /rateLimit\(/, "…which is exactly why it must be rate-limited instead");
});

// ── The validator, exercised for real (lib/consulting.ts imports cleanly) ────

test("validateConsultBooking requires the three things a session can't run without", () => {
  const base = { storeName: "Dragon's Den", contactName: "Alex", email: "alex@dragonsden.com.au" };
  assert.equal(validateConsultBooking(base).ok, true);

  for (const missing of ["storeName", "contactName", "email"] as const) {
    const input: Record<string, string> = { ...base };
    delete input[missing];
    const res = validateConsultBooking(input);
    assert.equal(res.ok, false, `${missing} must be required`);
    assert.ok(res.error, "a rejection must explain itself to the store");
  }

  assert.equal(validateConsultBooking({ ...base, email: "not-an-email" }).ok, false, "a typo'd email loses the booking");
});

test("everything except name/contact/email is optional — a phone booking between customers still works", () => {
  const res = validateConsultBooking({
    storeName: "Dragon's Den",
    contactName: "Alex",
    email: "alex@dragonsden.com.au",
  });
  assert.equal(res.ok, true);
  assert.equal(res.value?.storeUrl, null, "no URL is fine — we can ask on the call");
  assert.equal(res.value?.goals, "");
  assert.equal(res.value?.country, "AU", "an unspecified market falls back, never rejects");
});

test("a mistyped store URL is caught at booking, not discovered on the call", () => {
  const base = { storeName: "D", contactName: "A", email: "a@b.co" };
  assert.equal(validateConsultBooking({ ...base, storeUrl: "not a url" }).ok, false);
  // …but a bare hostname, which is what people actually type, is accepted and
  // normalised to the same shape /api/stores/suggest stores.
  const ok = validateConsultBooking({ ...base, storeUrl: "www.DragonsDen.com.au/collections/riftbound" });
  assert.equal(ok.ok, true);
  assert.equal(ok.value?.storeUrl, "https://dragonsden.com.au");
});

test("normalizeStoreUrl strips www, lowercases, and rejects non-hosts", () => {
  assert.equal(normalizeStoreUrl("https://www.Example.com/path?q=1"), "https://example.com");
  assert.equal(normalizeStoreUrl("example.com"), "https://example.com");
  assert.equal(normalizeStoreUrl(""), null);
  assert.equal(normalizeStoreUrl("localhost"), null, "no dot — not a real store domain");
});

test("free-text fields are length-capped before they reach the database", () => {
  const res = validateConsultBooking({
    storeName: "x".repeat(500),
    contactName: "y".repeat(500),
    email: "a@b.co",
    goals: "g".repeat(5000),
    preferredTimes: "t".repeat(5000),
  });
  assert.equal(res.ok, true);
  assert.ok(res.value!.storeName.length <= 120);
  assert.ok(res.value!.goals.length <= 2000);
  assert.ok(res.value!.preferredTimes.length <= 500);
});

test("the market list matches what /api/stores/suggest already accepts", () => {
  // Two different store-facing forms offering two different country lists is
  // the kind of drift nobody notices until a store picks one that isn't there.
  const suggest = read("src/app/api/stores/suggest/route.ts");
  for (const m of CONSULT_MARKETS) {
    assert.match(suggest, new RegExp(`"${m}"`), `suggest route must also accept ${m}`);
  }
});

test("the defaults are a real, sane product: $250 AUD", () => {
  assert.equal(CONSULT_PRICE_CENTS, 25_000);
  assert.equal(CONSULT_CURRENCY, "aud");
});

// ── Reachability (2026-09-21) ────────────────────────────────────────────────
// Both /stores pages existed for weeks with NOTHING in the navigation pointing
// at them — a B2B product a store owner could only reach by guessing the URL.
// These pin the fix, because a nav group is exactly the kind of thing a later
// re-bucketing quietly drops.

test("the store-facing pages are reachable from the navigation at all", () => {
  const hrefs = NAV_GROUPS.flatMap((g) => g.links.map((l) => l.href));
  for (const href of ["/stores", "/stores/consulting"]) {
    assert.ok(hrefs.includes(href), `${href} must be in NAV_GROUPS — it feeds the rail, phone menu, ⌘K and llms.txt`);
  }
  // …and in the footer, which is where a business reader actually looks for a
  // "for retailers" link. FOOTER_GROUPS is DERIVED from NAV_GROUPS, so a new
  // group that no column consumes vanishes from the footer silently.
  const footer = FOOTER_GROUPS.flatMap((g) => g.links.map((l) => l.href));
  for (const href of ["/stores", "/stores/consulting"]) {
    assert.ok(footer.includes(href), `${href} must land in a footer column, not be dropped by the derivation`);
  }
});

test("the B2B links live in their own group, not buried under Help", () => {
  const group = NAV_GROUPS.find((g) => g.links.some((l) => l.href === "/stores/consulting"));
  assert.ok(group, "expected a group carrying the consulting link");
  assert.equal(group!.title, "For stores", "a shop owner should not have to look under Help or Prices");
  // The rail identifies a group by silhouette alone, so a shared icon would
  // make this group unidentifiable at 4rem (tests/nav-icon.test.ts pins the
  // general rule; this pins that THIS group brought its own).
  assert.equal(group!.icon, "store");
});

test("the store pages that a retailer actually lands on point back at the B2B hub", () => {
  // Someone reading /stores/<their own shop> or the tracked list is the most
  // qualified B2B visitor the site gets; before this both were dead ends.
  for (const rel of ["src/app/stores/[slug]/page.tsx", "src/app/stores/tracked/page.tsx"]) {
    assert.match(readCode(rel), /href="\/stores"/, `${rel} must offer the retailer a way into /stores`);
  }
});

test("the player-facing store pages stay where players look for them", () => {
  // The tidy-looking move is to pull every /stores/* path into the new group.
  // It would bury the two that PLAYERS read — "which stores do you compare?"
  // and "you're missing my local" — so this pins them out of it.
  const forStores = NAV_GROUPS.find((g) => g.title === "For stores");
  const hrefs = forStores!.links.map((l) => l.href);
  assert.ok(!hrefs.includes("/stores/tracked"), "/stores/tracked is read by shoppers — it belongs under Prices");
  assert.ok(!hrefs.includes("/stores/suggest"), "/stores/suggest is mostly shoppers reporting a missing store — it belongs under Help");
});
