import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getArticles } from "../src/lib/articles";

// ─────────────────────────────────────────────────────────────────────────────
// Deal Finder and Rising Cards give a signed-out visitor and a free account
// NOTHING — not a teaser row, and not the row's data in the HTML either.
// Owner instruction, 2026-09-22: "no account and free account don't even get
// the top pick for deal finder and rising cards."
//
// The second half is the part a test has to hold. The previous gate rendered
// the real table and blurred every row but the first in CSS, so all six
// fetched rows were sitting in the server HTML — "locked" only to someone who
// never opened devtools. A future pass restoring a teaser would most naturally
// restore that shape, which is why these assert on the QUERY, not the markup.
//
// Rising Sealed and Value Finder deliberately still show a top pick; they were
// not in the instruction and are not asserted here.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const DEAL_FINDER = "src/app/tools/deal-finder/page.tsx";
const RISING = "src/app/tools/rising/page.tsx";

test("Deal Finder runs no query at all below Premium", () => {
  const src = read(DEAL_FINDER);
  // Every one of the four view tabs fetches only when `premium`, and passes the
  // real PAGE_SIZE — no teaser size, because there is no teaser.
  const loaders = ["getArbitrage(", "getEbayCheapest(", "getCrossRegionGaps(", "getArbitrageVsTcgplayer("];
  for (const fn of loaders) {
    const call = new RegExp(`const data = premium \\? await ${fn.replace("(", "\\(")}`);
    assert.match(src, call, `${fn} must be called only when premium`);
  }
  assert.ok(!/TEASER_SIZE/.test(src.replace(/\/\/[^\n]*/g, "")), "no teaser size may come back in code");
  assert.ok(!/premium \? page : 1/.test(src), "the teaser's page pinning must be gone");
});

test("Deal Finder's locked state takes no data, so it cannot leak rows", () => {
  const src = read(DEAL_FINDER);
  assert.ok(!/function LockedTable/.test(src), "LockedTable wrapped the real table — it must stay gone");
  assert.match(src, /function LockedPreview\(\{ signedIn \}: \{ signedIn: boolean \}\)/, "the locked state must take only signedIn");
  // A blur class on a table row is the exact shape of the old leak.
  assert.ok(!/tbody_tr[^\n]*blur/.test(src), "table rows must not be 'hidden' behind a CSS blur");
  assert.equal((src.match(/<LockedPreview signedIn=\{signedIn\} \/>/g) ?? []).length, 4, "all four views must use it");
});

test("Rising Cards renders no pick below Premium", () => {
  const src = read(RISING);
  assert.ok(!/const top = analysis\.picks\[0\]/.test(src), "the top pick must not be pulled out for the free view");
  assert.ok(!/<RisingRow p=\{top\}/.test(src), "the free view must not render a real row");
  // The only RisingRow left is the full Premium list.
  assert.equal((src.match(/<RisingRow /g) ?? []).length, 1, "exactly one RisingRow render site, the Premium table");
  // The empty state is checked before the lock, so a scope with no picks is
  // told the truth instead of being sold a list that does not exist.
  assert.ok(
    src.indexOf("analysis.picks.length === 0 ? (") < src.indexOf("!premium && !ADSENSE_REVIEW_MODE ? ("),
    "the 'still building' state must be checked before the Premium lock",
  );
});

const PROMISE = /top pick is (free|on us)|free to preview|Free shows only the top pick|only the top pick/i;

test("nothing still advertises a free top pick on these two tools", () => {
  for (const f of ["src/components/PremiumSlideIn.tsx", "src/lib/articles.ts", DEAL_FINDER, RISING]) {
    // Comments explaining the removal are fine; user-visible strings are not.
    const code = read(f).replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.ok(!PROMISE.test(code), `${f} still promises a free top pick`);
  }
});

test("gating the tables did not leave Deal Finder thin", () => {
  // A free visitor now sees no rows, so the page's only prose is one view's
  // intro — under the 150-word floor the AdSense audit treats as thin content,
  // on a page in the sitemap at priority 0.7. The explainer is what covers it,
  // and it is rendered visibly AND as FAQPage schema from ONE array, which is
  // the only way Google honours the markup.
  const src = read(DEAL_FINDER);
  const answers = [...src.matchAll(/^\s{4}a: "([^"]+)",$/gm)].map((m) => m[1]);
  assert.ok(answers.length >= 4, `expected >=4 explainer answers, found ${answers.length}`);
  const words = answers.join(" ").split(/\s+/).filter(Boolean).length;
  assert.ok(words >= 150, `explainer is ${words} words — under the thin-content floor on its own`);
  assert.match(src, /DEAL_FAQS\.map\(\(f\) => \(/, "the explainer must be rendered visibly");
  assert.match(src, /"@type": "FAQPage"[\s\S]{0,120}mainEntity: DEAL_FAQS\.map\(/, "schema must read the same array");
});

test("the Premium explainer's tier table matches the gate and drops the anon column", () => {
  // The article carries its own markdown copy of the tier table. It is the one
  // place a reader lands from search rather than from the pricing page, and it
  // had drifted twice: it still promised Deal Finder and Rising Cards "Top
  // pick" to free accounts after the 2026-09-22 gate change, and its ad-free
  // row still gave Plus a tick nine days after ad-free became Premium-only.
  const article = getArticles().find((a) => a.slug === "riftcompare-premium-explained");
  assert.ok(article, "expected the Premium explainer article");
  const rows = article!.body.split("\n").filter((l) => l.trim().startsWith("| "));
  assert.ok(rows.length > 10, `expected the tier table, found ${rows.length} table rows`);

  // "No account" column removed 2026-09-22 — every row is Feature + 3 tiers.
  assert.ok(!rows[0].includes("No account"), "the No account column must be gone from the header");
  for (const r of rows) {
    assert.equal(r.split("|").length - 2, 4, `row has the wrong number of cells: ${r}`);
  }

  const cellsFor = (feature: string) => {
    const row = rows.find((r) => r.startsWith(`| ${feature} |`));
    assert.ok(row, `expected a "${feature}" row`);
    return row!.split("|").slice(2, -1).map((c) => c.trim());
  };
  // [free, plus, premium]
  for (const feature of ["Deal Finder", "Rising Cards"]) {
    assert.equal(cellsFor(feature)[0], "—", `${feature} must show nothing for a free account`);
  }
  assert.equal(cellsFor("Rising Sealed")[0], "Top pick", "Rising Sealed still gives a free top pick");
  assert.deepEqual(cellsFor("Ad-free experience"), ["—", "—", "✓"], "ad-free is Premium-only");
});

test("the Premium page's pitch for each tool matches what it now shows", () => {
  // Scoped per feature block rather than per file: RISING SEALED still gives a
  // free top pick and its copy must keep saying so. Only the two tools named in
  // the instruction changed.
  const src = read("src/app/premium/page.tsx");
  const blockFor = (href: string) => {
    const i = src.indexOf(`href: "${href}"`);
    assert.ok(i > 0, `expected a Premium feature block for ${href}`);
    return src.slice(Math.max(0, src.lastIndexOf("{", src.lastIndexOf("body:", i))), i);
  };
  for (const href of ["/tools/rising", "/tools/deal-finder"]) {
    assert.ok(!PROMISE.test(blockFor(href)), `${href}'s Premium pitch still promises a free top pick`);
  }
  assert.match(blockFor("/tools/rising-sealed"), PROMISE, "Rising Sealed still shows a top pick — its copy must still say so");
});
