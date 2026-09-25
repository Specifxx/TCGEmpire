import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NAV_GROUPS } from "../src/components/nav-groups";
import { TIER_COMPARISON } from "../src/components/TierComparisonTable";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const code = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");

// ─────────────────────────────────────────────────────────────────────────────
// THE 2026-09-25 PREMIUM LINEUP: FIVE TOOLS LEFT THE PRODUCT.
//
// Owner: fewer tools, each one worth paying for. Each retired URL 301s to the
// free page that now carries its useful part (next.config.js), so nothing
// inbound 404s — but an INTERNAL link to one is a redirect hop on every click
// and tells a crawler we still consider the page ours. These pin that the
// pages and their dead loaders are gone and that nothing on the site links to
// them any more. DECISIONS.md, "Premium lineup: fewer tools, each one worth
// paying for".
// ─────────────────────────────────────────────────────────────────────────────

const RETIRED: { path: string; to: string; files: string[] }[] = [
  {
    path: "/tools/condition-calculator",
    to: "/guides/riftbound-card-condition-guide",
    files: ["src/app/tools/condition-calculator/page.tsx", "src/components/ConditionCalculator.tsx"],
  },
  { path: "/tools/value-finder", to: "/movers", files: ["src/app/tools/value-finder/page.tsx", "src/lib/screener.ts"] },
  { path: "/tools/demand", to: "/movers#most-searched", files: ["src/app/tools/demand/page.tsx"] },
  {
    path: "/tools/rising-sealed",
    to: "/sealed",
    files: ["src/app/tools/rising-sealed/page.tsx", "src/lib/sealed-rise-predictor.ts"],
  },
  { path: "/bulk-pricer", to: "/deck", files: ["src/app/bulk-pricer/page.tsx"] },
];

test("each retired tool's page (and any loader only it used) is deleted, and its URL 301s", () => {
  const cfg = read("next.config.js");
  for (const r of RETIRED) {
    for (const f of r.files) assert.ok(!existsSync(join(ROOT, f)), `${f} should be deleted`);
    assert.ok(
      cfg.includes(`{ source: "${r.path}", destination: "${r.to}", permanent: true }`),
      `${r.path} must 301 to ${r.to}`,
    );
  }
  // lib/demand.ts stays on purpose: /admin/demand and the free /movers strip read it.
  assert.ok(existsSync(join(ROOT, "src/lib/demand.ts")), "lib/demand.ts is still used — keep it");
});

test("the condition calculator's redirect lands on a real guide", () => {
  // Articles are routed by category: /guides/[slug] notFound()s a "blog" one.
  const articles = read("src/lib/articles.ts");
  const at = articles.indexOf('slug: "riftbound-card-condition-guide"');
  assert.ok(at > 0, "the condition guide must exist");
  assert.match(articles.slice(at, at + 120), /category: "guide"/, "…and be a guide, so /guides/<slug> serves it");
});

// Every text source a link can live in.
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...sourceFiles(rel));
    else if (/\.(tsx?|mjs|js|json|txt|xml|md)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

// Files NOT scanned, each for a stated reason:
//   • BulkPricer.tsx builds a /bulk-pricer?list= share URL; the Bulk Pricer's
//     paste handling is being folded into /deck and the component deleted by
//     the Best Basket & list-pricing workstream (D). The redirect carries the
//     ?list= through to /deck meanwhile.
//   • content/hub-intros.ts keys its intros by path; its "/bulk-pricer" and
//     "/tools/demand" entries are now unused data (no page renders them), not
//     links, and the file belongs to the Deal Finder workstream (B).
const NOT_SCANNED = new Set(["src/components/BulkPricer.tsx", "src/lib/content/hub-intros.ts"]);

test("nothing on the site still links to a retired tool", () => {
  const files = [...sourceFiles("src"), ...sourceFiles("public").filter((f) => !f.endsWith(".json"))].filter(
    (f) => !NOT_SCANNED.has(f),
  );
  assert.ok(files.length > 200, `fixture check: expected the whole tree, found ${files.length} files`);
  const offenders: string[] = [];
  for (const f of files) {
    const src = /\.(tsx?|mjs|js)$/.test(f) ? code(read(f)) : read(f);
    for (const r of RETIRED) {
      // A quoted path, a markdown link target, or a template/URL segment — the
      // path followed by a quote, ), ?, #, backtick or end of string.
      const re = new RegExp(`${r.path.replace(/\//g, "\\/")}(?=["'\`)?#\\s]|$)`, "m");
      if (re.test(src)) offenders.push(`${f} → ${r.path}`);
    }
  }
  assert.deepEqual(offenders, [], `internal links to retired tools:\n  ${offenders.join("\n  ")}`);
});

test("no nav entry, tier row or pitch chip names a retired tool", () => {
  const retiredNames = /Value Finder|Demand Finder|Rising Sealed|Bulk Pricer|Condition (Impact )?Calculator/i;
  for (const l of NAV_GROUPS.flatMap((g) => g.links)) {
    assert.ok(!RETIRED.some((r) => l.href === r.path), `nav still links ${l.href}`);
    assert.doesNotMatch(l.label, retiredNames, `nav label "${l.label}"`);
  }
  for (const r of TIER_COMPARISON) assert.doesNotMatch(r.feature, retiredNames, `tier row "${r.feature}"`);
  const pitch = /const PITCH_TOOLS[^=]*=\s*\[([\s\S]*?)\n\];/.exec(read("src/components/PremiumSlideIn.tsx"))?.[1] ?? "";
  assert.ok(pitch.length > 0, "fixture check: expected PITCH_TOOLS");
  assert.doesNotMatch(pitch, retiredNames, "a pitch chip names a retired tool");
  // "Daily Movers" was a mislabel: /movers compares weekly history points.
  assert.ok(NAV_GROUPS.flatMap((g) => g.links).some((l) => l.href === "/movers" && l.label === "Weekly Movers"));
});

test("the tools index lists only the kept tools, with the badges their gates earn", () => {
  const src = read("src/app/tools/page.tsx");
  const groups = src.slice(src.indexOf("const GROUPS"), src.indexOf("export default function"));
  const hrefs = [...groups.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(hrefs, ["/tools/deal-finder", "/tools/rising", "/tools/best-basket", "/tools/box-ev", "/sealed", "/deck", "/trade"]);
  const badgeFor = (href: string) => {
    const at = groups.indexOf(`href: "${href}"`);
    return /badge: ([^,\n]+),/.exec(groups.slice(at, groups.indexOf("}", at)))?.[1];
  };
  assert.equal(badgeFor("/tools/deal-finder"), "LIST_BADGE");
  assert.equal(badgeFor("/tools/rising"), "LIST_BADGE");
  assert.equal(badgeFor("/tools/best-basket"), '"Premium"');
  assert.match(src, /const LIST_BADGE = premiumPlusEnabled\(\) \? "Plus" : "Premium";/);

  // The FAQ (also the FAQPage JSON-LD) states the real access at every level —
  // it promised "their single best result free" for a day after that stopped
  // being true.
  const faq = code(src).slice(code(src).indexOf("const FAQS"), code(src).indexOf("interface Tool"));
  assert.doesNotMatch(faq, /single best result|top pick|value finder|bulk pricer|demand finder|rising sealed/i);
  assert.match(faq, /show nothing when you're signed out, the top 3 with a free account, and every row with \$\{LIST_BADGE\}, which is also ad-free/);
  assert.match(faq, /Best Basket shows your own list's delivered total with a free account; the store-by-store plan is part of Premium/);
});
