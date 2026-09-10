import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildPremiumOfferEmail, premiumOfferSubject } from "../src/lib/email";
import { PREMIUM_OFFER_DAYS, formatOfferEnds, parseOfferEnds } from "../src/lib/premium-offer";
import { PREMIUM_PRICE_AMOUNT, premiumFromLine } from "../src/lib/site";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// The one-off "a full month of Premium, on us" email to free-tier accounts.
// See lib/premium-offer.ts. Source-level and DB-free, like the other Premium
// guards in tests/premium-conversion.test.ts, so this can gate a PR.
// ─────────────────────────────────────────────────────────────────────────────

const sample = (trialDays: number) =>
  buildPremiumOfferEmail(
    {
      displayName: "Bill Yang",
      trialDays,
      offerDays: PREMIUM_OFFER_DAYS,
      offerEnds: "30 September 2026",
      unsubUrl: "https://riftcompare.com/announcements/unsubscribe?token=abc",
    },
    premiumFromLine(),
  );

test("parseOfferEnds accepts only a real YYYY-MM-DD date", () => {
  assert.equal(parseOfferEnds(""), null);
  assert.equal(parseOfferEnds(undefined), null);
  assert.equal(parseOfferEnds("30/09/2026"), null);
  assert.equal(parseOfferEnds("2026-13-40"), null);
  const d = parseOfferEnds("2026-09-30");
  assert.ok(d, "a valid date must parse");
  assert.equal(formatOfferEnds(d!), "30 September 2026");
});

test("a live send refuses a missing or past deadline, and refuses without a mail key", () => {
  const src = read("src/lib/premium-offer.ts");
  const fnAt = src.indexOf("export async function runPremiumOfferBlast");
  assert.ok(fnAt >= 0);
  const body = src.slice(fnAt, fnAt + 5000);
  assert.match(body, /if \(!ends\) return \{ ok: false/, "must refuse an unparseable deadline");
  assert.match(body, /ends\.getTime\(\) < Date\.now\(\)/, "must refuse a deadline in the past — the offer would be a lie");
  assert.match(body, /if \(!dryRun\) \{\s*const configured = via === "brevo" \? isBrevoEnabled\(\) : isEmailEnabled\(\);/, "must check the chosen provider is configured before a live run");
});

test("the audience is free-tier, non-admin, non-seed accounts that have not opted out, deduped by email", () => {
  const src = read("src/lib/premium-offer.ts");
  const fnAt = src.indexOf("export async function runPremiumOfferBlast");
  const body = src.slice(fnAt, fnAt + 6000);
  assert.match(body, /where: NOT_SEED_WHERE/, "must exclude the seed personas");
  assert.match(body, /u\.isAdmin \|\| \(u\.premiumUntil && u\.premiumUntil > now\)/, "must exclude admins and anyone currently Premium");
  assert.match(body, /announcementOptOut\s*\.findMany\(\{ where: \{ optedOutAt: \{ not: null \} \}/, "must honour the announcement opt-out list");
  assert.match(body, /byEmail\.has\(key\)\) continue/, "must dedupe by lowercased email");
  assert.match(body, /alreadySent: u\.premiumOfferSentAt != null/, "must skip accounts already stamped by an earlier run");
});

test("the send is idempotent: stamped ONLY on success, and the opt-out token is minted before sending", () => {
  const src = read("src/lib/premium-offer.ts");
  const upsertAt = src.indexOf("announcementOptOut\n      .upsert");
  const sendAt = src.indexOf("await sendPremiumOfferEmail(");
  const stampAt = src.indexOf("data: { premiumOfferSentAt: new Date() }");
  assert.ok(upsertAt > 0 && sendAt > upsertAt, "the unsubscribe token must exist before the email that links to it is sent");
  assert.ok(stampAt > sendAt, "the dedupe stamp must be written after the send");
  const between = src.slice(sendAt, stampAt);
  assert.match(between, /if \(ok\) \{/, "the stamp must sit inside the success branch");
});

test("User.premiumOfferSentAt is additive — nullable, no default", () => {
  const src = read("prisma/schema.prisma");
  assert.match(src, /premiumOfferSentAt\s+DateTime\?/, "must be nullable so `prisma db push` can add it with no backfill");
});

test("both wordings carry the unsubscribe link, the real price, the deadline and the by-hand mechanism", () => {
  for (const trialDays of [14, 0]) {
    const { html } = sample(trialDays);
    assert.match(html, /announcements\/unsubscribe\?token=abc/, "a marketing email to accounts needs the one-click opt-out");
    assert.match(html, /Don't email me announcements/, "must use the announcement footer, which says what this is");
    assert.ok(html.includes(premiumFromLine()), "the price must be premiumFromLine(), not a typed number");
    assert.ok(html.includes(PREMIUM_PRICE_AMOUNT), "the real monthly price must be stated");
    assert.match(html, /before 30 September 2026/, "the deadline must be a stated date");
    assert.match(html, /by hand/, "must say the extension is applied manually, so nobody expects checkout to grant it");
    assert.match(html, /\/premium\?src=offer/, "the CTA must carry the attribution param the beacon reads");
    assert.match(html, /Hi Bill,/, "greets by first name");
    assert.match(html, /No ads on any page/);
  }
});

test("the trial wording and the no-trial wording differ where the truth differs", () => {
  const withTrial = sample(14).html;
  const noTrial = sample(0).html;
  assert.match(withTrial, /14-day free trial/);
  assert.match(withTrial, /\$0 today/, "with a trial, day one really costs nothing");
  assert.doesNotMatch(noTrial, /\$0 today/, "without a trial, checkout charges immediately — '$0 today' would be false");
  assert.match(noTrial, /already used a free trial/);
  assert.match(noTrial, /free month on top/);
  assert.notEqual(premiumOfferSubject({ trialDays: 14 }), premiumOfferSubject({ trialDays: 0 }));
});

test("no fake scarcity: a real deadline, never a countdown or a 'spots left' claim", () => {
  const { html } = sample(14);
  assert.doesNotMatch(html, /only \d+ (spots|left|places)/i);
  assert.doesNotMatch(html, /hours left|countdown|hurry|last chance/i);
});

test("an email-shaped display name falls back to a plain greeting, and names are HTML-escaped", () => {
  const emailish = buildPremiumOfferEmail(
    { displayName: "bill@example.com", trialDays: 0, offerDays: 30, offerEnds: "1 October 2026", unsubUrl: "u" },
    premiumFromLine(),
  ).html;
  assert.match(emailish, /Hi there,/);
  const hostile = buildPremiumOfferEmail(
    { displayName: "<img src=x onerror=alert(1)>", trialDays: 0, offerDays: 30, offerEnds: "1 October 2026", unsubUrl: "u" },
    premiumFromLine(),
  ).html;
  assert.doesNotMatch(hostile, /<img src=x/);
  assert.match(hostile, /&lt;img/);
});

test("the cron route fails CLOSED, defaults to a dry run, and requires the deadline param", () => {
  const src = read("src/app/api/cron/premium-offer/route.ts");
  assert.match(src, /if \(!secret\) return false;/, "must fail closed when CRON_SECRET is unset");
  assert.match(src, /const dryRun = p\.get\("dry"\) !== "0";/, "anything but an explicit dry=0 must stay a dry run");
  assert.match(src, /p\.get\("until"\)/, "the deadline comes from the caller, never a default");
});

test("the workflow is dispatch-only, defaults dry_run to true, requires the deadline, and fails loudly without CRON_SECRET", () => {
  const src = read(".github/workflows/premium-offer-email.yml");
  assert.doesNotMatch(src, /^\s*schedule:/m, "a one-off blast must never be on a schedule");
  assert.match(src, /dry_run:[\s\S]*?default: true/, "the Run-workflow button must not blast by accident");
  assert.match(src, /offer_ends:[\s\S]*?required: true/);
  assert.match(src, /::error::No CRON_SECRET secret set/);
  assert.match(src, /api\/cron\/premium-offer\?until=/, "must call the real endpoint with the deadline");
  assert.match(src, /concurrency:[\s\S]*?group: premium-offer-email/, "two overlapping blasts is how people get double-emailed");
});

test('"offer" is a valid premium-click source end to end, and the recovery beacon still fires for "recovery"', () => {
  const analytics = read("src/lib/analytics.ts");
  assert.match(analytics, /"recovery" \| "offer"/, "the client-side type union must include offer");
  const route = read("src/app/api/premium/click/route.ts");
  assert.match(route, /"offer"/, "the server-side SOURCES allow-list must include offer");
  const beacon = read("src/components/PremiumRecoveryBeacon.tsx");
  assert.match(beacon, /firePremiumClickBeacon\("offer"\)/);
  assert.match(beacon, /firePremiumClickBeacon\("recovery"\)/, "the existing recovery attribution must keep working");
});

test("the offer never mutates Premium itself — the grant is the owner's manual step", () => {
  const src = read("src/lib/premium-offer.ts");
  assert.doesNotMatch(src, /grantPremium(Days|Months)/, "the email promises a by-hand extension; the code must not silently do it");
  // premiumUntil is READ (to exclude current Premium) but never written: no
  // `data: { … premiumUntil … }` anywhere in the file.
  assert.doesNotMatch(src, /data: \{[^}]*premiumUntil/, "must never write premiumUntil");
  assert.doesNotMatch(src, /from "\.\/stripe"|stripe\(\)/, "must never touch Stripe");
});

// ─────────────────────────────────────────────────────────────────────────────
// The admin console (/admin/premium-offer): choose who, preview, send, test,
// and grant the promised days from the same row.
// ─────────────────────────────────────────────────────────────────────────────

test("a hand-picked selection can narrow the audience but never widen it, and re-send needs a named selection", () => {
  const src = read("src/lib/premium-offer.ts");
  const fnAt = src.indexOf("export async function runPremiumOfferBlast");
  const body = src.slice(fnAt, fnAt + 6000);
  assert.match(body, /const resend = !!opts\.resend && only != null;/, "resend must be inert without userIds — never a second blast to everyone");
  const filterAt = body.indexOf("if (only && !only.has(u.id)) continue;");
  const premiumAt = body.indexOf("if (u.isAdmin || (u.premiumUntil && u.premiumUntil > now))");
  assert.ok(filterAt > 0 && premiumAt > filterAt, "the Premium/admin exclusion must still run on selected accounts");
  assert.match(body, /if \(byEmail\.delete\(o\.email\.trim\(\)\.toLowerCase\(\)\)\) suppressed\+\+;/, "opt-outs must be removed even when selected");
});

test("the admin route uses the same dual gate as the other admin mutations and only knows three actions", () => {
  const src = read("src/app/api/admin/premium-offer/route.ts");
  assert.match(src, /const keyOk = !!token && body\?\.key === token;/);
  assert.match(src, /if \(!\(keyOk \|\| me\?\.isAdmin\)\)/, "must require an admin session or the ADMIN_TOKEN");
  assert.match(src, /status: 404/, "must not reveal the route exists to non-admins");
  assert.match(src, /dryRun: action === "preview"/, "only the explicit send action may deliver");
  assert.match(src, /action must be preview, send or test/);
  assert.match(src, /Math\.min\(limitRaw, 300\)/, "a hand-typed limit must stay under a day's provider cap");
});

test("the admin page is gated like the other admin pages and lists the audience with the lib's own exclusions", () => {
  const page = read("src/app/admin/premium-offer/page.tsx");
  assert.match(page, /if \(!\(keyOk \|\| me\?\.isAdmin\)\) notFound\(\);/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.match(page, /listPremiumOfferAudience\(\)/);
  const lib = read("src/lib/premium-offer.ts");
  const listAt = lib.indexOf("export async function listPremiumOfferAudience");
  const listBody = lib.slice(listAt, listAt + 3000);
  assert.match(listBody, /AND: \[NOT_SEED_WHERE, \{ isAdmin: false \}\]/, "the table must hide seed personas and admins, same as the send");
  assert.match(listBody, /source: "offer"/, "must surface who opened the offer email");
  const index = read("src/app/admin/page.tsx");
  assert.match(index, /href: "\/admin\/premium-offer"/, "must be reachable from the admin home");
});

test("the console confirms before sending, passes the selection through, and grants via the existing admin route", () => {
  const src = read("src/components/admin/PremiumOfferConsole.tsx");
  assert.match(src, /window\.confirm\(/, "a real send must be confirmed");
  assert.match(src, /action: "send", userIds: ids, resend/);
  assert.match(src, /action: "preview"/);
  assert.match(src, /action: "test"/);
  assert.match(src, /fetch\("\/api\/admin\/grant-premium"/, "grants must go through the audited grant route, not a new writer of premiumUntil");
  assert.match(src, /offerDays - trialDays/, "the suggested grant must top a Stripe trial up to the promised total, not double-count it");
  assert.match(src, /already been emailed and will receive it again/, "re-sending to an emailed account must be called out");
});

test("the test send stamps nothing and mints no opt-out row", () => {
  const src = read("src/lib/premium-offer.ts");
  const at = src.indexOf("export async function sendPremiumOfferTest");
  const body = src.slice(at, at + 1500);
  assert.doesNotMatch(body, /prisma\./, "a proofreading copy must not touch the database");
  assert.match(body, /trialDays: PREMIUM_TRIAL_DAYS/);
  assert.match(body, /trialDays: 0/, "both wordings, so both get proofread");
});
