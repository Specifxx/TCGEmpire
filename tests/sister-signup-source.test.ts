import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sisterSignupSource } from "../src/lib/sister-premium";

// Sister sign-ins are credited to the sister (owner, 2026-11-22: sign-in prompts on every site).
test("sisterSignupSource: site, plus a short lower-case surface only", () => {
  assert.equal(sisterSignupSource("dex"), "sister:dex");
  assert.equal(sisterSignupSource("mtg", "product"), "sister:mtg:product");
  assert.equal(sisterSignupSource("mtg", "home_slides"), "sister:mtg:home_slides");
  assert.equal(sisterSignupSource("dex", "<script>"), "sister:dex");
  assert.equal(sisterSignupSource("dex", "x".repeat(40)), "sister:dex");
  assert.equal(sisterSignupSource("dex", 7), "sister:dex");
});

test("every sister account path stamps it, and the owned-audience count reads it", () => {
  const route = readFileSync("src/app/api/sister-premium/sign-in/route.ts", "utf8");
  assert.equal((route.match(/memberFor\([^)]*sisterSignupSource\(site\.key, body\.src\)\)/g) ?? []).length, 2);
  const cb = readFileSync("src/app/api/auth/oauth/[provider]/callback/route.ts", "utf8");
  assert.match(cb, /signupSource: sisterSignupSource\(sister\.key\)/);
  const count = readFileSync("scripts/owned-audience.ts", "utf8");
  assert.match(count, /startsWith\("sister:"\)/);
});
