import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { sanitizeNextPath } from "../src/lib/next-param";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// ?next= through the OAuth round trip (Phase 1 of the signup-growth plan).
//
// Before this, the OAuth callback hard-redirected every sign-in to /profile —
// someone who clicked "Sign in" to see /watching was dumped on an empty
// profile, losing the thread at the exact moment they converted. The next
// destination now rides a short-lived httpOnly cookie (mirroring the CSRF
// state cookie, NOT stuffed into the state param) and is sanitized on BOTH
// sides of the trip.
// ─────────────────────────────────────────────────────────────────────────────

test("sanitizeNextPath is the one definition of a safe return path", () => {
  // Real internal paths pass through.
  assert.equal(sanitizeNextPath("/watching"), "/watching");
  assert.equal(sanitizeNextPath("/card/abc?tab=graded"), "/card/abc?tab=graded");
  // Open-redirect shapes are rejected, not "fixed".
  assert.equal(sanitizeNextPath("//evil.com"), null);
  assert.equal(sanitizeNextPath("https://evil.com"), null);
  assert.equal(sanitizeNextPath("http://evil.com/x"), null);
  // API routes are never a sane post-auth landing.
  assert.equal(sanitizeNextPath("/api/auth/logout"), null);
  // Degenerate inputs.
  assert.equal(sanitizeNextPath(""), null);
  assert.equal(sanitizeNextPath(null), null);
  assert.equal(sanitizeNextPath(undefined), null);
  assert.equal(sanitizeNextPath("watching"), null);
});

test("the OAuth start route stores sanitized next in its own short-lived cookie", () => {
  const src = read("src/app/api/auth/oauth/[provider]/route.ts");
  assert.match(src, /sanitizeNextPath\(new URL\(req\.url\)\.searchParams\.get\("next"\)\)/);
  assert.match(src, /oauth_next_\$\{provider\}/);
  // Same protections as the CSRF state cookie: httpOnly, lax, 600s.
  const nextCookieBlock = src.slice(src.indexOf("oauth_next_"));
  assert.match(nextCookieBlock, /httpOnly: true/);
  assert.match(nextCookieBlock, /maxAge: 600/);
});

test("the callback honors next (re-sanitized), clears the cookie, and keeps welcome= for new accounts", () => {
  const src = read("src/app/api/auth/oauth/[provider]/callback/route.ts");
  // Defense in depth: the cookie is client-writable, so it's validated again.
  assert.match(src, /sanitizeNextPath\(cookies\(\)\.get\(`oauth_next_\$\{provider\}`\)\?\.value\)/);
  // Cleared unconditionally — a stale destination must not leak into a later sign-in.
  assert.match(src, /cookies\(\)\.set\(`oauth_next_\$\{provider\}`, "", \{ path: "\/", maxAge: 0 \}\)/);
  assert.match(src, /new URL\(next \?\? "\/profile", req\.url\)/);
  assert.match(src, /if \(isNew\) dest\.searchParams\.set\("welcome", provider\)/);
});

test("AuthForm threads next into the provider hrefs and /login supplies it with a contextual pitch", () => {
  const form = read("src/components/AuthForm.tsx");
  assert.match(form, /\/api\/auth\/oauth\/\$\{provider\}\$\{next \? `\?next=\$\{encodeURIComponent\(next\)\}` : ""\}/);
  const login = read("src/app/login/page.tsx");
  // The page's duplicated hand-rolled safe()/cancelTarget() are consolidated
  // into the shared sanitizer, and gated destinations get a persuasion line.
  assert.match(login, /sanitizeNextPath\(searchParams\.next\)/);
  assert.doesNotMatch(login, /function safe\(/);
  assert.match(login, /CONTEXT_LINES/);
  assert.match(login, /"\/watching":/);
});

test("SignupWelcome completes a watch stashed before the OAuth round trip", () => {
  const src = read("src/components/SignupWelcome.tsx");
  // Keyed off signed-in state, not the welcome param — a RETURNING member who
  // took the account path in the alert modal had a pending watch too.
  assert.match(src, /localStorage\.getItem\(PENDING_WATCH_KEY\)/);
  assert.match(src, /localStorage\.removeItem\(PENDING_WATCH_KEY\)/);
  assert.match(src, /watch\(pending\.cardId, pending\.market as Country\)/);
});
