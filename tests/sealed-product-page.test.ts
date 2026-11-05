import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { sealedPath, sealedSlug } from "../src/lib/sealed-slug";

// ─────────────────────────────────────────────────────────────────────────────
// SEALED PRODUCTS GET THEIR OWN PAGES (2026-11-03, DECISIONS.md). /sealed/<slug>
// is one CDN copy per product, like /card/[id]: force-dynamic, a day plus a day
// stale from next.config.js, nothing in its server tree reads the visitor. Its
// board is the quick view's plus Amazon as the third pinned row (owner,
// 2026-11-03); the quick view, an overlay, never shows Amazon.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();
const PAGE = "src/app/sealed/[slug]/page.tsx";
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

function resolveSpec(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(ROOT, "src", spec.slice(2)) : spec.startsWith(".") ? resolve(dirname(from), spec) : null;
  if (!base) return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}
function serverClosure(entries: string[]): string[] {
  const seen = new Set<string>(), stack = entries.map((e) => join(ROOT, e));
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    const src = readFileSync(f, "utf8");
    if (/^\s*["']use client["']/.test(src)) continue;
    for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s+(?!type\s)(?:[^;'"`]*?\sfrom\s+)?["']([^"']+)["']/g)) {
      const r = resolveSpec(f, m[1]!);
      if (r && /\.tsx?$/.test(r)) stack.push(r);
    }
  }
  return [...seen].map((f) => relative(ROOT, f));
}

test("the slug comes from the group key: the same in every market, URL-safe, stable", () => {
  assert.equal(sealedSlug("OGN|Booster Box"), "ogn-booster-box");
  assert.equal(sealedSlug("SFD|Champion Deck (Fiora) Display"), "sfd-champion-deck-fiora-display");
  assert.equal(sealedPath("RAD|Bundle"), "/sealed/rad-bundle");
  assert.match(sealedSlug("02492025galiofakerriftboundxt12025worlds"), /^[a-z0-9-]+$/);
  assert.ok(sealedSlug("x".repeat(200)).length <= 80);
  assert.doesNotMatch(sealedSlug("OGN|Booster Box |"), /-$/);
});

test("the page renders per request and the CDN keeps it a day; no ISR, no prewarming", async () => {
  const src = read(PAGE);
  assert.match(src, /^export const dynamic = "force-dynamic";$/m);
  assert.doesNotMatch(src, /^export const revalidate\b|^export (?:async )?function generateStaticParams/m);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cfg = require(join(ROOT, "next.config.js")) as { headers: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]> };
  const rule = (await cfg.headers()).find((h) => h.source === "/sealed/:slug");
  assert.deepEqual(rule?.headers, [{ key: "Vercel-CDN-Cache-Control", value: "public, s-maxage=86400, stale-while-revalidate=86400" }]);
  assert.match(src, /getSealedProductBySlug\(params\.slug\)/, "the /sealed page's own cached groups, no new query");
});

test("nothing the page's server render reaches reads the visitor (one CDN copy serves everyone)", () => {
  const files = serverClosure([PAGE, "src/app/layout.tsx"]);
  assert.ok(files.length > 10, `walked ${files.length} files`);
  const offenders: string[] = [];
  for (const f of files) {
    const src = read(f).replace(/\/\/.*$/gm, "");
    if (/from ["']next\/headers["']/.test(src)) offenders.push(`${f}: imports next/headers`);
    const call = /(?<![.\w])(getCountry|getDisplayCurrency|getCurrentUser|getSessionUser|readSession)\s*\(/.exec(src);
    if (call) offenders.push(`${f}: calls ${call[1]}()`);
    if (/searchParams/.test(src) && f === PAGE) offenders.push(`${f}: reads searchParams`);
  }
  assert.deepEqual(offenders, []);
});

test("Amazon is the third pinned row on the product page only, never in the quick view", () => {
  const qv = read("src/components/SealedQuickView.tsx");
  assert.match(qv, /\{lead\.length === 0 && amazonRow\}/, "first after eBay's search row when nothing is pinned");
  assert.match(qv, /i === lead\.length - 1 \? amazonRow : null/, "right after the pinned eBay and TCGplayer rows");
  assert.match(qv, /const amazonStore = amazon \? amazonFor\(country\) : null;/);
  assert.match(qv, /<AffiliateDisclosure partner="amazon" \/>/, "Amazon's statement beside its link");
  const modal = qv.slice(qv.indexOf("function SealedQuickViewModal"), qv.indexOf("export function SealedOffers"));
  assert.match(modal, /<SealedOffers group=\{group\} currency=\{currency\} \/>/, "the quick view passes no amazon");
  assert.match(read("src/components/SealedProductView.tsx"), /<SealedOffers [^>]*amazon source="sealed-page"/);
  assert.doesNotMatch(qv, /priceCents[^\n]*amazon|amazon[^\n]*priceCents/i, "no Amazon price in the board's own code");
  assert.match(qv, /<AmazonLiveSlot country=\{country\} slug=\{sealedSlug\(group\.groupKey\)\}/, "Amazon's own price comes only through the live slot (2026-11-05)");
});

test("tiles and the quick view link to the page, and the sitemap lists every product", () => {
  const tile = read("src/components/SealedTile.tsx");
  assert.match(tile, /href=\{sealedPath\(g\.groupKey\)\}/);
  assert.match(tile, /e\.preventDefault\(\);\s*open\(g, currency\);/, "a plain click still opens the quick view");
  assert.match(read("src/components/SealedQuickView.tsx"), /href=\{sealedPath\(group\.groupKey\)\}/);
  assert.match(read("src/lib/sitemap-sections.ts"), /\$\{SITE_URL\}\/sealed\/\$\{r\.slug\}/);
});
