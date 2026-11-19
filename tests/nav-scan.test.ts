import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// Owner, 2026-11-19: "the scan a card should be within the collection page on mobile and on pc it should be visible somewhere as
// well in the navigation".
test("Scan shows only when /api/me says the scanner is open to this viewer, from the scanner's own rules", () => {
  const me = read("src/app/api/me/route.ts");
  assert.match(me, /scanAccess\(cfg,/);
  const links = read("src/components/HeaderCollectionLinks.tsx");
  assert.match(links, /\{scan && \(/);
  assert.match(links, /href="\/scan"/);
  assert.match(read("src/components/Navbar.tsx"), /<HeaderCollectionLinks \/>/);
});

test("the binder leads with Scan a card when the account may scan", () => {
  const page = read("src/app/portfolio/page.tsx");
  assert.match(page, /const canScan = scanAccess\(scanConfig\(\), \{ isAdmin: user\.isAdmin, premium \}\)\.ok;/);
  assert.ok(page.indexOf("data-binder-scan") < page.indexOf('href="/portfolio/sets" className="btn-ghost'), "before the set checklist");
});
