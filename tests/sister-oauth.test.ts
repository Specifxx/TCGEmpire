import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sisterFailUrl, sisterForCookie } from "../src/lib/sister-oauth";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("sister Discord sign-in: only a listed sister, back to its own canonical URL", () => {
  assert.equal(sisterForCookie("dex")?.url, "https://dexcompare.io");
  assert.equal(sisterForCookie("https://evil.example"), null);
  assert.equal(sisterForCookie(undefined), null);
  assert.equal(sisterFailUrl(sisterForCookie("mtg")!, "oauth_unverified"), "https://mtgcompare.app/account?error=oauth_unverified");
});

test("the start route takes the site from SISTER_PREMIUM_SITES and reuses Rift's registered Discord redirect URI", () => {
  const src = read("src/app/api/sister-premium/oauth/[provider]/route.ts");
  assert.match(src, /premiumSite\(q\.get\("site"\)\)/);
  assert.match(src, /isOAuthProvider\(provider\)/, "google or discord only");
  assert.match(src, /redirectUri\(provider\)/);
  assert.match(src, /oauth_state_\$\{provider\}/);
});

test("the callback: same state and verified-address checks, no Rift session for a sister, the emailed link's code back", () => {
  const src = read("src/app/api/auth/oauth/[provider]/callback/route.ts");
  const sister = src.indexOf("const sister = sisterOf(provider);\n    if (sister)");
  assert.ok(sister > 0, "the sister branch exists");
  assert.ok(src.indexOf("upsertOAuthUser(") < sister, "after the account is found or created (verified address, linked by id or email)");
  assert.ok(sister < src.indexOf("await createSession(user.id)"), "before any RiftCompare session");
  assert.match(src, /sisterReturnUrl\(sister, user\.email/);
  const lib = read("src/lib/sister-oauth.ts");
  assert.match(lib, /emailLinkUrl\(site, await signEmailLinkCode\(site, email\)\)/);
  assert.match(lib, /sanitizeNextPath\(next\)/);
});

test("on-site sign-in (2026-11-21): only a listed provider via the sister's own rewrite uses the sister's callback, and the code exchange matches", async () => {
  const { ON_SITE_OAUTH, sisterRedirectUri } = await import("../src/lib/oauth");
  assert.deepEqual([...ON_SITE_OAUTH], ["discord"], "Google joins only once its redirect URIs are registered in Google Cloud");
  assert.equal(sisterRedirectUri(sisterForCookie("mtg")!.url, "discord"), "https://mtgcompare.app/account-service/oauth/discord/callback");
  const start = read("src/app/api/sister-premium/oauth/[provider]/route.ts");
  assert.match(start, /q\.get\("via"\) === "site" && ON_SITE_OAUTH\.includes\(provider\)/);
  assert.match(start, /onSite \? sisterRedirectUri\(site\.url, provider\) : redirectUri\(provider\)/, "the site's canonical URL, never the request's host");
  const cb = read("src/app/api/auth/oauth/[provider]/callback/route.ts");
  assert.match(cb, /identify\(provider, code, webRedirectUri\(provider\)\)/, "the token exchange sends the redirect URI the sign-in started with");
  assert.match(cb, /ON_SITE_OAUTH\.includes\(provider\) && cookies\(\)\.get\(sisterOAuthViaCookie\(provider\)\)\?\.value === "1"/);
});
