import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SETS } from "../src/lib/constants";
import { setCodeFromSetName, setFromTotal as tcgSetFromTotal } from "../src/lib/tcgplayer";
import { classifySealed, isTrackableSealedTitle } from "../src/lib/sealed-import";
import { isSinglesTitle } from "../src/lib/woocommerce";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
// Comments are documentation, not behaviour. A file that only MENTIONS a set in a
// comment must not satisfy a check that the set is actually wired up.
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");

// ─────────────────────────────────────────────────────────────────────────────
// SET-LAUNCH READINESS
//
// Adding a set to lib/constants.ts is one line. Making the site actually handle
// it is nine files, and every one of them fails SILENTLY when it is missed —
// there is no error, just a set whose listings never match, whose collector
// numbers read as "setless", whose cards store their set code where the set name
// belongs, or (worst) whose store listings resolve to ORIGINS, because
// resolveCardId's last resort is `confidentSetCode ?? "OGN"`.
//
// That is exactly what was true of Radiance on 2026-09-10, six weeks before
// release: it had been in SETS since 4 Aug, and none of the price mappers knew
// about it. This file makes the same omission impossible for the set after it —
// every check below iterates SETS rather than naming a set, so the next one is
// covered by adding its row and nothing else.
//
// Companion prose: docs/SET-LAUNCH-RUNBOOK.md.
// ─────────────────────────────────────────────────────────────────────────────

test("every set in SETS is recognised by the exported set mappers", () => {
  for (const s of SETS) {
    const box = `Riftbound: League of Legends - ${s.name} Booster Box`;

    // TCGplayer's setName → code map. The ONLY set signal for printings with no
    // "/NNN" denominator (the rune cycle, alt-arts), so a miss here loses them.
    assert.equal(setCodeFromSetName(s.name), s.code, `tcgplayer setCodeFromSetName("${s.name}")`);

    // The sealed gate. A product that fails this is dropped at the door.
    assert.ok(isTrackableSealedTitle(box), `sealed importer rejects "${box}"`);
    // …and Proving Grounds is legitimately its own product type, so assert only
    // that the title types as SOMETHING real rather than falling to "Sealed".
    assert.notEqual(classifySealed(box), "Sealed", `classifySealed fell through for "${box}"`);

    // The WooCommerce singles gate — used to decide whether a store's product is
    // a single card at all.
    assert.ok(
      isSinglesTitle(`Riftbound ${s.name} Some Card ${s.code}-042`),
      `woocommerce isSinglesTitle misses ${s.code}`,
    );
  }
});

test("every set has a branch in the mappers that are not exported", () => {
  // These four are module-private tables, so they are checked at the source
  // level. Each is a documented silent-miss: see the header above.
  const priceImport = code("src/lib/price-import.ts");
  const setFromTitle = priceImport.slice(
    priceImport.indexOf("const SET_FROM_TITLE"),
    priceImport.indexOf("const STOP"),
  );
  const stop = priceImport.slice(priceImport.indexOf("const STOP"), priceImport.indexOf("function numKey"));
  const ebaySetNames = (() => {
    const src = code("src/lib/ebay.ts");
    const at = src.indexOf("const SET_NAMES");
    return src.slice(at, src.indexOf("};", at));
  })();
  const sealed = code("src/lib/sealed-import.ts");
  const sealedSetNames = (() => {
    const at = sealed.indexOf("const SET_NAMES");
    return sealed.slice(at, sealed.indexOf("};", at));
  })();

  for (const s of SETS) {
    // A set is "named" by its code or by the distinctive word(s) of its name.
    // Both are legitimate — SET_FROM_TITLE keys on codes, STOP keys on words.
    const words = s.name.toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter((w) => w.length > 3);
    const named = (block: string) =>
      new RegExp(`\\b${s.code}\\b`, "i").test(block) || words.some((w) => block.toLowerCase().includes(w));

    assert.ok(named(setFromTitle), `price-import SET_FROM_TITLE has no branch for ${s.code} (${s.name})`);
    assert.ok(named(stop), `price-import STOP does not strip "${s.name}" from a listing title`);
    assert.ok(named(ebaySetNames), `ebay SET_NAMES cannot confirm ${s.code} from a title`);
    assert.ok(named(sealedSetNames), `sealed-import SET_NAMES has no display name for ${s.code}`);
  }
});

test("the two setFromTotal copies agree — they have drifted before", () => {
  // lib/price-import.ts and lib/tcgplayer.ts each carry a switch mapping a
  // collector-number denominator to a set. tcgplayer.ts's own header records what
  // happens when they diverge: "that's how VEN went missing from the script's
  // setFromTotal and Vendetta variants stopped being created."
  const src = code("src/lib/price-import.ts");
  const at = src.indexOf("function setFromTotal");
  const block = src.slice(at, src.indexOf("}", src.indexOf("default: return null;", at)));
  const totals = [...block.matchAll(/case (\d+):/g)].map((m) => Number(m[1]));
  assert.ok(totals.length >= 5, `expected the full denominator table, found ${totals.length}`);
  for (const total of totals) {
    assert.ok(tcgSetFromTotal(String(total)) != null, `tcgplayer setFromTotal(${total}) is null but price-import maps it`);
  }
  // And every code either table produces must be a real set — a typo here routes
  // real prices at a set that does not exist.
  const codes = new Set(SETS.map((s) => s.code));
  for (const m of block.matchAll(/return "(\w+)"/g)) {
    assert.ok(codes.has(m[1]), `price-import setFromTotal returns unknown set code "${m[1]}"`);
  }
});

test("every sealed product type has an eBay title keyword AND a price floor", () => {
  // `!kw || kw.test(title)` — a product type MISSING from SEALED_TYPE_KW is not
  // filtered at all, so its eBay search takes the cheapest match for a bare
  // "Riftbound <name>" query. That was true of "Vault" and "Showdown Decks",
  // which are the two headline Radiance SKUs.
  const ebay = code("src/lib/ebay.ts");
  const kw = ebay.slice(ebay.indexOf("const SEALED_TYPE_KW"), ebay.indexOf("// Accessories and non-product"));
  const floors = ebay.slice(ebay.indexOf("const SEALED_MIN_CENTS"), ebay.indexOf("export function sealedFloorCents"));
  for (const type of ["Vault", "Showdown Decks", "Booster Box", "Booster Pack"]) {
    assert.ok(kw.includes(`"${type}"`) || kw.includes(`${type}:`), `SEALED_TYPE_KW has no keyword for "${type}"`);
    assert.ok(floors.includes(`"${type}"`) || floors.includes(`${type}:`), `SEALED_MIN_CENTS has no floor for "${type}"`);
  }
});

test("the official-gallery pipeline is parameterised by set, not forked per set", () => {
  // The old scripts/fetch-vendetta-official.ts + import-vendetta.ts pair could
  // only ever do VEN, so the next set's spoiler season needed a fork of a 360-line
  // Playwright scraper — under the deadline where being first is worth the most.
  for (const gone of ["scripts/fetch-vendetta-official.ts", "scripts/import-vendetta.ts"]) {
    assert.throws(() => readFileSync(join(ROOT, gone), "utf8"), `${gone} must be gone, not left beside its replacement`);
  }
  const fetcher = code("scripts/fetch-set-official.ts");
  const importer = code("scripts/import-set-cards.ts");
  for (const [name, src] of [["fetcher", fetcher], ["importer", importer]] as const) {
    assert.match(src, /process\.env\.SET/, `${name} does not take a SET`);
    assert.doesNotMatch(src, /"VEN"|'VEN'/, `${name} still hardcodes a set code`);
  }
  // Both halves must REFUSE rather than guess. The scraper's gate is what stops a
  // set whose three-letter code we guessed (constants.ts says "RAD" is a
  // placeholder) being imported under the wrong one — which costs a Card.setCode
  // backfill plus an edit to every mapper keyed on the code.
  assert.match(fetcher, /SET CODE MISMATCH/, "the scraper must refuse when the gallery reports a different set code");
  assert.match(importer, /Refusing to import/, "the importer must refuse a scrape file stamped with another set");
});

test("sync-cards adopts pre-release rows from ANY set, and names sets from SETS", () => {
  const src = code("scripts/sync-cards.ts");
  // Two silent misses that would each have produced duplicate or mislabelled
  // Radiance card pages on launch day.
  assert.match(src, /contains: "-official-"/, 'the ADOPTION query must not pin a single set’s "<code>-official-" prefix');
  assert.doesNotMatch(src, /startsWith: "ven-official-"/, "the VEN-only adoption prefix is back");
  assert.match(src, /SETS\.map\(\(s\) => \[s\.code, s\.name\]\)/, "SET_NAMES must be derived from SETS, not a private table");
});

test("the release-day blast defaults to the set that actually released", () => {
  // Both defaults read "vendetta" for six weeks after Vendetta stopped being the
  // set anyone would blast about. The dry-run default is the guard that saves
  // you here, not the slug — so the slug should simply be right.
  for (const p of ["src/app/api/cron/release-day-email/route.ts", "scripts/send-release-day.ts"]) {
    const src = code(p);
    assert.match(src, /newestReleasedSet\(\)/, `${p} must derive its default set`);
    assert.doesNotMatch(src, /\?\?\s*"vendetta"|\|\|\s*"vendetta"/, `${p} still falls back to a literal set slug`);
  }
  const wf = read(".github/workflows/release-day-email.yml");
  assert.doesNotMatch(wf, /default:\s*"vendetta"/, "the workflow input still defaults to a literal set slug");
  // Dry run must stay the default — this emails every subscriber.
  assert.match(wf, /dry_run:[\s\S]{0,200}default:\s*true/, "dry_run must default to true");
});

test("maintenance.yml exposes the per-set pipeline and pings IndexNow after it", () => {
  const wf = read(".github/workflows/maintenance.yml");
  assert.match(wf, /^\s+- set-pipeline/m, "the set-pipeline task option is missing");
  assert.doesNotMatch(wf, /^\s+- vendetta-pipeline/m, "the VEN-only task is back");
  assert.match(wf, /set_slug:/, "set-pipeline needs a set_slug input");
  assert.match(wf, /SET: \$\{\{ inputs\.set_slug \}\}/, "the task must pass set_slug through as SET");
  // A card-mutating task that is NOT in this list writes to the DB and tells
  // nobody — the new cards then wait out the sitemap's 24h TTL, during the one
  // week that lag actually costs traffic.
  const ping = wf.slice(wf.indexOf("Revalidate sitemap + ping IndexNow"));
  assert.match(ping, /"set-pipeline"/, "set-pipeline must be in the ping-new-cards allow-list");
});

test("an upcoming set's pages route to the things that are actually buyable", () => {
  // /sets/<slug> is where "riftbound <set>" lands through spoiler season, and it
  // had no route at all to the set's pre-orders — the only thing on sale.
  const setPage = code("src/app/sets/[set]/page.tsx");
  assert.match(setPage, /preordersHrefForSet\(set\.code\)/, "the set page must offer the pre-order comparison");
  assert.match(setPage, /PRE_RELEASE_LINKS/, "the pre-release link cluster must be data, not inlined per set");
  assert.doesNotMatch(setPage, /set\.slug === "vendetta"/, "the hardcoded Vendetta block is back");

  // …and the helper must retire the link on release day rather than needing an edit.
  const cal = code("src/lib/release-calendar.ts");
  assert.match(cal, /isPreorderSetCode\(code, now\)/, "preordersHrefForSet must be date-gated, not permanent");
});

test("a guessed set code is never shown to a reader as the official one", () => {
  // The code is the join key for every card, price and sealed row, so it always
  // has a value — but /sets/<slug> rendered it in a badge, which stated our own
  // placeholder ("RAD") as Riot's published set code on the page that ranks for
  // the set's name. Same reason the /blog/…-what-we-know table stopped printing
  // "Set code: RAD" as a fact.
  const setPage = code("src/app/sets/[set]/page.tsx");
  assert.match(setPage, /!set\.codeProvisional/, "the set-code badge must be gated on the code being confirmed");
  const articles = read("src/lib/articles.ts");
  for (const s of SETS.filter((x) => x.codeProvisional)) {
    assert.doesNotMatch(
      articles,
      new RegExp(`\\*\\*Set code\\*\\* \\| ${s.code}`),
      `an article states the provisional code ${s.code} as this set's set code`,
    );
  }
});

test("the runbook exists and matches the workflow it documents", () => {
  const doc = read("docs/SET-LAUNCH-RUNBOOK.md");
  // Every operational name the runbook tells a human to type must be real —
  // a runbook that names a task that does not exist is worse than none.
  for (const task of ["set-pipeline", "cards-sync", "cards-manual", "import-prices", "import-sealed", "check-cards"]) {
    assert.ok(doc.includes(task), `the runbook never mentions the ${task} task`);
    assert.match(read(".github/workflows/maintenance.yml"), new RegExp(`- ${task}\\b`), `${task} is not a real task`);
  }
  assert.match(doc, /comingSoon/, "the runbook must name the release-day interlock");
});
