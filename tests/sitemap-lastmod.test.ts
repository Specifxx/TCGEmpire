import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// cards.xml had ~1,400 <url> entries sharing only 2 distinct <lastmod> values,
// despite every card page showing a different "updated Xh ago". The cause
// wasn't upstream: sitemap-sections.ts's cards()/sets()/champions()/decks()/
// stores() each already aggregate a genuine per-item MAX(RetailerPrice.lastSeen)
// — different stores' price-import batches land seconds-to-minutes apart within
// a run, so those Date objects really do differ. The shared XML serializer in
// [section]/route.ts was throwing that precision away with
// `.toISOString().slice(0, 10)` (date-only), collapsing a whole day's worth of
// distinct batch timestamps into one identical YYYY-MM-DD string. The fix is
// there, not in the per-entry queries, which is what this test pins.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("the sitemap route emits a full timestamp, not a date-truncated one", () => {
  const src = read("src/app/sitemaps/[section]/route.ts");
  assert.doesNotMatch(
    src,
    /lastModified\.toISOString\(\)\.slice\(/,
    "truncating lastModified discards the real per-item distinctness the section builders already compute",
  );
  assert.match(
    src,
    /<lastmod>\$\{e\.lastModified\.toISOString\(\)\}<\/lastmod>/,
    "must emit the full ISO 8601 timestamp — valid per the sitemap protocol (sitemaps.org allows a full date and time or a date)",
  );
});

test("a full ISO timestamp actually differentiates same-day entries a date-only stamp would collapse", () => {
  // Not a network test — this is the exact transformation route.ts applies,
  // proving the fix produces distinct strings for two Date objects that fall
  // on the same calendar day but different times (the real-world shape of two
  // stores' import batches minutes apart).
  const a = new Date("2026-08-30T07:03:11.000Z");
  const b = new Date("2026-08-30T07:41:52.000Z");
  const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
  const full = (d: Date) => d.toISOString();

  assert.equal(dateOnly(a), dateOnly(b), "sanity check: both fall on the same calendar day");
  assert.notEqual(full(a), full(b), "the full timestamp must NOT collapse them — this is what route.ts now emits");
});
