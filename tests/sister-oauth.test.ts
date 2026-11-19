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
  const src = read("src/app/api/sister-premium/discord/route.ts");
  assert.match(src, /premiumSite\(q\.get\("site"\)\)/);
  assert.match(src, /redirectUri\("discord"\)/);
  assert.match(src, /oauth_state_discord/);
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
