import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Sign-in is Google + Discord only. Password auth is gone: no /register,
// /forgot or /reset, and no register/login/forgot/reset API routes.
//
// Why this is safe for existing members: the OAuth callback resolves a user by
// provider id and then FALLS BACK TO EMAIL, linking the identity to whatever
// account already owns that address. Someone who signed up with a password
// signs in with Google on the same address and lands on their existing account.
// That fallback is load-bearing now, so it is asserted here — deleting it would
// silently start minting duplicate accounts for every returning member.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const exists = (p: string) => existsSync(join(process.cwd(), p));

test("the password pages are gone", () => {
  for (const p of ["src/app/register", "src/app/forgot", "src/app/reset"]) {
    assert.equal(exists(p), false, `${p} must not exist`);
  }
});

test("the password API routes are gone", () => {
  for (const p of [
    "src/app/api/auth/register",
    "src/app/api/auth/login",
    "src/app/api/auth/forgot",
    "src/app/api/auth/reset",
  ]) {
    assert.equal(exists(p), false, `${p} must not exist`);
  }
});

test("OAuth sign-in and sign-out survive", () => {
  assert.ok(exists("src/app/api/auth/oauth/[provider]/route.ts"));
  assert.ok(exists("src/app/api/auth/oauth/[provider]/callback/route.ts"));
  assert.ok(exists("src/app/api/auth/logout/route.ts"));
  assert.ok(exists("src/app/login/page.tsx"));
});

test("both providers are still offered", () => {
  const src = read("src/lib/oauth.ts");
  assert.match(src, /OAUTH_PROVIDERS: OAuthProvider\[\] = \["google", "discord"\]/);
  const form = read("src/components/AuthForm.tsx");
  // The href moved from two literals to one template (oauthHref carries the
  // optional ?next= through the OAuth round trip — see tests/oauth-next.test.ts);
  // both provider buttons still render from it.
  assert.match(form, /\/api\/auth\/oauth\/\$\{provider\}/);
  assert.match(form, /oauthHref\("google"\)/);
  assert.match(form, /oauthHref\("discord"\)/);
});

test("the sign-in form no longer collects credentials", () => {
  const src = read("src/components/AuthForm.tsx");
  assert.ok(!/type="password"/.test(src), "no password field");
  assert.ok(!/name="email"|type="email"/.test(src), "no email field");
  assert.ok(!/\/api\/auth\/(login|register)/.test(src), "must not post to removed routes");
});

test("an account whose email is on neither provider is not left at a dead end", () => {
  // The one group this migration cannot serve on its own. The form must say so
  // rather than looking like a broken page.
  const src = read("src/components/AuthForm.tsx");
  assert.match(src, /\/contact/, "needs a route to support for unlinkable addresses");
});

test("the OAuth callback still links by email, not just provider id", () => {
  const src = read("src/app/api/auth/oauth/[provider]/callback/route.ts");
  assert.match(
    src,
    /prisma\.user\.findUnique\(\{ where: \{ email \} \}\)/,
    "without the email fallback, returning password members get duplicate accounts",
  );
});

test("nothing still links to the removed pages", () => {
  const bad: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(join(process.cwd(), dir))) {
      const rel = `${dir}/${name}`;
      if (statSync(join(process.cwd(), rel)).isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(name)) {
        const src = readFileSync(join(process.cwd(), rel), "utf8");
        // href/Link targets only — prose and comments mentioning the old paths
        // are fine, and the redirect config legitimately names them.
        for (const m of src.matchAll(/href=[{"`]+\/(register|forgot|reset)\b/g)) {
          bad.push(`${rel}: links to /${m[1]}`);
        }
      }
    }
  };
  walk("src");
  assert.deepEqual(bad, [], `dead auth links:\n  ${bad.join("\n  ")}`);
});

test("the retired URLs redirect instead of 404ing", () => {
  const cfg = read("next.config.js");
  for (const p of ["/register", "/forgot", "/reset"]) {
    assert.ok(cfg.includes(`source: "${p}"`), `${p} needs a redirect — it was linked from emails and CTAs`);
  }
});

test("no dead password helpers are left exported", () => {
  const src = read("src/lib/auth.ts");
  for (const fn of ["hashPassword", "verifyPassword"]) {
    assert.ok(!src.includes(`export async function ${fn}`), `${fn} has no callers now`);
  }
  // Token helpers stay: email verification still uses them.
  assert.match(src, /export async function createAuthToken/);
  assert.match(src, /export async function consumeAuthToken/);
});
