import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), "utf8"));

const callback = read("src/app/api/auth/oauth/[provider]/callback/route.ts");
const authForm = readFileSync(join(ROOT, "src/components/AuthForm.tsx"), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// An OAuth email is a CLAIM until the provider says it verified it.
// ─────────────────────────────────────────────────────────────────────────────
// upsertOAuthUser() links a provider identity to an existing account when the
// email matches, on the stated grounds that "the provider has verified this
// email, so it's the same person". Nothing checked that. Both providers hand
// back addresses they have NOT verified:
//
//   • Discord's /users/@me returns `verified: false` while a newly-set address
//     is unconfirmed — you can point an account at any address you like;
//   • Google's userinfo returns `email_verified: false` for accounts whose
//     address it has not validated.
//
// So an attacker sets a throwaway account's email to the victim's address,
// authorises, and the callback links their provider id to the victim's account
// and opens a session. Worse than ordinary takeover on this site for two
// reasons: upsertOAuthUser DISCARDS the victim's password when their account was
// never email-verified (locking the real owner out), and isAdminEmail() in
// lib/auth.ts grants moderator powers BY EMAIL ADDRESS — so the admin addresses
// hard-coded there are takeable this way, and a brand-new account carrying one
// would be an admin too. That last point is why the gate rejects outright rather
// than falling back to "create a separate account".

test("the callback reads each provider's email-verification flag", () => {
  assert.match(
    callback,
    /profile\.email_verified/,
    "Google's userinfo exposes email_verified — it must be read, not assumed"
  );
  assert.match(
    callback,
    /profile\.verified/,
    "Discord's /users/@me exposes verified — it must be read, not assumed"
  );
});

test("an unverified provider email cannot reach the email-matching branches", () => {
  assert.match(
    callback,
    /if \(!emailVerified\) return null;/,
    "an unproven address must be refused outright once the email is what decides " +
      "which account this is: creating a fresh account for it would still hand out " +
      "admin when the address is one isAdminEmail() honours"
  );
  assert.match(
    callback,
    /if \(!linked\) return fail\(req, "oauth_unverified"\)/,
    "the refusal has to surface as a failed sign-in, not a thrown 500"
  );
});

test("the gate sits between the provider-id match and the email lookups", () => {
  // Position matters, but not the position the first version of this test pinned.
  // Gating the WHOLE callback also refused users matched on googleId/discordId —
  // a branch that never reads the email — locking members out of accounts they had
  // already linked, on a site with no password fallback, for no security gain.
  // The takeover risk lives strictly in the two branches that let an ADDRESS pick
  // the account, so the gate belongs between them.
  const byProvider = callback.search(/if \(byProvider\) \{/);
  const gate = callback.search(/if \(!emailVerified\) return null;/);
  const byEmail = callback.search(/const byEmail = await prisma\.user\.findUnique/);
  const create = callback.search(/prisma\.user\.create\(/);
  assert.ok(
    byProvider >= 0 && gate >= 0 && byEmail >= 0 && create >= 0,
    "expected the provider-id branch, the gate, the email lookup and the create"
  );
  assert.ok(byProvider < gate, "an already-linked provider id must NOT be gated on its email");
  assert.ok(gate < byEmail, "the email-link branch must be gated");
  assert.ok(gate < create, "account creation must be gated");
});

test("signing in never moves an existing account's email address", () => {
  // The provider-id branch is ungated, so it must not be able to carry a new
  // address in — otherwise repointing a linked provider account at an admin
  // address would escalate on the next sign-in, reintroducing the bug one level down.
  const branch = /if \(byProvider\) \{([\s\S]*?)\n  \}/.exec(callback);
  assert.ok(branch, "the byProvider branch moved — re-derive this test");
  assert.doesNotMatch(branch[1], /(^|[^.\w])email[,:]/, "the provider-id branch must not write `email`");
});

test("an unverified address cannot stamp an account as email-verified", () => {
  // emailVerified feeds isVerifiedSeller in lib/auth.ts, so an unconditional
  // `?? new Date()` would hand seller standing to an unproven address.
  assert.match(
    callback,
    /emailVerified: byProvider\.emailVerified \?\? \(emailVerified \? new Date\(\) : null\)/,
    "only a provider-vouched address may newly verify an account"
  );
});

test("the gate is not satisfied by a merely truthy value", () => {
  // `profile` is Record<string, unknown>; a lazy `!!profile.verified` would accept
  // any non-empty string, and providers have shipped "false" as a string before.
  // Skipping the `let emailVerified = false` declaration — only the per-provider
  // assignments are what the gate ends up trusting.
  const assignments = [...callback.matchAll(/(?<!let )emailVerified = ([^;]+);/g)].map((m) => m[1]);
  assert.equal(assignments.length, 2, "expected exactly one assignment per provider");
  for (const a of assignments) {
    assert.match(a, /=== true/, `emailVerified must be an identity check, got: ${a}`);
  }
});

test("the rejection has a message a signed-out visitor can act on", () => {
  // The login form renders OAUTH_ERRORS[code]; a code with no entry shows nothing,
  // so the user is bounced to /login with no idea why.
  assert.match(
    authForm,
    /oauth_unverified:/,
    "add oauth_unverified to OAUTH_ERRORS or the redirect is a silent dead end"
  );
});
