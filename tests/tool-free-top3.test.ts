import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getArticles } from "../src/lib/articles";
import { TIER_COMPARISON } from "../src/components/TierComparisonTable";
import { SIGNUP_SOURCES } from "../src/lib/signup-source-shared";

// ─────────────────────────────────────────────────────────────────────────────
// Deal Finder and Rising Cards have THREE levels of access (2026-09-23):
//   signed out  — no query at all; a lock that asks for a free account
//   free account — the top three rows, QUERIED AT THAT SIZE
//   Premium/Plus — everything
// Owner, 2026-09-23: "even if free accounts get to see the top 3". This
// replaced tests/premium-no-free-top-pick.test.ts (2026-09-22, "free accounts
// get nothing").
//
// The half a test has to hold is the one the 2026-09-22 entry learned the hard
// way: the pre-09-22 teaser fetched six rows and blurred five in CSS, so the
// "locked" rows were in the server HTML for anyone with devtools. A free
// account may receive exactly the rows it is entitled to and nothing more,
// which is why these assert on the QUERY SIZE and the render site, not the
// markup.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const code = (p: string) => read(p).replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const DEAL_FINDER = "src/app/tools/deal-finder/page.tsx";
const RISING = "src/app/tools/rising/page.tsx";

test("both tools preview exactly three rows", () => {
  for (const f of [DEAL_FINDER, RISING]) {
    assert.match(read(f), /const FREE_PREVIEW_ROWS = 3;/, `${f}: the free preview is three rows`);
  }
});

test("access is derived once: Premium full, signed-in free top3, signed out none", () => {
  assert.match(read(DEAL_FINDER), /const access: ToolAccess = premium \? "full" : user \? "top3" : "none";/);
  assert.match(
    read(RISING),
    /const access: "full" \| "top3" \| "none" = premium \|\| ADSENSE_REVIEW_MODE \? "full" : user \? "top3" : "none";/,
  );
});

test("Deal Finder: the list queries at full size for members, three rows for free, nothing signed out", () => {
  // One list since 2026-09-25 (the flip, cheapest-on-eBay and cross-region
  // tabs were cut or folded in), so one full call and one preview call.
  const src = code(DEAL_FINDER);
  const calls = [...src.matchAll(/await getArbitrageVsTcgplayer\(([^;]*?)\)\s*\n?\s*(?::|;)/g)].map((m) => m[1]);
  assert.equal(calls.length, 2, `expected one full call and one preview call, found ${calls.length}`);
  assert.ok(calls.some((c) => /PAGE_SIZE/.test(c)), "the full call uses PAGE_SIZE");
  const preview = calls.find((c) => /FREE_PREVIEW_ROWS/.test(c));
  assert.ok(preview, "the free call must be sized FREE_PREVIEW_ROWS, not PAGE_SIZE");
  assert.ok(!/PAGE_SIZE/.test(preview!), "the free call must not fetch a full page");
  assert.match(preview!, /page: 1/, "the free call is pinned to page 1");
  assert.ok(!/onlyCardIds/.test(preview!), "a free account's ?mine= never reaches the query");
  // The signed-out branch resolves to null — no query — and the "Prices as
  // of" aggregate is skipped for it too.
  assert.match(
    src,
    /access === "full"\s*\?\s*await getArbitrageVsTcgplayer\([^;]*\)\s*:\s*access === "top3"\s*\?\s*await getArbitrageVsTcgplayer\([^;]*\)\s*:\s*null;/,
    "signed out skips the query",
  );
  assert.match(src, /access === "none" \? Promise\.resolve\(null\) : getPricesAsOf\(country\)/);
  assert.ok(!/TEASER_SIZE/.test(src), "the old six-row teaser must not come back");
});

test("Deal Finder: the locked states take no rows, so they cannot leak any", () => {
  const src = code(DEAL_FINDER);
  assert.match(src, /function LockedPreview\(\) \{/, "the signed-out lock takes no props at all");
  assert.match(src, /function MorePremium\(\{ more, unit \}: \{ more: number; unit: string \}\)/, "the free-account panel takes a count, never rows");
  assert.equal((src.match(/<LockedPreview \/>/g) ?? []).length, 1, "the one list uses it");
  assert.ok(!/function LockedTable/.test(src), "LockedTable wrapped the real table — it must stay gone");
  assert.ok(!/tbody_tr[^\n]*blur|tr:not\(:first-child\)/.test(src), "rows must never be 'hidden' behind CSS");
  // Filters, sorting and pagination are for members; a free account's
  // ?buy=/?sort=/?page= are ignored by the preview query.
  assert.equal((src.match(/access === "full" && \(/g) ?? []).length, 1, "the filter bar is members-only");
  assert.equal((src.match(/access === "full" \? \(\s*<Pager/g) ?? []).length, 1, "pagination is members-only");
  // Both gates sell the tier that unlocks the list.
  assert.equal((src.match(/<PremiumButton surface="gate:deal-finder" tier="plus"/g) ?? []).length, 2, "both gates open the dialog on Plus");
});

test("Rising Cards: one render site, fed only the slice the visitor is entitled to", () => {
  const src = code(RISING);
  assert.match(
    src,
    /const visible = access === "full" \? analysis\.picks : access === "top3" \? analysis\.picks\.slice\(0, FREE_PREVIEW_ROWS\) : \[\];/,
  );
  assert.equal((src.match(/<RisingRow /g) ?? []).length, 1, "exactly one RisingRow render site");
  assert.match(src, /visible\.map\(\(p, i\) => <RisingRow /, "and it renders `visible`, never analysis.picks");
  assert.ok(!/analysis=\{analysis\}|picks=\{analysis\.picks\}/.test(src), "the full ranking must never be handed to a component");
  // The empty state still wins: a scope with no ranked picks is told the truth
  // rather than sold a locked preview of a list that does not exist.
  assert.ok(
    src.indexOf("analysis.picks.length === 0 ? (") < src.indexOf('access === "none" ? ('),
    "the 'still building' state must be checked before the lock",
  );
});

test("signed-out locks ask for a free account, attributed and explained on /login", () => {
  for (const [f, path] of [[DEAL_FINDER, "/tools/deal-finder"], [RISING, "/tools/rising"]] as const) {
    assert.ok(read(f).includes(`/login?next=${path}&src=tool_preview`), `${f}: the CTA carries src=tool_preview`);
  }
  assert.ok(SIGNUP_SOURCES.has("tool_preview"), "the sign-up source must be whitelisted or it records as 'other'");
  const login = read("src/app/login/page.tsx");
  for (const path of ["/tools/deal-finder", "/tools/rising"]) {
    assert.match(login, new RegExp(`"${path}": "Create a free account to see [^"]*top 3`), `/login explains ${path}`);
  }
});

test("every tier table says Top 3 for the free account", () => {
  for (const feature of ["Deal Finder", "Rising Cards"]) {
    const row = TIER_COMPARISON.find((r) => r.feature === feature);
    assert.equal(row?.account, "Top 3", `TierComparisonTable: ${feature}`);
  }
  const article = getArticles().find((a) => a.slug === "riftcompare-premium-explained");
  assert.ok(article, "expected the Premium explainer article");
  const rows = article!.body.split("\n").filter((l) => l.trim().startsWith("| "));
  // No "No account" column (2026-09-22): every row is Feature + 3 tiers.
  assert.ok(!rows[0].includes("No account"), "the No account column must stay gone");
  for (const r of rows.filter((l) => /^\| (Deal Finder|Rising Cards|Rising Sealed|Ad-free experience) \|/.test(l))) {
    assert.equal(r.split("|").length - 2, 4, `row has the wrong number of cells: ${r}`);
  }
  const cellsFor = (feature: string) => {
    const row = rows.find((r) => r.startsWith(`| ${feature} |`));
    assert.ok(row, `expected a "${feature}" row`);
    return row!.split("|").slice(2, -1).map((c) => c.trim());
  };
  assert.deepEqual(cellsFor("Deal Finder"), ["Top 3", "Full list", "Full list"]);
  assert.deepEqual(cellsFor("Rising Cards"), ["Top 3", "Full list", "Full list"]);
  assert.equal(cellsFor("Rising Sealed")[0], "Top pick", "Rising Sealed keeps its own single free pick");
  assert.deepEqual(cellsFor("Ad-free experience"), ["—", "✓", "✓"], "ad-free is on both paid tiers (2026-09-25)");
});

// Promises that were true at some point and are not now: "Premium only" (09-22
// to 09-23), "the #1 pick" / "top result only" (before 09-22). The article
// carried the last two for a day after they stopped being true.
const STALE = /Premium only|#1 pick|top result only|Free shows only the top pick|only the top pick/i;

test("nothing still describes the old access for these two tools", () => {
  const premiumPage = read("src/app/premium/page.tsx");
  const blockFor = (href: string) => {
    const i = premiumPage.indexOf(`href: "${href}"`);
    assert.ok(i > 0, `expected a Premium feature block for ${href}`);
    return premiumPage.slice(Math.max(0, premiumPage.lastIndexOf("{", premiumPage.lastIndexOf("body:", i))), i);
  };
  for (const href of ["/tools/rising", "/tools/deal-finder"]) {
    assert.ok(!STALE.test(blockFor(href)), `${href}'s /premium pitch describes old access`);
    assert.match(blockFor(href), /Free accounts see the top three/, `${href}'s /premium pitch names the free top three`);
  }
  const article = getArticles().find((a) => a.slug === "riftcompare-premium-explained")!;
  for (const section of ["### 2. Rising Cards", "### 3. Deal Finder"]) {
    const at = article.body.indexOf(section);
    assert.ok(at > 0, `expected the article section ${section}`);
    const body = article.body.slice(at, article.body.indexOf("\n### ", at + 5));
    assert.ok(!STALE.test(body), `${section} still describes old access`);
    assert.match(body, /free account sees the top three/i, `${section} names the free top three`);
  }
  for (const f of ["src/components/PremiumSlideIn.tsx", DEAL_FINDER, RISING]) {
    assert.ok(!STALE.test(code(f)), `${f} still describes old access in user-visible text`);
  }
});

test("gating the tables did not leave Deal Finder thin", () => {
  // A signed-out visitor still sees no rows, so the explainer is what keeps the
  // page above the 150-word floor the AdSense audit treats as thin content. It
  // is rendered visibly AND as FAQPage schema from ONE array.
  const src = read(DEAL_FINDER);
  const answers = [...src.matchAll(/^\s{4}a: "([^"]+)",$/gm)].map((m) => m[1]);
  assert.ok(answers.length >= 4, `expected >=4 explainer answers, found ${answers.length}`);
  const words = answers.join(" ").split(/\s+/).filter(Boolean).length;
  assert.ok(words >= 150, `explainer is ${words} words — under the thin-content floor on its own`);
  assert.match(src, /DEAL_FAQS\.map\(\(f\) => \(/, "the explainer must be rendered visibly");
  assert.match(src, /"@type": "FAQPage"[\s\S]{0,120}mainEntity: DEAL_FAQS\.map\(/, "schema must read the same array");
});
