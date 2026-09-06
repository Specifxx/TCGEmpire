import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { analyticsUserId } from "../src/lib/ga-user-id";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// GA4 User-ID. The rule that matters is Google's: never send personally
// identifiable information to Analytics. These are cheap static guards around
// the ways that rule actually gets broken in practice — someone "simplifying"
// the hash away, or reaching for a friendlier identifier.

test("the GA user_id is opaque — it cannot be reversed to the account row id", () => {
  const id = "cmsmrwjes00qd2oux65ls2ni9";
  const out = analyticsUserId(id);
  assert.ok(!out.includes(id), "the raw account id must not survive into user_id");
  assert.match(out, /^[0-9a-f]{32}$/, "expected a 32-char hex digest");
});

test("the GA user_id is stable — the same account always hashes the same", () => {
  // If this ever fails, every returning-user and cross-device report in the
  // property silently resets: each account becomes a new user from that day on,
  // with no error raised anywhere. See lib/ga-user-id.ts on never changing the salt.
  assert.equal(analyticsUserId("user-a"), analyticsUserId("user-a"));
  assert.notEqual(analyticsUserId("user-a"), analyticsUserId("user-b"));
});

test("no PII survives hashing, even if a PII value is passed by mistake", () => {
  const out = analyticsUserId("someone@example.com");
  for (const fragment of ["someone", "@", "example", ".com"]) {
    assert.ok(!out.includes(fragment), `user_id leaked "${fragment}"`);
  }
});

test("GoogleAnalyticsUser sends ONLY the opaque id to gtag — never profile fields", () => {
  const src = read("src/components/GoogleAnalyticsUser.tsx");
  // It must not read `user` off the session at all: that object carries email
  // and displayName, and destructuring it is the first step toward sending one.
  assert.ok(
    !/\buseMe\(\)[\s\S]{0,120}\buser\b\s*[,}]/.test(src),
    "GoogleAnalyticsUser must not destructure `user` from useMe() — it holds email/displayName",
  );
  for (const field of ["email", "displayName", "avatarUrl"]) {
    const codeOnly = src
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    assert.ok(!codeOnly.includes(field), `GoogleAnalyticsUser must never reference ${field}`);
  }
  assert.match(
    src,
    /window\.gtag\?\.\(\s*"set"\s*,\s*\{\s*user_id:/,
    "expected a gtag('set', { user_id: … }) call",
  );
});

test("the user_id is cleared on sign-out rather than left set", () => {
  const src = read("src/components/GoogleAnalyticsUser.tsx");
  // `null` specifically — undefined/"" do not unset a previously-set gtag field,
  // so a signed-out visitor would keep being attributed to the previous account.
  assert.match(
    src,
    /const next = consented \? analyticsId : null/,
    "expected the id to resolve to null when signed out or unconsented",
  );
});

test("/api/me exposes the hashed id, never User.id", () => {
  const src = read("src/app/api/me/route.ts");
  assert.ok(src.includes("analyticsUserId(user.id)"), "expected the hashed id in the payload");
  // The raw primary key must stay server-side: it is absent from MenuUser and
  // from every other client payload, and this route is the one most likely to
  // acquire it by accident.
  assert.ok(
    !/^\s*id:\s*user\.id/m.test(src),
    "/api/me must not expose the raw User.id to the client",
  );
});
