import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ARTICLES } from "../src/lib/articles";
import { NAV_GROUPS, FOOTER_GROUPS } from "../src/components/nav-groups";

// ─────────────────────────────────────────────────────────────────────────────
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

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js)$/.test(name)) out.push(p);
  }
  return out;
}

test("the /decks route tree, its data file and its libs do not exist", () => {
  for (const p of [
    "src/app/decks",
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

test("nothing under src/ links to /decks any more (comments about its removal aside)", () => {
  // Code, not prose: strip // line comments and /* */ block comments, then look
  // for the path in a string/JSX attribute. A comment explaining that /decks
  // was removed is fine and expected; a live href is the bug.
  const offenders: string[] = [];
  for (const file of walk(join(ROOT, "src"))) {
    const code = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    if (/["'`]\/decks(\/|["'`?#])/.test(code)) offenders.push(file.replace(`${ROOT}/`, ""));
  }
  assert.deepEqual(offenders, [], `live /decks references: ${offenders.join(", ")}`);
});

test("no article links to /decks, and none asks for the retired metaStaples gallery", () => {
  for (const a of ARTICLES) {
    const text = JSON.stringify(a);
    assert.doesNotMatch(text, /\]\(\/decks/, `${a.slug} links to /decks — it is a redirect at best now`);
    assert.doesNotMatch(text, /"(href|url)":"\/decks/, `${a.slug} points a CTA/itemList at /decks`);
    for (const e of [...(a.embeds ?? []), ...(a.embed ? [a.embed] : [])]) {
      assert.ok(!("metaStaples" in e), `${a.slug} still uses the metaStaples embed`);
    }
  }
});

test("every /decks URL is redirected, permanently, to the deck builder — with no chain", async () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cfg = require("../next.config.js") as { redirects: () => Promise<{ source: string; destination: string; permanent: boolean }[]> };
  const rows = await cfg.redirects();
  const bare = rows.find((r) => r.source === "/decks");
  const wild = rows.find((r) => r.source === "/decks/:path*");
  assert.ok(bare && bare.permanent && bare.destination === "/deck", "/decks must 301 to /deck");
  assert.ok(wild && wild.permanent && wild.destination === "/deck", "/decks/:path* must 301 to /deck");
  const chains = rows.filter((r) => r.destination.startsWith("/decks"));
  assert.deepEqual(chains, [], "a redirect INTO /decks would chain into the redirect OUT of it");
});

test("the deck builder keeps a nav and a footer link, so /deck is never an orphan", () => {
  const inNav = NAV_GROUPS.some((g) => g.links.some((l) => l.href === "/deck"));
  const inFooter = FOOTER_GROUPS.some((g) => g.links.some((l) => l.href === "/deck"));
  assert.ok(inNav, "/deck must stay in NAV_GROUPS (launcher + mega-menu)");
  assert.ok(inFooter, "/deck must stay in FOOTER_GROUPS (the server-rendered link internal-linking relies on)");
  assert.ok(!NAV_GROUPS.some((g) => g.links.some((l) => l.href === "/decks")), "the meta-deck hub must not return to the nav");
});
