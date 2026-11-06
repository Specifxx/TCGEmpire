import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeSignInEmail, signInLinkUrl, cleanDisplayName } from "../src/lib/email-sign-in";
import { buildSignInLinkEmail } from "../src/lib/email";

// Anyone who pays can reach their account (2026-11-06): a guest who paid with
// Apple Pay on an iCloud address could not sign in with Google or Discord.
// DECISIONS.md, "Anyone who pays can reach their account: emailed sign-in links".
const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

test("addresses are normalised and junk refused", () => {
  assert.equal(normalizeSignInEmail("  M.Maglaya@iCloud.com "), "m.maglaya@icloud.com");
  assert.equal(normalizeSignInEmail("abc@privaterelay.appleid.com"), "abc@privaterelay.appleid.com");
  for (const bad of ["", "nope", "a@b", "a b@c.com", "<a@b.com>", 42, null, `${"a".repeat(250)}@b.com`]) {
    assert.equal(normalizeSignInEmail(bad), null, String(bad));
  }
});

test("the emailed link opens the confirm page, never the API, and keeps only a safe next", () => {
  const u = new URL(signInLinkUrl("tok123", "/premium/welcome?session_id=cs_1"));
  assert.equal(u.pathname, "/login/email");
  assert.equal(u.searchParams.get("token"), "tok123");
  assert.equal(u.searchParams.get("next"), "/premium/welcome?session_id=cs_1");
  assert.equal(new URL(signInLinkUrl("t", "https://evil.example")).searchParams.get("next"), null);
  assert.equal(new URL(signInLinkUrl("t", "//evil.example")).searchParams.get("next"), null);
  assert.equal(new URL(signInLinkUrl("t", "/api/me")).searchParams.get("next"), null);
});

test("a GET never signs in: the consume route is POST only and the page only renders a button", () => {
  const consume = read("src/app/api/auth/email-link/consume/route.ts");
  assert.match(consume, /export async function POST/);
  assert.doesNotMatch(consume, /export async function GET/);
  const page = read("src/app/login/email/page.tsx");
  assert.doesNotMatch(page, /consumeSignInToken|createSession/);
});

test("asking for a link never says whether an account exists, and is rate-limited", () => {
  const route = read("src/app/api/auth/email-link/route.ts");
  assert.match(route, /rateLimit\(`email-link:ip:/);
  assert.match(route, /rateLimit\(`email-link:email:/);
  assert.equal((route.match(/NextResponse\.json\(\{ ok: true \}\)/g) ?? []).length, 1, "one generic ok for every address");
});

test("an unknown address gets no account row until the link is opened, and never an admin one", () => {
  const lib = read("src/lib/email-sign-in.ts");
  const tokenFor = lib.slice(lib.indexOf("export async function signInTokenFor("), lib.indexOf("export async function signInTokenForUser"));
  assert.doesNotMatch(tokenFor, /prisma\.user\.create/);
  assert.match(tokenFor, /if \(isAdminEmail\(email\)\) return null/);
  const consume = lib.slice(lib.indexOf("export async function consumeSignInToken"));
  assert.ok(consume.indexOf("isAdminEmail(email)") < consume.indexOf("prisma.user.create"));
  assert.match(consume, /signupSource: "email_link"/);
});

test("a paid guest checkout emails the sign-in link, best-effort", () => {
  const hook = read("src/app/api/marketplace/stripe/webhook/route.ts");
  assert.match(hook, /signInTokenForUser\(userId\)/);
  assert.match(hook, /paid: true/);
  const e = buildSignInLinkEmail("https://riftcompare.com/login/email?token=x", { paid: true, days: 7 });
  assert.match(e.subject, /Premium is ready/);
  assert.match(e.html, /login\/email\?token=x/);
  assert.match(e.text, /7 days/);
});

test("the sign-in form offers the email link beside Google and Discord", () => {
  const form = read("src/components/AuthForm.tsx");
  assert.match(form, /<EmailSignInForm next=\{next\} \/>/);
  assert.match(read("src/components/EmailSignInForm.tsx"), /\/api\/auth\/email-link/);
});

test("the name step keeps a typed name clean and never overwrites a chosen one", () => {
  assert.equal(cleanDisplayName("  Mathan   M  "), "Mathan M");
  assert.equal(cleanDisplayName("<b>x</b>yz"), "bx/byz");
  assert.equal(cleanDisplayName("a"), null);
  assert.equal(cleanDisplayName("x".repeat(40))?.length, 24);
  const lib = read("src/lib/email-sign-in.ts");
  assert.match(lib, /if \(u\.displayName !== placeholder && u\.displayName !== "Member"\) return;/);
});
