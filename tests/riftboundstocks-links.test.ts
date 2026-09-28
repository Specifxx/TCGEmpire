import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { rbsCardUrl, rbsChampionUrl, rbsSetUrl, type RiftboundStocksLinkMap } from "../src/lib/riftboundstocks";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// Per-page links to RiftboundStocks.com (2026-09-28, DECISIONS.md). The map is
// RiftboundStocks' output (/api/riftcompare-links), so it is treated as
// untrusted input: only plain slugs become URLs, and a missing map or entry
// renders no link at all rather than a guess.
// ─────────────────────────────────────────────────────────────────────────────

const MAP: RiftboundStocksLinkMap = {
  cards: {
    "kai-sa-daughter-of-the-void-ogn-299s-298": "daughter-of-the-void-ogn-299s",
    "evil-card-ogn-001-298": "javascript:alert(1)",
    "slashy-ogn-002-298": "../../admin",
  },
  champions: { "kai-sa": "kaisa" },
  sets: { OGN: "origins" },
};

test("card, champion and set slugs map to RiftboundStocks URLs", () => {
  assert.equal(
    rbsCardUrl(MAP, "kai-sa-daughter-of-the-void-ogn-299s-298"),
    "https://riftboundstocks.com/card/daughter-of-the-void-ogn-299s",
  );
  assert.equal(rbsChampionUrl(MAP, "kai-sa"), "https://riftboundstocks.com/champions/kaisa");
  assert.equal(rbsSetUrl(MAP, "OGN"), "https://riftboundstocks.com/sets/origins");
});

test("no match, no map or no slug → no link", () => {
  assert.equal(rbsCardUrl(MAP, "not-in-the-map"), null);
  assert.equal(rbsCardUrl(null, "kai-sa-daughter-of-the-void-ogn-299s-298"), null);
  assert.equal(rbsCardUrl(MAP, null), null);
  assert.equal(rbsChampionUrl(null, "kai-sa"), null);
  assert.equal(rbsSetUrl(MAP, "RAD"), null);
});

test("only plain slugs from the other site's map become URLs", () => {
  assert.equal(rbsCardUrl(MAP, "evil-card-ogn-001-298"), null);
  assert.equal(rbsCardUrl(MAP, "slashy-ogn-002-298"), null);
});

test("card, champion and set pages render the link", () => {
  for (const [file, fn] of [
    ["src/app/card/[id]/page.tsx", "rbsCardUrl"],
    ["src/app/champions/[slug]/page.tsx", "rbsChampionUrl"],
    ["src/app/sets/[set]/page.tsx", "rbsSetUrl"],
  ] as const) {
    const src = read(file);
    assert.match(src, new RegExp(`${fn}\\(`), `${file} resolves its RiftboundStocks link`);
    assert.match(src, /on RiftboundStocks ↗/, `${file} labels the link`);
    // Same owner, no commission: a plain referral — not nofollow/sponsored —
    // and no noreferrer, so the visit is attributed on the other side.
    assert.match(src, /<a href=\{(rbsHref|href)\} target="_blank" rel="noopener" /, `${file} links as a plain referral`);
  }
});
