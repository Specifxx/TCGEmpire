import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createLocalJWKSet, jwtVerify } from "jose";
import { signInSiteForOrigin, signInSite, signSisterSignIn, sisterSignInJwks, sisterSignInUrl, SISTER_SIGN_IN_ISSUER } from "../src/lib/sister-sign-in";

// OP Compare signs in by an emailed link mailed from here (2026-11-06).
const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");

test("only a sister's exact https origin may ask", () => {
  assert.equal(signInSiteForOrigin("https://opcompare.app")?.key, "opcompare");
  assert.equal(signInSiteForOrigin("https://www.opcompare.app")?.key, "opcompare");
  for (const o of [null, "http://opcompare.app", "https://opcompare.app:8443", "https://evil-opcompare.app", "https://opcompare.app.evil.com", "https://riftcompare.com"]) {
    assert.equal(signInSiteForOrigin(o), null, String(o));
  }
});

test("a token verifies against the published public key, for its own site only", async () => {
  const site = signInSite("opcompare")!;
  const token = await signSisterSignIn(site, "a@icloud.com");
  const jwks = createLocalJWKSet(sisterSignInJwks());
  const { payload } = await jwtVerify(token, jwks, { issuer: SISTER_SIGN_IN_ISSUER, audience: site.url });
  assert.equal(payload.email, "a@icloud.com");
  assert.ok(typeof payload.jti === "string" && payload.jti.length > 10);
  await assert.rejects(jwtVerify(token, jwks, { issuer: SISTER_SIGN_IN_ISSUER, audience: "https://mtgcompare.app" }));
  const pub = sisterSignInJwks().keys[0] as unknown as Record<string, unknown>;
  assert.equal(pub.d, undefined, "the private half is never published");
});

test("the link lands on the sister's confirm page with a safe next only", () => {
  const site = signInSite("opcompare")!;
  const u = new URL(sisterSignInUrl(site, "t", "/portfolio"));
  assert.equal(u.origin + u.pathname, "https://opcompare.app/login/email");
  assert.equal(u.searchParams.get("next"), "/portfolio");
  for (const bad of ["//evil.com", "https://evil.com", "/api/me", "/a b"]) {
    assert.equal(new URL(sisterSignInUrl(site, "t", bad)).searchParams.get("next"), null, bad);
  }
});

test("the route answers one generic ok, rate-limits, and sends under the sister's name", () => {
  const route = read("src/app/api/sister-sign-in/route.ts");
  assert.equal((route.match(/\{ ok: true \}/g) ?? []).length, 1);
  assert.match(route, /sister-sign-in:ip:/);
  assert.match(route, /sister-sign-in:email:/);
  assert.match(route, /from: `\$\{site\.name\} </);
});
