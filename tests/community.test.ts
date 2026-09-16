import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { COMMUNITY_RESOURCES } from "../src/lib/content/community";

// ─────────────────────────────────────────────────────────────────────────────
// /community — a directory of THIRD-PARTY Riftbound sites (news, wikis, deck
// builders, tier lists, video). See lib/content/community.ts's header for the
// full rationale: no commercial relationship, no fabricated dates, every entry
// verified rather than guessed. These tests pin the structural guarantees that
// header promises, not the prose of any individual entry.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

const PAGE = "src/app/community/page.tsx";
const LINK = "src/components/CommunityLink.tsx";
const DATA = "src/lib/content/community.ts";
const TEASER = "src/components/home/CommunityTeaser.tsx";
const HOME = "src/components/home/HomeSections.tsx";

test("every resource has a real https url, a source name and a non-empty description", () => {
  assert.ok(COMMUNITY_RESOURCES.length > 0, "the directory must not be empty");
  for (const r of COMMUNITY_RESOURCES) {
    assert.match(r.url, /^https:\/\//, `${r.source}: url must be https`);
    assert.ok(r.source.trim().length > 0, "source name must not be blank");
    assert.ok(r.description.trim().length > 0, `${r.source}: description must not be blank`);
  }
});

test("no two entries share a url", () => {
  const urls = COMMUNITY_RESOURCES.map((r) => r.url);
  assert.equal(new Set(urls).size, urls.length, "duplicate url in COMMUNITY_RESOURCES");
});

test("CommunityResource carries no date/freshness field — nothing here is honestly timestampable", () => {
  const code = read(DATA);
  const iface = code.slice(code.indexOf("export interface CommunityResource"), code.indexOf("\n}", code.indexOf("export interface CommunityResource")));
  assert.doesNotMatch(iface, /date|updated|isNew|freshness/i, "these are third-party pages we cannot honestly timestamp — no fabricated freshness signal");
});

test("the page renders every resource via the plain CommunityLink, not OutboundLink", () => {
  const src = read(PAGE);
  assert.match(src, /import \{ COMMUNITY_RESOURCES/, "must source from the curated data file");
  assert.match(src, /<CommunityLink /, "must render entries through the dedicated component");
  assert.doesNotMatch(src, /<OutboundLink/, "OutboundLink is purchase-tracking-specific (buy_click, ad conversions) — wrong for an unpaid directory");
});

test("links open in a new tab, are not followed, and are not marked sponsored", () => {
  const src = read(LINK);
  assert.match(src, /target="_blank"/);
  assert.match(src, /rel="noopener noreferrer nofollow"/, "unpaid directory link — no affiliate relationship to disclose, but still nofollow since we don't vouch for the destination");
  assert.doesNotMatch(src, /sponsored/, "these are not paid/affiliate links — outboundRel()'s \"sponsored\" would misrepresent them");
});

test("clicks are tracked under their own event name, separate from buy_click", () => {
  const src = read(LINK);
  assert.match(src, /trackEvent\("community_link_click"/);
});

test("the page is static (ISR, no DB read) and carries breadcrumb + WebPage JSON-LD", () => {
  const src = read(PAGE);
  assert.match(src, /export const revalidate = 86400/);
  assert.match(src, /"@type": "BreadcrumbList"/);
  assert.match(src, /"@type": "WebPage"/);
  assert.doesNotMatch(src, /prisma\./, "no database-backed data on this page");
});

test("the homepage features a community teaser, rendered through the shared CommunityLink component", () => {
  const home = read(HOME);
  assert.match(home, /<CommunityTeaser \/>/, "the homepage must render the teaser");
  assert.match(home, /import \{ CommunityTeaser \} from "@\/components\/home\/CommunityTeaser"/);

  const teaser = read(TEASER);
  assert.match(teaser, /import \{ COMMUNITY_RESOURCES, CATEGORY_ORDER \} from "@\/lib\/content\/community"/, "must reuse the same shared ordering as /community, not a second copy");
  assert.match(teaser, /<CommunityLink /, "must render entries through the dedicated component, same as /community");
  assert.match(teaser, /href="\/community"/, "must link through to the full directory");
});

test("the page is discoverable: sitemap, nav and internal links from /blog and /guides all point at it", () => {
  const checks: [string, RegExp][] = [
    ["src/lib/sitemap-sections.ts", /\$\{SITE_URL\}\/community`/],
    ["src/lib/static-page-dates.ts", /"\/community":\s*"\d{4}-\d{2}-\d{2}"/],
    ["src/components/nav-groups.ts", /href:\s*"\/community"/],
    ["src/app/blog/page.tsx", /href="\/community"/],
    ["src/app/guides/page.tsx", /href="\/community"/],
  ];
  for (const [path, pattern] of checks) {
    assert.match(read(path), pattern, `${path} must reference /community`);
  }
});
