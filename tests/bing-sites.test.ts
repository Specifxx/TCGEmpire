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
