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

test("an unverified provider email cannot sign in at all", () => {
  assert.match(
    callback,
    /if \(!emailVerified\)\s*return fail\(req, "oauth_unverified"\)/,
    "an unproven address must be rejected outright: creating a fresh account for " +
      "it would still hand out admin when the address is one isAdminEmail() honours"
  );
});

test("the verification gate runs BEFORE any account is found or created", () => {
  const gate = callback.search(/if \(!emailVerified\)/);
  const upsert = callback.search(/upsertOAuthUser\(/);
  assert.ok(gate >= 0 && upsert >= 0, "expected both the gate and the upsert call");
  assert.ok(
    gate < upsert,
    "the gate must precede upsertOAuthUser — checking after it has linked the " +
      "identity and returned a user is checking after the takeover"
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
