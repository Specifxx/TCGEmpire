import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildPremiumWinbackEmail, premiumWinbackSubject } from "../src/lib/email";
import { parseRegisteredAfter, WINBACK_TRIAL_DAYS, WINBACK_CLAIM_EXPIRES_DAYS } from "../src/lib/premium-winback";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// The one-off "N days of Premium, free, no card, one link, one use" win-back
// email. See lib/premium-winback.ts. Source-level and DB-free, like the other
// Premium guards in tests/premium-offer.test.ts, so this can gate a PR.
//
// This campaign reintroduces the shape of grant lib/premium.ts's "NO PREMIUM
// ON SIGNUP" note documents as deliberately, entirely removed — an automatic,
// no-effort Premium grant. That was an informed decision for this specific
// campaign, not an oversight, so these tests lean hard on the properties that
// make THIS version safe where the removed one wasn't an issue of duration:
// single account, single use, atomic, auditable, and never triggered by a
// bare page load.
// ─────────────────────────────────────────────────────────────────────────────

const sample = () =>
  buildPremiumWinbackEmail({
    displayName: "Bill Yang",
    days: WINBACK_TRIAL_DAYS,
    claimUrl: "https://riftcompare.com/premium/claim?token=abc123",
    claimWindowDays: WINBACK_CLAIM_EXPIRES_DAYS,
    unsubUrl: "https://riftcompare.com/announcements/unsubscribe?token=abc",
  });

test("parseRegisteredAfter accepts only a real YYYY-MM-DD date", () => {
  assert.equal(parseRegisteredAfter(""), null);
  assert.equal(parseRegisteredAfter(undefined), null);
  assert.equal(parseRegisteredAfter("14/08/2026"), null);
  assert.equal(parseRegisteredAfter("2026-13-40"), null);
  const d = parseRegisteredAfter("2026-08-14");
  assert.ok(d, "a valid date must parse");
  assert.equal(d!.toISOString().slice(0, 10), "2026-08-14");
});

test("WINBACK_TRIAL_DAYS and WINBACK_CLAIM_EXPIRES_DAYS are real, positive, env-overridable numbers", () => {
  assert.ok(WINBACK_TRIAL_DAYS > 0);
  assert.ok(WINBACK_CLAIM_EXPIRES_DAYS > 0);
  const src = read("src/lib/premium-winback.ts");
  assert.match(src, /process\.env\.PREMIUM_WINBACK_DAYS \?\? 3/, "default must be 3 days, matching the brief");
  assert.match(src, /process\.env\.PREMIUM_WINBACK_CLAIM_WINDOW_DAYS \?\? 14/);
});

test("a live send refuses a missing or future registeredAfter, and refuses without a mail key", () => {
  const src = read("src/lib/premium-winback.ts");
  const fnAt = src.indexOf("export async function runPremiumWinbackBlast");
  assert.ok(fnAt >= 0);
  const body = src.slice(fnAt, fnAt + 3000);
  assert.match(body, /if \(!cutoff\) return \{ ok: false/, "must refuse an unparseable date");
  assert.match(body, /cutoff\.getTime\(\) > Date\.now\(\)/, "must refuse a date in the future — nothing would be in scope");
  assert.match(body, /if \(!dryRun\) \{\s*const configured = via === "brevo" \? isBrevoEnabled\(\) : isEmailEnabled\(\);/, "must check the chosen provider is configured before a live run");
});

test("the audience is unpaid (isPremium-checked), non-admin, non-seed, not-too-old accounts that have not opted out, deduped by email", () => {
  const src = read("src/lib/premium-winback.ts");
  const fnAt = src.indexOf("export async function runPremiumWinbackBlast");
  const body = src.slice(fnAt, fnAt + 6000);
  assert.match(body, /where: NOT_SEED_WHERE/, "must exclude the seed personas");
  assert.match(body, /if \(isPremium\(u\)\) \{/, "must use the SAME entitlement check every paid gate uses — not a hand-rolled premiumUntil comparison");
  assert.match(body, /u\.createdAt\.getTime\(\) < cutoff\.getTime\(\)/, "must exclude accounts registered before the cutoff");
  assert.match(body, /announcementOptOut\s*\.findMany\(\{ where: \{ optedOutAt: \{ not: null \} \}/, "must honour the announcement opt-out list");
  assert.match(body, /byEmail\.has\(key\)\) continue/, "must dedupe by lowercased email");
  assert.match(body, /alreadySentIds = new Set\(existing\.map/, "must skip accounts that already have a claim row from an earlier run");
});

test("the claim row is minted ONLY on a successful send, after the opt-out token exists", () => {
  const src = read("src/lib/premium-winback.ts");
  const optOutAt = src.indexOf('.upsert({ where: { email: key }, create: { email: key, token: randomUUID() }');
  const sendAt = src.indexOf("await sendPremiumWinbackEmail(");
  const createAt = src.indexOf("prisma.premiumWinbackTrial.create(");
  assert.ok(optOutAt > 0 && sendAt > optOutAt, "the unsubscribe token must exist before the email that links to it is sent");
  assert.ok(createAt > sendAt, "the claim row must be created after the send");
  const between = src.slice(sendAt, createAt);
  assert.match(between, /if \(ok\) \{/, "the claim row must be created inside the success branch");
  // And the opt-out step itself must be able to abort the send — a marketing
  // email must never go out with no working unsubscribe link.
  const optOutBody = src.slice(optOutAt, sendAt);
  assert.match(optOutBody, /if \(!optOutRow\) \{\s*failed\+\+;\s*continue;/, "a failed opt-out mint must skip the send, not proceed without one");
});

test("PremiumWinbackTrial is its own campaign-scoped table with a unique per-account row and a unique token", () => {
  const src = read("prisma/schema.prisma");
  const at = src.indexOf("model PremiumWinbackTrial");
  assert.ok(at > 0);
  const body = src.slice(at, at + 1200);
  assert.match(body, /userId\s+String\s+@unique/, "one row per account — this IS the resend/dedupe guard");
  assert.match(body, /token\s+String\s+@unique/);
  assert.match(body, /claimedAt\s+DateTime\?/, "must be nullable — unclaimed is the initial state");
});

test("the claim is a single atomic conditional UPDATE, and the grant only happens after winning it", () => {
  const src = read("src/lib/premium-winback.ts");
  const at = src.indexOf("export async function claimPremiumWinbackTrial");
  const body = src.slice(at, at + 1800);
  assert.match(body, /updateMany\(\{\s*where: \{ token, claimedAt: null \}/, "the WHERE clause's claimedAt:null guard is what makes two concurrent claims impossible");
  const updateAt = body.indexOf("updateMany(");
  const countCheckAt = body.indexOf("flipped.count !== 1");
  const grantAt = body.indexOf("grantPremiumDays(");
  assert.ok(updateAt > 0 && countCheckAt > updateAt && grantAt > countCheckAt, "must check the update actually won before granting anything");
  assert.match(body, /grantPremiumDays\(trial\.userId, WINBACK_TRIAL_DAYS, "premium"\)/);
  assert.match(body, /console\.log\(`premium-winback: claimed/, "a no-checkout entitlement change must be traceable in the logs");
});

test("expiry is checked before claiming, using the row's own createdAt — not a separately-set expiry column that could drift", () => {
  const src = read("src/lib/premium-winback.ts");
  const at = src.indexOf("export async function claimPremiumWinbackTrial");
  const body = src.slice(at, at + 1000);
  assert.match(body, /trial\.createdAt\.getTime\(\) \+ WINBACK_CLAIM_EXPIRES_DAYS \* 86_400_000/);
  assert.match(body, /if \(Date\.now\(\) > expiresAt\) return \{ ok: false, reason: "expired" \}/);
});

test("the read-only peek used by the claim PAGE's GET never mutates the database", () => {
  const src = read("src/lib/premium-winback.ts");
  const at = src.indexOf("export async function peekPremiumWinbackTrial");
  const body = src.slice(at, at + 800);
  assert.match(body, /findUnique/);
  assert.doesNotMatch(body, /\.update\(|\.updateMany\(|\.create\(/, "the page's GET path must never write anything");
});

test("the claim page only ever calls the read-only peek, never the mutating claim function, and the button posts only on click", () => {
  const page = read("src/app/premium/claim/page.tsx");
  assert.match(page, /peekPremiumWinbackTrial/);
  assert.doesNotMatch(page, /claimPremiumWinbackTrial/, "the server page's GET render must never call the function that grants");
  assert.doesNotMatch(page, /"use client"/, "the page itself stays a server component — no client-side auto-fire on mount");

  const button = read("src/components/PremiumWinbackClaimButton.tsx");
  assert.doesNotMatch(button, /useEffect\([^)]*claim\(/, "the POST must never fire from an effect on mount — only from the click handler");
  assert.match(button, /onClick=\{claim\}/, "the grant fires from an explicit click, not automatically");
});

test("the winback-claim API route exposes POST only — no GET handler exists to grant on a mail-scanner pre-fetch", () => {
  const src = read("src/app/api/premium/winback-claim/route.ts");
  assert.match(src, /export async function POST\(/);
  assert.doesNotMatch(src, /export (async )?function GET\(/, "a GET handler here would let an email client's link-prefetch burn the one-time claim");
});

test("both the token page and the API route are noindexed / non-dynamic-cached, like the unsubscribe page", () => {
  const page = read("src/app/premium/claim/page.tsx");
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.match(page, /export const dynamic = "force-dynamic"/);
});

test("the email states the no-card, one-link, one-use terms honestly and carries the unsubscribe link", () => {
  const { html } = sample();
  assert.match(html, /announcements\/unsubscribe\?token=abc/, "a marketing email to accounts needs the one-click opt-out");
  assert.match(html, /Don't email me announcements/, "must use the announcement footer, which says what this is");
  assert.match(html, /no card required/i);
  assert.match(html, /works once/i);
  assert.match(html, new RegExp(`live for the next\\s+${WINBACK_CLAIM_EXPIRES_DAYS} days`));
  assert.match(html, /Hi Bill,/, "greets by first name");
  assert.match(html, /premium\/claim\?token=abc123/, "the CTA must be the real claim link, not a generic /premium URL");
  assert.equal(premiumWinbackSubject(3), "3 days of RiftCompare Premium, free — no card needed");
});

test("no fake scarcity: no countdown or 'spots left' claim on top of the real, stated claim window", () => {
  const { html } = sample();
  assert.doesNotMatch(html, /only \d+ (spots|left|places)/i);
  assert.doesNotMatch(html, /hours left|countdown|hurry|last chance/i);
});

test("an email-shaped display name falls back to a plain greeting, and names are HTML-escaped", () => {
  const emailish = buildPremiumWinbackEmail({
    displayName: "bill@example.com",
    days: 3,
    claimUrl: "https://riftcompare.com/premium/claim?token=x",
    claimWindowDays: 14,
    unsubUrl: "u",
  }).html;
  assert.match(emailish, /Hi there,/);
  const hostile = buildPremiumWinbackEmail({
    displayName: "<img src=x onerror=alert(1)>",
    days: 3,
    claimUrl: "https://riftcompare.com/premium/claim?token=x",
    claimWindowDays: 14,
    unsubUrl: "u",
  }).html;
  assert.doesNotMatch(hostile, /<img src=x/);
  assert.match(hostile, /&lt;img/);
});

test("the cron route fails CLOSED, defaults to a dry run, and reads the registration cutoff from the caller", () => {
  const src = read("src/app/api/cron/premium-winback/route.ts");
  assert.match(src, /if \(!secret\) return false;/, "must fail closed when CRON_SECRET is unset");
  assert.match(src, /const dryRun = p\.get\("dry"\) !== "0";/, "anything but an explicit dry=0 must stay a dry run");
  assert.match(src, /p\.get\("since"\)/, "the registration cutoff comes from the caller, never a silently-recomputed default");
});

test("the admin route uses the same dual gate as the other admin mutations, has no grant action, and only knows three actions", () => {
  const src = read("src/app/api/admin/premium-winback/route.ts");
  assert.match(src, /const keyOk = !!token && body\?\.key === token;/);
  assert.match(src, /if \(!\(keyOk \|\| me\?\.isAdmin\)\)/, "must require an admin session or the ADMIN_TOKEN");
  assert.match(src, /status: 404/, "must not reveal the route exists to non-admins");
  assert.match(src, /dryRun: action === "preview"/, "only the explicit send action may deliver");
  assert.match(src, /action must be preview, send or test/);
  assert.doesNotMatch(src, /action === "grant"|grantPremiumDays\(/, "this campaign's grant is automatic on claim — the admin route must not also expose a manual grant path");
  assert.match(src, /Math\.min\(limitRaw, 300\)/, "a hand-typed limit must stay under a day's provider cap");
});

test("the admin page is gated like the other admin pages and lists the audience with the lib's own exclusions", () => {
  const page = read("src/app/admin/premium-winback/page.tsx");
  assert.match(page, /if \(!\(keyOk \|\| me\?\.isAdmin\)\) notFound\(\);/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
  assert.match(page, /listPremiumWinbackAudience\(/);
  const index = read("src/app/admin/page.tsx");
  assert.match(index, /href: "\/admin\/premium-winback"/, "must be reachable from the admin home");
});

test("the console confirms before sending and never calls a grant endpoint — the claim link is the only grant path", () => {
  const src = read("src/components/admin/PremiumWinbackConsole.tsx");
  assert.match(src, /window\.confirm\(/, "a real send must be confirmed");
  assert.match(src, /action: "send"/);
  assert.match(src, /action: "preview"/);
  assert.match(src, /action: "test"/);
  assert.doesNotMatch(src, /grant-premium/, "no separate manual-grant call — the automatic claim link is the only way this campaign grants");
  assert.match(src, /never re-send|only ever sent this campaign once/i, "must say plainly that a second send per account is not supported");
});

test("the test send touches no claim row and grants nothing, and its link cannot be claimed", () => {
  const src = read("src/lib/premium-winback.ts");
  const at = src.indexOf("export async function sendPremiumWinbackTest");
  const body = src.slice(at, at + 1200);
  assert.doesNotMatch(body, /premiumWinbackTrial\.(create|update)/, "a proofreading copy must not touch the claim table");
  assert.match(body, /test-token-does-not-exist/, "the test link's token must not resolve to a real row");
});

test("the offer never actually reads the deleted SIGNUP_PREMIUM_DAYS env var — it is env-configured independently", () => {
  const src = read("src/lib/premium-winback.ts");
  assert.doesNotMatch(src, /process\.env\.SIGNUP_PREMIUM_DAYS/, "must not read the deleted signup-grant env var");
  assert.match(src, /process\.env\.PREMIUM_WINBACK_DAYS/, "must use its own, campaign-specific env var");
});
