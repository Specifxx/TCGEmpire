import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CARD_SHOP_FINDER, cardShopFinderUrl } from "../src/lib/partners";
import { FOOTER_GROUPS, NAV_GROUPS } from "../src/components/nav-groups";

const read = (p: string) => readFileSync(p, "utf8");

// The Card Shop Finder reciprocal link (2026-10-29, owner). The exchange's
// terms: /browse/ with our UTM tags, followed (rel="noopener" only), a new
// tab, on every store page and once in the footer, with no click tracking.

test("The Card Shop Finder link carries the agreed URL, UTM tags and rel", () => {
  assert.equal(CARD_SHOP_FINDER.url, "https://thecardshopfinder.com/browse/?utm_source=riftcompare&utm_medium=referral");
  assert.equal(cardShopFinderUrl("/co/denver/"), "https://thecardshopfinder.com/co/denver/?utm_source=riftcompare&utm_medium=referral");
  assert.equal(CARD_SHOP_FINDER.rel, "noopener");
  assert.equal(CARD_SHOP_FINDER.heading, "Prefer to buy local?");
  assert.equal(CARD_SHOP_FINDER.label, "Find a local card shop near you");
  assert.equal(CARD_SHOP_FINDER.footerLabel, "Local Card Shop Directory");
});

test("every store page renders the block from the constant, followed, in a new tab, untracked", () => {
  const src = read("src/app/stores/[slug]/page.tsx");
  const start = src.indexOf("<aside aria-label={CARD_SHOP_FINDER.heading}");
  assert.ok(start > 0, "the block is on /stores/[slug]");
  const block = src.slice(start, src.indexOf("</aside>", start));
  assert.match(block, /href=\{CARD_SHOP_FINDER\.url\}/);
  assert.match(block, /target="_blank"/);
  assert.match(block, /rel=\{CARD_SHOP_FINDER\.rel\}/);
  assert.doesNotMatch(block, /nofollow|sponsored|noreferrer|onClick|data-track|trackClick/i);
  assert.doesNotMatch(src, /thecardshopfinder\.com/, "the URL lives in lib/partners.ts only");
});

test("the footer has the link exactly once, with the partner's rel; the launcher and rail do not", () => {
  const footer = FOOTER_GROUPS.flatMap((g) => g.links).filter((l) => l.href === CARD_SHOP_FINDER.url);
  assert.equal(footer.length, 1);
  assert.equal(footer[0].label, "Local Card Shop Directory");
  assert.equal(footer[0].external, true);
  assert.equal(footer[0].rel, "noopener");
  assert.ok(!NAV_GROUPS.some((g) => g.links.some((l) => l.href === CARD_SHOP_FINDER.url)));
  assert.match(read("src/components/FooterNav.tsx"), /rel=\{l\.rel \?\? "noopener noreferrer"\}/);
});
