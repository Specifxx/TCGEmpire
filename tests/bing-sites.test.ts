import assert from "node:assert/strict";
import { test } from "node:test";
import { hostOf, needsSitemapSubmit, ownSitemap } from "../scripts/bing-sites";

const feed = (url: string, lastCrawled: string | null) => ({ url, lastCrawled, status: "Success" });

test("hostOf folds www and scheme", () => {
  assert.equal(hostOf("https://www.KaeYoung.com/"), "kaeyoung.com");
});

test("a sitemap is submitted when Bing holds none, never read, or has not read it in 14 days", () => {
  const today = "2026-11-10";
  assert.equal(needsSitemapSubmit("kaeyoung.com", [], today).submit, true);
  assert.equal(needsSitemapSubmit("kaeyoung.com", [feed("https://kaeyoung.com/sitemap.xml", null)], today).submit, true);
  assert.equal(needsSitemapSubmit("kaeyoung.com", [feed("https://kaeyoung.com/sitemap.xml", "2026-10-20")], today).submit, true);
  assert.equal(needsSitemapSubmit("kaeyoung.com", [feed("https://www.kaeyoung.com/sitemap.xml", "2026-11-05")], today).submit, false);
  assert.equal(ownSitemap([feed("https://kaeyoung.com/other.xml", "2026-11-05")], "kaeyoung.com"), null);
});

test("Dex and Compare Empire are never submitted", () => {
  assert.equal(needsSitemapSubmit("dexcompare.app", [], "2026-11-10").submit, false);
  assert.equal(needsSitemapSubmit("compareempire.com", [], "2026-11-10").submit, false);
});

test("a sitemap Bing reports as not accessible is resubmitted even when recently read", () => {
  const f = { url: "https://bandaicompare.com/sitemap.xml", lastCrawled: "2026-11-09", status: "The page is not accessible" };
  assert.equal(needsSitemapSubmit("bandaicompare.com", [f], "2026-11-10").submit, true);
});

test("the Monday report's Bing lines parse defensively", async () => {
  const { parseBing, bingLines } = await import("../src/lib/hq/bing");
  assert.equal(parseBing(null), null);
  assert.deepEqual(bingLines(null), []);
  const r = parseBing({ generatedAt: "2026-11-10T07:50:00Z", sites: [{ host: "kaeyoung.com", indexed: "0", crawled: "4", errors: "0", impr: "1", clicks: "0" }, { nope: 1 }] });
  assert.equal(r?.rows.length, 1);
  assert.match(bingLines(r)[0], /^kaeyoung\.com: 0 indexed, 4 crawled/);
});
