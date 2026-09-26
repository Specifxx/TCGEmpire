import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ARTICLES } from "../src/lib/articles";
import { NAV_GROUPS, FOOTER_GROUPS } from "../src/components/nav-groups";

// ─────────────────────────────────────────────────────────────────────────────
// UPDATED 2026-09-26 (DECISIONS.md "Public decks"): /decks is live again as the
// PLAYER-PUBLISHED deck library (PublishedDeck rows, attributed to whoever
// published them). What stays banned is the thing that was removed: the
// hand-copied meta-deck data and its libraries. The tests below keep that half.
//
// THE META DECKS ARE GONE, AND STAY GONE UNTIL THERE IS A SOURCE WE MAY USE.
//
// /decks, /decks/[slug], /decks/archetype/* and /decks/domain/* were built on
// prisma/meta-decks.json — ten hand-typed lists that were stale within weeks
// and partly unresolvable, so the pages printed things the data could not back.
// Removed 2026-09-12 (DECISIONS.md, "Meta decks: removed"). No legitimate
// machine-readable replacement exists: riftdecks.com bans competing sites and
// AI agents and sits behind Cloudflare; Piltover Archive's terms forbid
// automated and commercial use; TopDeck.gg needs an API key the site does not
// hold. Rebuild only from one of those with permission or a key — never from a
// hand copy again.
//
// These assertions are what stops a "helpful" re-add: a stray link to a page
// that now 301s, a re-imported JSON, or the deck builder quietly losing the
// nav slot that keeps /deck from becoming an orphan.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT = process.cwd();

test("the hand-copied meta-deck data file and its libs do not exist", () => {
  for (const p of [
    "prisma/meta-decks.json",
    "src/lib/meta-decks.ts",
    "src/lib/deck-groups.ts",
    "src/lib/deck-basket.ts",
    "src/components/DeckView.tsx",
    "src/components/DecksMetaTable.tsx",
  ]) {
    assert.ok(!existsSync(join(ROOT, p)), `${p} is back — read DECISIONS.md "Meta decks: removed" before restoring it`);
  }
});

test("no article asks for the retired metaStaples gallery", () => {
  for (const a of ARTICLES) {
    for (const e of [...(a.embeds ?? []), ...(a.embed ? [a.embed] : [])]) {
      assert.ok(!("metaStaples" in e), `${a.slug} still uses the metaStaples embed`);
    }
  }
});

test("/decks is a live route again: no redirect sends it (or anything under it) away", async () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cfg = require("../next.config.js") as { redirects: () => Promise<{ source: string; destination: string; permanent: boolean }[]> };
  const rows = await cfg.redirects();
  assert.deepEqual(rows.filter((r) => r.source === "/decks" || r.source.startsWith("/decks/")), []);
  assert.ok(existsSync(join(ROOT, "src/app/decks/page.tsx")));
  assert.ok(existsSync(join(ROOT, "src/app/decks/[slug]/page.tsx")));
  assert.ok(existsSync(join(ROOT, "src/app/decks/legend/[legend]/page.tsx")));
});

test("the deck builder keeps a nav and a footer link, so /deck is never an orphan", () => {
  const inNav = NAV_GROUPS.some((g) => g.links.some((l) => l.href === "/deck"));
  const inFooter = FOOTER_GROUPS.some((g) => g.links.some((l) => l.href === "/deck"));
  assert.ok(inNav, "/deck must stay in NAV_GROUPS (launcher + mega-menu)");
  assert.ok(inFooter, "/deck must stay in FOOTER_GROUPS (the server-rendered link internal-linking relies on)");
  // The player-published library (2026-09-26) sits beside the builder.
  assert.ok(NAV_GROUPS.some((g) => g.links.some((l) => l.href === "/decks")), "/decks (the deck library) belongs in the nav");
});
