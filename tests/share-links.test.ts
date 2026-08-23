import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { newShareToken, isShareToken, listingPostText } from "../src/lib/share";

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
const LISTING_PAGE = "src/app/l/[token]/page.tsx";
const LISTING_SHARE_API = "src/app/api/marketplace/listings/[id]/share/route.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Public share links for a collection (/c/<token>) and a listing (/l/<token>).
//
// The token IS the authorisation — there is no second check — so every failure
// mode here is a privacy failure, and all of them are silent:
//   1. A public page selecting a private column (costBasisCents is what the
//      owner PAID; it drives the Premium P&L view and must never be published).
//   2. A crawler indexing a capability URL, which outlives any revocation.
//   3. A share endpoint that authenticates ("are you signed in?") without
//      authorising ("is this yours?"), letting anyone mint a link to anyone
//      else's listing.
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
  // A share URL is safe to paste anywhere; a row id shows up in seller-only API
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

for (const [label, path] of [["collection", COLLECTION_PAGE], ["listing", LISTING_PAGE]] as const) {
  test(`the public ${label} share page is noindex`, () => {
    const src = read(path);
    // A robots Disallow would be WRONG here and is deliberately not used: a
    // disallowed page is never crawled, so the noindex is never seen (see the
    // long note in app/robots.ts). noindex on the page is the mechanism.
    assert.match(src, /robots:\s*\{[^}]*index:\s*false/, "must set index: false");
    assert.match(src, /follow:\s*false/, "must not have crawlers follow links out of a capability URL");
  });
}

// ── 4. Authorisation, not just authentication ───────────────────────────────

test("minting a listing share link checks OWNERSHIP, not just a session", () => {
  const src = read(LISTING_SHARE_API);
  assert.match(src, /getCurrentUser\(\)/, "must identify the caller");
  assert.match(
    src,
    /listing\.sellerId !== user\.id/,
    "must compare the listing's seller against the caller — a signed-in check alone lets anyone mint a link to anyone's listing",
  );
  // Same response for "no such listing" and "not yours", so the endpoint cannot
  // be used to test whether a listing id exists.
  const guard = src.slice(src.indexOf("if (!listing || listing.sellerId"));
  assert.match(guard.slice(0, 200), /status:\s*404/, "must 404 rather than 403 on someone else's listing");
});

test("the share endpoint writes, so it must not be a GET", () => {
  const src = read(LISTING_SHARE_API);
  // ensureListingShare lazily assigns a token — a mutation. A GET that mutates
  // gets fired by link prefetchers and crawlers.
  assert.ok(!/export async function GET/.test(src), "token minting must not sit behind GET");
  assert.match(src, /export async function POST/, "expected POST");
});

test("a REMOVED listing has no public page", () => {
  const src = read(SHARE);
  const fn = src.slice(src.indexOf("export async function getSharedListing"));
  const body = fn.slice(0, fn.indexOf("\n}"));
  assert.match(body, /status === "REMOVED"/, "a removed listing must not render a dead price");
  assert.match(body, /return null/, "must return null so the page 404s");
});

// ── 5. The post text must not make a claim that isn't true ──────────────────

const basePost = {
  cardName: "Akali, Rogue Assassin",
  cardSetCode: "VEN",
  cardCollectorNumber: "189",
  condition: "Near Mint",
  isFoil: false,
  priceCents: 1800,
  quantity: 1,
  currency: "AUD",
  url: "https://riftcompare.com/l/abc",
};

test("the post claims a saving only when the listing really is cheaper", () => {
  const cheaper = listingPostText({ ...basePost, marketCents: 2400 });
  assert.match(cheaper, /25% under the cheapest store price/, "should state the real saving");

  // Dearer than every store: stating a "saving" here is what gets a seller
  // called out in the channel, and us blamed for writing it.
  const dearer = listingPostText({ ...basePost, marketCents: 1200 });
  assert.ok(!/under the cheapest/.test(dearer), "must not claim a saving when there isn't one");
  assert.match(dearer, /Cheapest store price right now/, "should still give the honest comparison");

  // No reference price at all → no comparison line, not a zero or a guess.
  const unknown = listingPostText({ ...basePost, marketCents: null });
  assert.ok(!/store price/.test(unknown), "must say nothing rather than invent a comparison");
});

test("the post is plain text that survives every chat client", () => {
  const post = listingPostText({ ...basePost, marketCents: 2400 });
  // No markdown emphasis: Discord, Facebook, Reddit and WhatsApp each render it
  // differently or not at all, and stray asterisks read as spam.
  assert.ok(!/[*_~`]/.test(post), "post text must not contain markdown formatting characters");
  assert.ok(post.trim().endsWith(basePost.url), "the link belongs on the last line, where every client makes it tappable");
});

test("quantity only appears when there is more than one", () => {
  assert.ok(!/available/.test(listingPostText({ ...basePost, marketCents: null })));
  assert.match(listingPostText({ ...basePost, quantity: 4, marketCents: null }), /4 available/);
});

// ── 6. Revocation has to actually revoke ────────────────────────────────────

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
