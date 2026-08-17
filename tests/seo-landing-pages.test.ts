import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { SETS, newestReleasedSet } from "../src/lib/constants";
import { getArticles } from "../src/lib/articles";

// ─────────────────────────────────────────────────────────────────────────────
// Guards for the search-demand work (GSC: high-impression, near-zero-click
// queries we were losing at position ~8).
//
// These are SOURCE-LEVEL invariants deliberately, not rendered-HTML assertions:
// the rendered checks already exist and need a running server plus a database
// (scripts/smoke-pages.ts, scripts/crawl-check.ts). This file runs in `npm test`
// with neither, so it can gate a PR — it catches the edits that silently undo the
// SEO work (a route flipped to force-dynamic, a canonical dropped, an FAQ whose
// visible copy no longer matches its schema).
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

const GALLERY = "src/app/sets/[set]/gallery/page.tsx";
const RIFTLE = "src/app/riftle/page.tsx";

// ── Vendetta card gallery ("vendetta card gallery", "riftbound vendetta gallery")
test("gallery route stays statically renderable (no cookies/searchParams)", () => {
  const src = read(GALLERY);
  assert.ok(src.includes("export const revalidate"), "gallery must export a revalidate window");
  assert.ok(
    !src.includes('dynamic = "force-dynamic"'),
    "gallery must NOT be force-dynamic — it is a 200+ tile page and localises prices client-side",
  );
  // getCountry() reads cookies, which would opt the whole route into per-request
  // rendering and undo the point of the page.
  assert.ok(!src.includes("getCountry("), "gallery must not read cookies via getCountry()");
});

test("gallery emits ItemList structured data and a canonical", () => {
  const src = read(GALLERY);
  assert.ok(src.includes('"@type": "ItemList"'), "gallery must emit ItemList JSON-LD");
  assert.ok(src.includes("itemListElement"), "ItemList must carry its items");
  assert.ok(src.includes("canonical:"), "gallery must declare a canonical");
});

test("gallery caps its payload so a big set can't wreck LCP", () => {
  const src = read(GALLERY);
  const cap = /const MAX_TILES = (\d+)/.exec(src);
  assert.ok(cap, "gallery must define MAX_TILES");
  assert.ok(Number(cap![1]) <= 500, `MAX_TILES ${cap![1]} is too high for one page`);
  assert.ok(src.includes("take: MAX_TILES"), "the query must actually apply MAX_TILES");
});

test("gallery fails open on a database error", () => {
  const src = read(GALLERY);
  // A DB blip must render an empty gallery, never a 500 on an indexed URL. This
  // is also what let the route build in CI with no database at all.
  assert.match(src, /catch\s*{[\s\S]*?return \[\];/, "gallery query must catch and return []");
});

test("every set's gallery is in the sitemap", () => {
  const src = read("src/lib/sitemap-sections.ts");
  assert.ok(
    src.includes("/gallery`"),
    "sitemap sets() must emit a /sets/<slug>/gallery URL per set",
  );
});

test("the current set's gallery is internally linked from the key surfaces", () => {
  // An indexable page nothing links to is a page Google discovers late and trusts
  // little. These are the three strongest internal links available to it.
  //
  // The homepage surface MOVED (2026-08-09): it used to be the Vendetta launch
  // band, which was removed once the set stopped being new. The link survived the
  // removal but now resolves through newestReleasedSet(), so it follows whichever
  // set is current instead of naming one — which is why this assertion looks for
  // a template literal rather than a "/sets/vendetta/gallery" string.
  const surfaces: [string, string][] = [
    // Moved into HomeSections.tsx (shared with the 5 region home pages) when
    // the homepage's feature sections were factored out of app/page.tsx.
    ["src/components/home/HomeSections.tsx", "homepage"],
    ["src/app/sets/[set]/page.tsx", "set page"],
    ["src/lib/articles.ts", "guides/blog"],
  ];
  for (const [path, label] of surfaces) {
    assert.ok(
      read(path).includes("/sets/vendetta/gallery") || read(path).includes("/gallery`"),
      `${label} (${path}) must link to the Vendetta card gallery`,
    );
  }
});

// ── Set page: list intent, not buyer intent ─────────────────────────────────
test("set page title leads with card-list intent, price second", () => {
  const src = read("src/app/sets/[set]/page.tsx");
  // It used to be "Riftbound <set> Prices — Cheapest Sellers", which is a buyer
  // hook aimed at a list-shaped query ("vendetta card list", position 10.5). The
  // mismatch is what produced impressions without clicks.
  assert.ok(
    src.includes("Card List & Prices"),
    "set page title must lead with 'Card List' and keep price secondary",
  );
  assert.ok(
    !src.includes("Prices — Cheapest Sellers"),
    "the old buyer-hook title must not come back",
  );
  // Title and H1 disagreeing is its own intent mismatch.
  assert.ok(src.includes("card list &amp; prices"), "H1 must mirror the list-first title");
});

test("set page and gallery do not chase the same query", () => {
  // The whole point of the split: /sets/<slug> owns "card list", the gallery owns
  // "card gallery". If the set page ever says "Card Gallery" in its title they are
  // competing with each other again.
  const setSrc = read("src/app/sets/[set]/page.tsx");
  const titleBlock = setSrc.slice(setSrc.indexOf("titleCandidates"), setSrc.indexOf("descCandidates"));
  assert.ok(!/Card Gallery/i.test(titleBlock), "set page title must not claim 'Card Gallery'");
  assert.ok(read(GALLERY).includes("Card Gallery"), "gallery page must claim 'Card Gallery'");
});

test("set and gallery titles stay inside Google's truncation for every set", () => {
  // Both pages step their title down through candidates; this asserts the longest
  // real set name still fits with the " | RiftCompare" suffix attached.
  const longest = SETS.reduce((a, b) => (a.name.length >= b.name.length ? a : b)).name;
  const fits = (c: string[]) => c.some((t) => `${t} | RiftCompare`.length <= 60);
  assert.ok(
    fits([`Riftbound ${longest} Card List & Prices`, `Riftbound ${longest} Card List`, `${longest} Card List & Prices`]),
    `no set-page title candidate fits for "${longest}"`,
  );
  assert.ok(
    fits([`Riftbound ${longest} Card Gallery`, `${longest} Card Gallery`]),
    `no gallery title candidate fits for "${longest}"`,
  );
});

// ── Riftle ("riftle": 213 impressions, 0.5% CTR, position ~7.2) ──────────────
test("riftle page claims its own name as an entity", () => {
  const src = read(RIFTLE);
  assert.ok(src.includes('"@type": "VideoGame"'), "riftle must emit VideoGame JSON-LD");
  assert.ok(src.includes('name: "Riftle"'), "the VideoGame node must be named Riftle");
  assert.ok(src.includes("faqPage(FAQ)"), "riftle must emit FAQPage JSON-LD from its FAQ");
});

test("riftle's FAQ schema has a visible counterpart", () => {
  const src = read(RIFTLE);
  // Google honours FAQPage only when the same Q&A is on the page. Both the schema
  // and the rendered list read the single FAQ const, so they cannot drift — this
  // asserts that wiring specifically, because splitting them is the easy mistake.
  assert.ok(src.includes("FAQ.map("), "the FAQ array must also be rendered visibly");
  const count = (src.match(/\bq: "/g) ?? []).length;
  assert.ok(count >= 4, `expected >=4 FAQ entries, found ${count}`);
});

test("riftle title leads with the query term", () => {
  const src = read(RIFTLE);
  const title = /title: "(.*?)"/.exec(src)?.[1] ?? "";
  assert.ok(title.startsWith("Riftle"), `title should lead with "Riftle", got ${JSON.stringify(title)}`);
});

// ── Mechanics cluster: Flow/Burn must mirror the Empower page that wins ──────
test("empower, flow and burn guides share the winning structure", () => {
  const bySlug = new Map(getArticles().map((a) => [a.slug, a]));
  for (const slug of ["riftbound-empower-explained", "riftbound-flow-explained", "riftbound-burn-explained"]) {
    const a = bySlug.get(slug);
    assert.ok(a, `${slug} must exist`);

    // Question-shaped title — the single biggest difference between the Empower
    // page and its two siblings when this work started.
    assert.match(a!.title, /Explained: How the .+ Mechanic Works/, `${slug} title shape`);

    // FAQ block backing FAQPage schema.
    assert.ok((a!.faq?.length ?? 0) >= 4, `${slug} needs >=4 FAQ entries`);

    // Step-by-step section — the part that actually answers "how does X work".
    assert.match(a!.body, /step by step/i, `${slug} needs a step-by-step section`);
    assert.match(a!.body, /^1\. /m, `${slug} needs numbered steps`);

    // A CTA into live prices, which is how these guides earn their keep.
    assert.ok(a!.browseCta, `${slug} needs a browseCta into live prices`);

    // Cross-links to the other two mechanics.
    for (const other of ["empower", "flow", "burn"].filter((k) => !slug.includes(k))) {
      assert.ok(
        a!.body.includes(`/guides/riftbound-${other}-explained`),
        `${slug} must cross-link the ${other} guide`,
      );
    }
  }
});

test("every guide FAQ entry is answered in the visible body", () => {
  // FAQPage schema describing answers a reader cannot see is exactly the mismatch
  // Google drops rich results for. Checked across the three mechanics guides.
  const bySlug = new Map(getArticles().map((a) => [a.slug, a]));
  for (const slug of ["riftbound-empower-explained", "riftbound-flow-explained", "riftbound-burn-explained"]) {
    const a = bySlug.get(slug)!;
    assert.match(a.body, /##\s+.*FAQ/i, `${slug} needs a visible "## ... FAQ" section`);
    for (const { q } of a.faq ?? []) {
      assert.ok(a.body.includes(q), `${slug}: FAQ question not visible in body — ${JSON.stringify(q)}`);
    }
  }
});

// ── No two pages may chase the same query ───────────────────────────────────
test("only one page targets the vendetta gallery query", () => {
  // The old blog post and the new gallery page both used to say "Card List &
  // Gallery". Two of our own URLs competing for one query helps neither.
  const galleryTitled = getArticles().filter((a) => /card\s*(list\s*&\s*)?gallery/i.test(a.title));
  assert.equal(
    galleryTitled.length,
    0,
    `articles still titled as the gallery (competes with /sets/*/gallery): ${galleryTitled.map((a) => a.slug).join(", ")}`,
  );
});

test("SETS all resolve to a gallery path", () => {
  // generateStaticParams builds one gallery per set; a set without a slug would
  // silently produce a broken route.
  for (const s of SETS) {
    assert.ok(s.slug && /^[a-z0-9-]+$/.test(s.slug), `set ${s.code} needs a url-safe slug`);
  }
});

test("newestReleasedSet() follows the calendar, and ignores unreleased sets", () => {
  // The homepage gallery link resolves through this. The failure it guards
  // against is the one that made the Vendetta launch band need removing by hand:
  // a surface that names one set and then quietly goes stale.
  assert.equal(newestReleasedSet(new Date("2026-08-09T00:00:00Z"))?.code, "VEN");
  // Radiance is dated 23 Oct 2026 — before that day it must not win, even though
  // it carries the latest releasedOn in SETS.
  assert.equal(newestReleasedSet(new Date("2026-10-22T00:00:00Z"))?.code, "VEN");
  assert.equal(newestReleasedSet(new Date("2026-10-23T12:00:00Z"))?.code, "RAD");
  // Before any set shipped, there is no "current set" to link to and the caller
  // renders nothing rather than a broken URL.
  assert.equal(newestReleasedSet(new Date("2020-01-01T00:00:00Z")), undefined);
});
