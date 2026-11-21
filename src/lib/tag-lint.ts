// The tag lint (2026-11-19, boardroom: "fail the build if an affiliate tag or customid is missing on a paid row"). A paid row whose
// link lost its eBay campaign, its customid or TCGplayer's Impact wrap earns nothing and nobody notices: the click still works.
// So the build runs this first (scripts/tag-lint.ts, `npm run build`) and stops on any problem, and tests/tag-lint.test.ts runs it in
// CI. It checks the link BUILDERS every paid row goes through, in every market, with classifyLink (lib/affiliate-gaps.ts, the same
// rule the weekly outside audit uses), and that no component hard-codes an eBay or TCGplayer link that skips them.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { affiliateUrl, ebayAffiliateUrl, ebaySearchUrl } from "./affiliate";
import { classifyLink } from "./affiliate-gaps";
import { COUNTRY_LIST } from "./country";

const SITE = "https://riftcompare.com";

function absolute(u: string): string {
  return u.startsWith("/") ? SITE + u : u;
}

export function tagLintProblems(root = process.cwd()): string[] {
  const out: string[] = [];
  for (const c of COUNTRY_LIST) {
    const search = ebaySearchUrl(c.code, "Jinx Loose Cannon", "card-fallback");
    if (classifyLink(search) !== "ebay") out.push(`eBay search for ${c.code} is ${classifyLink(search)}: ${search}`);
  }
  for (const host of ["www.ebay.com", "www.ebay.com.au", "www.ebay.co.uk", "www.ebay.ca", "www.ebay.es"]) {
    const item = ebayAffiliateUrl(`https://${host}/itm/123456789012`, "card");
    if (classifyLink(item) !== "ebay") out.push(`eBay listing on ${host} is ${classifyLink(item)}: ${item}`);
  }
  for (const u of ["https://www.tcgplayer.com/product/123456", "https://www.tcgplayer.com/search/riftbound-league-of-legends-trading-card-game/product?q=Jinx"]) {
    const t = absolute(affiliateUrl(u, "tcgplayer", "/card"));
    if (classifyLink(t) !== "tcgplayer") out.push(`TCGplayer link is ${classifyLink(t)}: ${t}`);
  }
  // No component or page may hand a visitor a bare eBay or TCGplayer link: every one goes through a builder above.
  const raw = /href=["'`]https:\/\/(?:www\.)?(?:ebay\.[a-z.]+|tcgplayer\.com)\//;
  for (const dir of ["src/components", "src/app"]) {
    for (const f of walk(join(root, dir))) {
      if (raw.test(readFileSync(f, "utf8"))) out.push(`bare eBay/TCGplayer href in ${f.slice(root.length + 1)}`);
    }
  }
  return out;
}

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files.push(...walk(p));
    else if (/\.tsx?$/.test(name)) files.push(p);
  }
  return files;
}
