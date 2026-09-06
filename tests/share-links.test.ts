import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { newShareToken, isShareToken } from "../src/lib/share";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/**
 * Strip comments before asserting on code.
 *
 * These files document what they deliberately DON'T do ("`note` is excluded",
 * "never costBasisCents"), so a bare word-match against the source finds the
 * prose warning and reports it as the very leak it warns about. Same convention
 * as tests/ebay-auctions.test.ts: what matters is what the code CALLS, not what
 * a comment mentions.
 */
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

const SHARE = "src/lib/share.ts";
const COLLECTION_PAGE = "src/app/c/[token]/page.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// Public share links for a collection (/c/<token>). The peer-to-peer marketplace
// listing-share half (/l/<token>) was removed with the marketplace (2026-08); the
// collection share is the surviving public capability URL.
//
// The token IS the authorisation — there is no second check — so every failure
// mode here is a privacy failure, and all of them are silent:
//   1. A public page selecting a private column (costBasisCents is what the
//      owner PAID; it drives the Premium P&L view and must never be published).
//   2. A crawler indexing a capability URL, which outlives any revocation.
// ─────────────────────────────────────────────────────────────────────────────

// ── 1. Tokens ────────────────────────────────────────────────────────────────

test("share tokens are unguessable, URL-safe and unique", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const t = newShareToken();
    // URL-safe with no padding: these get pasted into chat clients that mangle
    // anything needing percent-encoding.
    assert.match(t, /^[A-Za-z0-9_-]+$/, `token is not URL-safe: ${t}`);
    // 16 bytes base64url = 22 chars. Anything materially shorter is guessable.
    assert.ok(t.length >= 20, `token too short to be unguessable: ${t}`);
    assert.ok(!seen.has(t), "newShareToken returned a duplicate");
    seen.add(t);
  }
});

test("isShareToken rejects anything that cannot be a token before a DB hit", () => {
  assert.ok(isShareToken(newShareToken()));
  for (const bad of ["", "  ", "short", "has spaces in it", "../../etc/passwd", "a/b", "%2e%2e", null, undefined]) {
    assert.ok(!isShareToken(bad as string), `should have rejected ${JSON.stringify(bad)}`);
  }
});

test("a token is not derived from the row id", () => {
  // A share URL is safe to paste anywhere; a row id shows up in owner-only API
  // responses and admin views. If the two were the same string, pasting one
  // would leak the other.
  const src = read(SHARE);
  const fn = src.slice(src.indexOf("export function newShareToken"));
  const body = codeOnly(fn.slice(0, fn.indexOf("\n}")));
  assert.match(body, /randomBytes\(/, "tokens must come from a CSPRNG");
  assert.ok(!/\bid\b/.test(body), "token must not be derived from any id");
});

// ── 2. The public projection must not carry private columns ─────────────────

test("a shared collection never selects what the owner paid", () => {
  const src = read(SHARE);
  const fn = src.slice(src.indexOf("export async function getSharedCollection"));
  const body = codeOnly(fn.slice(0, fn.indexOf("\n}")));
  assert.ok(!/costBasisCents/.test(body), "costBasisCents must never reach a public page");
  assert.ok(!/\bnote\s*:/.test(body), "the owner's free-text note must not be a selected field");
  // `select`, never `include`/spread: a future column added to CollectionCard
  // must be invisible here until somebody deliberately adds it, rather than
  // being published the moment it is created.
  assert.match(body, /select:\s*\{/, "the public projection must select fields explicitly");
  assert.ok(!/include:\s*\{/.test(body), "include: would pass through every column, present and future");
});

test("the shared-collection type has no P&L surface at all", () => {
  const src = read(SHARE);
  const type = src.slice(src.indexOf("export type SharedHolding"), src.indexOf("export type SharedCollection"));
  for (const banned of ["costBasis", "plCents", "plPct", "invested", "profit"]) {
    assert.ok(!type.includes(banned), `SharedHolding must not expose ${banned}`);
  }
});

// ── 3. Capability URLs must never be indexed ────────────────────────────────

test("the public collection share page is noindex", () => {
  const src = read(COLLECTION_PAGE);
  // A robots Disallow would be WRONG here and is deliberately not used: a
  // disallowed page is never crawled, so the noindex is never seen (see the
  // long note in app/robots.ts). noindex on the page is the mechanism.
  assert.match(src, /robots:\s*\{[^}]*index:\s*false/, "must set index: false");
  assert.match(src, /follow:\s*false/, "must not have crawlers follow links out of a capability URL");
});

// ── 4. Revocation has to actually revoke ────────────────────────────────────

test("enabling a share is idempotent but rotating is not", () => {
  const src = read(SHARE);
  const enable = src.slice(src.indexOf("export async function enableCollectionShare"));
  const enableBody = enable.slice(0, enable.indexOf("\n}"));
  // A "Share" button that mints a new token on every click silently breaks the
  // link the user shared thirty seconds ago.
  assert.match(enableBody, /if \(existing\?\.collectionShareId\) return existing\.collectionShareId/, "enable must reuse an existing token");

  const rotate = src.slice(src.indexOf("export async function rotateCollectionShare"));
  const rotateBody = rotate.slice(0, rotate.indexOf("\n}"));
  assert.match(rotateBody, /newShareToken\(\)/, "rotate must mint a fresh token");
});

test("there is no second source of truth for 'is this shared'", () => {
  // Presence of the token IS the switch. A separate boolean is how a revoked
  // share stays live because only one of the two got cleared.
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /collectionShareId\s+String\?\s+@unique/, "expected a nullable unique token on User");
  assert.ok(!/collectionSharePublic|isCollectionShared/.test(schema), "no boolean may shadow the token");
});
