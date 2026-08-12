import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// /marketplace/seller/[id] — one <title> per seller, not one for all of them.
//
// Every storefront with active stock is submitted in the sitemap
// (lib/sitemap-sections.ts → marketplace()), and all of them shipped the same
// hard-coded "Seller storefront — Marketplace" title and no description at all,
// so they inherited the root description too. scripts/seo-gate.ts caught it in
// production as a 3-page duplicate-title cluster — and it grows by one every
// time somebody opens a shop, which is why this is guarded here and not just
// fixed once.
//
// The metadata is database-driven, so this asserts the SHAPE of the builder
// rather than a rendered string: that it names the seller, varies on facts only
// that seller has, and keeps the pre-launch branch free of any database read.
// ─────────────────────────────────────────────────────────────────────────────

const SRC = readFileSync(join(process.cwd(), "src/app/marketplace/seller/[id]/page.tsx"), "utf8");
const meta = /export async function generateMetadata[\s\S]*?\n}\n/.exec(SRC)?.[0] ?? "";
/** Comments explain the old title; only the code may still contain it. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

test("the title is built from the seller, not hard-coded", () => {
  assert.ok(meta, "generateMetadata must be async now — it reads the seller from the database");
  assert.match(meta, /const title = `\$\{shopName\}/, "the title must lead with the shop name");
  assert.match(meta, /title: \{ absolute: title \}/, "an absolute title, like the store pages");
  // The old constant may survive ONLY in the pre-launch branch.
  const occurrences = [...code(meta).matchAll(/"Seller storefront — Marketplace"/g)].length;
  assert.equal(occurrences, 1, "the shared title may only remain on the noindex pre-launch return");
});

test("the description varies on this seller's own data", () => {
  assert.match(meta, /description =[\s\S]*\$\{shopName\}/, "the description must name the seller");
  // No indefinite article in front of a country word: "a Canadian seller" is
  // right and "a Australian seller" is not, so the sentence avoids the choice.
  assert.ok(!/\ba \$\{place\./.test(code(meta)), "don't put an article in front of an interpolated country");
  // A count alone is weak variance — near-duplicate detection discounts digits,
  // which is exactly how the store pages read as one description before their
  // fix. The cheapest live listing is this seller's most-varying real fact.
  assert.match(meta, /cheapest\.card\.name/, "name a card this seller actually has listed");
  assert.match(meta, /formatMoney\(cheapest\.priceCents, cheapest\.currency\)/, "price it in the listing's own currency");
  assert.match(meta, /orderBy: \{ priceCents: "asc" \}/, "the named listing must be the cheapest one");
});

test("two sellers sharing a shop name still get different titles", () => {
  // Same collision lib/store-pages.ts disambiguates for tracked retailers: shop
  // names are user-chosen and nothing stops two people picking one.
  assert.match(meta, /place\.label/, "the market must appear in the title as the tie-breaker");
  assert.match(meta, /COUNTRIES\[profile\.country as Country\] \?\? COUNTRIES\[DEFAULT_COUNTRY\]/, "an unknown country must not crash metadata");
});

test("pre-launch storefronts stay noindex and read nothing", () => {
  // canViewMarketplaceListings() hides these from everyone outside the beta
  // allow-list before launch, so metadata must not put a shop name in a <title>
  // that an unauthorised visitor's browser would still render.
  const preLaunch = /if \(!MARKETPLACE_PUBLIC\) \{[\s\S]*?\n  \}/.exec(meta)?.[0] ?? "";
  assert.ok(preLaunch, "the pre-launch branch must come first");
  assert.match(preLaunch, /robots: \{ index: false, follow: false \}/, "pre-launch pages stay noindex");
  assert.ok(!/prisma\./.test(preLaunch), "the pre-launch branch must not query the database");
  assert.ok(
    meta.indexOf("if (!MARKETPLACE_PUBLIC)") < meta.indexOf("prisma."),
    "the early return must precede every query",
  );
});

test("an empty storefront is not submitted for indexing", () => {
  // Its only content is "Nothing listed right now." — the same thin guard the
  // store pages apply, and follow:true so its links still carry.
  assert.match(meta, /count === 0 \? \{ robots: \{ index: false, follow: true \} \} : \{\}/);
});

test("the canonical and OpenGraph go through the shared builders", () => {
  // A bare `alternates: { canonical }` silently drops the root's feed
  // auto-discovery and x-default — the whole reason lib/seo.ts exists.
  assert.match(meta, /alternates: pageAlternates\(`\/marketplace\/seller\/\$\{params\.id\}`\)/);
  assert.match(meta, /openGraph: pageOpenGraph\(\{ title, description, url:/);
});

test("the visible breadcrumb has a BreadcrumbList behind it", () => {
  assert.match(SRC, /breadcrumb\(\[\s*\{ name: "Marketplace", href: "\/marketplace" \}/, "the trail must match the visible nav");
  assert.match(SRC, /MARKETPLACE_PUBLIC && \(\s*<script/, "no markup on a pre-launch noindex page");
});

test("none of the marketplace's own logic moved", () => {
  // This change is metadata-only by contract: the access gate, the listing
  // query and the rating call are exactly as they were.
  assert.match(SRC, /if \(!canViewMarketplaceListings\(user\?\.email, user\?\.isAdmin\)\) notFound\(\);/);
  assert.match(SRC, /getSellerRating\(params\.id\)/);
  assert.match(SRC, /where: \{ sellerId: params\.id, status: "ACTIVE", quantity: \{ gt: 0 \} \}/);
});
