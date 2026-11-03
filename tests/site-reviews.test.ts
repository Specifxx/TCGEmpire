import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseSiteReview } from "../src/lib/site-reviews/input";
import { shapeSiteReviews } from "../src/lib/site-reviews/read";
import { reviewCorsHeaders, reviewSiteForOrigin, SISTER_REVIEW_SITES } from "../src/lib/site-reviews/sites";

// Every site's ratings and reviews, approved in RiftCompare's admin (owner,
// 2026-11-03). DECISIONS.md, "Every site's reviews, approved in one queue".

test("only the sister sites' own https origins may post, www or apex", () => {
  assert.equal(reviewSiteForOrigin("https://figurecompare.com")?.key, "figure");
  assert.equal(reviewSiteForOrigin("https://www.figurecompare.com")?.key, "figure");
  assert.equal(reviewSiteForOrigin("https://camcompare.app")?.key, "cam");
  assert.equal(reviewSiteForOrigin("https://www.opcompare.app")?.key, "op");
  assert.equal(reviewSiteForOrigin("http://figurecompare.com"), null);
  assert.equal(reviewSiteForOrigin("https://figurecompare.com.evil.example"), null);
  assert.equal(reviewSiteForOrigin("https://evilfigurecompare.com"), null);
  assert.equal(reviewSiteForOrigin("https://figurecompare.com:8443"), null);
  assert.equal(reviewSiteForOrigin("https://riftcompare.com"), null, "RiftCompare uses its own /api/feedback");
  assert.equal(reviewSiteForOrigin(null), null);
  assert.deepEqual(reviewCorsHeaders("https://evil.example"), { Vary: "Origin" });
  assert.equal(reviewCorsHeaders("https://kaeyoung.com")["Access-Control-Allow-Origin"], "https://kaeyoung.com");
  assert.equal(new Set(SISTER_REVIEW_SITES.map((s) => s.key)).size, SISTER_REVIEW_SITES.length);
});

test("a rating, a review, or both; bots and empty sends are refused", () => {
  assert.deepEqual(parseSiteReview({ website: "http://spam" }), { kind: "bot" });
  assert.equal(parseSiteReview({}).kind, "error");
  assert.equal(parseSiteReview(null).kind, "error");
  assert.equal(parseSiteReview({ rating: 6 }).kind, "error");
  assert.equal(parseSiteReview({ rating: 2.5 }).kind, "error");
  assert.equal(parseSiteReview({ message: "too short" }).kind, "error");

  const stars = parseSiteReview({ rating: 5, source: "rating" });
  assert.equal(stars.kind, "ok");
  if (stars.kind === "ok") assert.deepEqual(stars.row, { rating: 5, message: "", source: "rating", consentPublic: false, displayName: null, page: null });

  const review = parseSiteReview({ rating: 4, message: "  Found a box cheaper than my LGS.  ", source: "rating-review", consentPublic: true, displayName: "Sam", page: "/product/x" });
  assert.equal(review.kind, "ok");
  if (review.kind === "ok") {
    assert.equal(review.row.source, "rating-review");
    assert.equal(review.row.message, "Found a box cheaper than my LGS.");
    assert.equal(review.row.displayName, "Sam");
    assert.equal(review.row.page, "/product/x");
  }
});

test("a name is kept only with consent; the page only as a path", () => {
  const r = parseSiteReview({ rating: 3, message: "Needs more NZ stores please", consentPublic: false, displayName: "Sam", page: "https://evil.example/x" });
  assert.equal(r.kind, "ok");
  if (r.kind === "ok") {
    assert.equal(r.row.displayName, null);
    assert.equal(r.row.page, null);
    assert.equal(r.row.consentPublic, false);
  }
  // "rating-review" without stars is plain written feedback, not a repeat of a counted rating.
  const w = parseSiteReview({ message: "Would love a dark mode toggle", source: "rating-review" });
  assert.equal(w.kind, "ok");
  if (w.kind === "ok") assert.equal(w.row.source, "rating");
});

test("the public payload: every rating counts, only published reviews show, no private field", () => {
  const p = shapeSiteReviews(
    "figure",
    [
      { rating: 5, count: 3 },
      { rating: 4, count: 1 },
      { rating: null, count: 9 },
    ],
    [
      { id: "a", rating: 5, message: "Great", displayName: null, publishedAt: new Date("2026-11-03T05:00:00Z") },
      { id: "b", rating: 4, message: "  ", displayName: "X", publishedAt: new Date("2026-11-02T05:00:00Z") },
      { id: "c", rating: 4, message: "No date", displayName: "Y", publishedAt: null },
    ],
  );
  assert.deepEqual(p.rating, { average: 4.8, count: 4, split: { "1": 0, "2": 0, "3": 0, "4": 1, "5": 3 } });
  assert.deepEqual(p.reviews, [{ id: "a", rating: 5, message: "Great", name: "Verified visitor", date: "2026-11-03" }]);
  assert.equal(shapeSiteReviews("x", [], []).rating, null);
});

test("RiftCompare's own rating and reviews never include another site's rows", () => {
  for (const f of ["src/lib/reviews.ts", "src/lib/site-rating.ts"]) {
    assert.match(readFileSync(f, "utf8"), /site: "riftcompare"/, `${f} must filter on site`);
  }
  const read = readFileSync("src/lib/site-reviews/read.ts", "utf8");
  assert.doesNotMatch(read, /email: true/);
});
