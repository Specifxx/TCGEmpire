import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { legendNameFromSlug, pickLegendChampion, stripEditionSuffix, withChampion } from "../src/lib/legend-name";
import { CARD_SLUG_RENAMES, cardWhereParam, currentSlug, slugAliases, withSlugAliases } from "../src/lib/card-slug-renames";
import { CHAMPIONS } from "../src/lib/champions";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// Two Legends were imported under the wrong name (2026-09-27):
//  - OGS-019 "Master, Wuju Bladesman - Starter": RiftScribe's " - Starter"
//    label broke the epithet match in sync-cards, whose fallback kept only the
//    slug's first token ("master" of "master-yi-…"). Every sync rewrote it.
//  - VEN-155 "Yordle, Heart of the Tempest": the gallery importer took the
//    Legend's FIRST tag as its champion, and Kennen's Legend lists "Yordle"
//    before "Kennen".
// ─────────────────────────────────────────────────────────────────────────────

test("the RiftScribe path drops the Starter label and keeps a multi-word champion whole", () => {
  assert.equal(legendNameFromSlug("master-yi-wuju-bladesman", "Wuju Bladesman - Starter"), "Master Yi, Wuju Bladesman");
  assert.equal(legendNameFromSlug("annie-dark-child", "Dark Child - Starter"), "Annie, Dark Child");
  assert.equal(legendNameFromSlug("lux-lady-of-luminosity", "Lady of Luminosity - Starter"), "Lux, Lady of Luminosity");
  assert.equal(legendNameFromSlug("garen-might-of-demacia", "Might of Demacia - Starter"), "Garen, Might of Demacia");
});

test("the RiftScribe path is unchanged for ordinary Legends", () => {
  assert.equal(legendNameFromSlug("jinx-loose-cannon", "Loose Cannon"), "Jinx, Loose Cannon");
  assert.equal(legendNameFromSlug("kaisa-daughter-of-the-void", "Daughter of the Void"), "Kai'Sa, Daughter of the Void");
  assert.equal(legendNameFromSlug("renata-glasc-chem-baroness", "Chem-Baroness"), "Renata Glasc, Chem-Baroness");
  assert.equal(legendNameFromSlug(undefined, "Loose Cannon"), "Loose Cannon", "no slug, no prefix");
});

test("when the epithet doesn't line up, the champion is the longest KNOWN run of slug tokens, never the first token", () => {
  assert.equal(legendNameFromSlug("master-yi-wuju-bladesman", "Some Other Title"), "Master Yi, Some Other Title");
  assert.equal(legendNameFromSlug("lee-sin-blind-monk", "Blind Monk (Alt)"), "Lee Sin, Blind Monk (Alt)");
  assert.equal(legendNameFromSlug("nobody-we-know-at-all", "Some Title"), "Some Title", "no known champion → no invented prefix");
});

test("every Legend in the RiftScribe snapshot gets a real champion and no product label", () => {
  const snap = JSON.parse(read("prisma/riftbound-cards.json")) as { id: string; name: string; type: string }[];
  const names = JSON.parse(read("prisma/card-names.json")) as Record<string, string>;
  const known = new Set(CHAMPIONS.map((c) => c.name));
  const bad: string[] = [];
  for (const c of snap.filter((x) => x.type === "Legend")) {
    const [set, num] = c.id.split("-");
    const n = legendNameFromSlug(names[`${set}-${num}`], c.name);
    if (/-\s*Starter$/i.test(n) || (n.includes(",") && !known.has(n.split(",")[0]))) bad.push(`${c.id}: ${n}`);
  }
  assert.deepEqual(bad, []);
});

test("the gallery path picks the champion tag wherever it sits, and never a region or creature type", () => {
  assert.equal(pickLegendChampion(["Yordle", "Kennen"]), "Kennen");
  assert.equal(pickLegendChampion(["Renekton"]), "Renekton");
  assert.equal(pickLegendChampion(["Shurima", "K'Sante"]), "K'Sante", "a debut champion is spelt from the override list");
  assert.equal(pickLegendChampion(["Ionia", "Brand New Champ"]), "Brand New Champ", "unknown champion: first non-region tag");
  assert.equal(pickLegendChampion(["Yordle"]), undefined, "an old dump's lone tags[0] is refused, not used");
  assert.equal(pickLegendChampion(undefined), undefined);
  assert.equal(pickLegendChampion([42, null, " Kennen "]), "Kennen");
  assert.equal(withChampion("Heart of the Tempest", pickLegendChampion(["Yordle", "Kennen"])), "Kennen, Heart of the Tempest");
  assert.equal(withChampion("Kennen, Heart of the Tempest", "Kennen"), "Kennen, Heart of the Tempest", "no double prefix");
  assert.equal(stripEditionSuffix("Wuju Bladesman - Starter"), "Wuju Bladesman");
});

test("every importer names Legends through lib/legend-name.ts", () => {
  const sync = read("scripts/sync-cards.ts");
  assert.match(sync, /legendNameFromSlug\(nameMap\[nameKey\], c\.name\)/);
  assert.doesNotMatch(sync, /function enrichLegendName|split\("-"\)\[0\]/, "no private copy, no first-token fallback");
  const seed = read("prisma/seed.ts");
  assert.match(seed, /legendNameFromSlug\(nameMap\[nameKey\], c\.name\)/);
  assert.doesNotMatch(seed, /function enrichLegendName/);
  const fetch = read("scripts/fetch-set-official.ts");
  assert.match(fetch, /champion: pickLegendChampion\(o\?\.tags\?\.tags\)/);
  assert.doesNotMatch(fetch, /tags\?\.tags\?\.\[0\]/, "tags[0] is what named Kennen's Legend 'Yordle'");
  const imp = read("scripts/import-set-cards.ts");
  assert.match(imp, /pickLegendChampion\(r\.tags \?\? \(r\.champion \? \[r\.champion\] : \[\]\)\)/);
  assert.match(imp, /withChampion\(rawName, legendChampion\(r\)\)/);
});

// ── Renamed slugs keep resolving ────────────────────────────────────────────

test("a renamed card is found under its old and its new slug, whichever the row has", () => {
  const [oldSlug, newSlug] = ["yordle-heart-of-the-tempest-ven-155", "kennen-heart-of-the-tempest-ven-155"];
  assert.equal(CARD_SLUG_RENAMES[oldSlug], newSlug);
  assert.deepEqual(slugAliases(oldSlug), [oldSlug, newSlug]);
  assert.deepEqual(slugAliases(newSlug), [newSlug, oldSlug]);
  assert.deepEqual(slugAliases("jinx-loose-cannon-ogn-251-298"), ["jinx-loose-cannon-ogn-251-298"], "everything else is untouched");
  assert.deepEqual(cardWhereParam(oldSlug), { OR: [{ id: oldSlug }, { slug: oldSlug }, { slug: newSlug }] });
  assert.equal(currentSlug(oldSlug), newSlug);
  assert.deepEqual(withSlugAliases(["a", oldSlug]), ["a", oldSlug, newSlug]);
});

test("every card route looks up through cardWhereParam, and the page 308s to the row's slug", () => {
  for (const f of [
    "src/app/card/[id]/page.tsx",
    "src/app/card/[id]/opengraph-image.tsx",
    "src/app/llm/card/[id]/route.ts",
    "src/app/api/v1/card/[id]/history.json/route.ts",
  ]) {
    const src = read(f);
    assert.match(src, /const whereParam = cardWhereParam;/, f);
    assert.doesNotMatch(src, /OR: \[\{ slug: p \}, \{ id: p \}\]/, f);
  }
  assert.match(read("src/app/card/[id]/page.tsx"), /if \(card\.slug && params\.id !== card\.slug\) permanentRedirect\(`\/card\/\$\{card\.slug\}`\);/);
});

test("the fix script only moves slugs the rename map knows, and no source links an old slug", () => {
  const script = read("scripts/fix-card-names.ts");
  const fixes = [...script.matchAll(/oldSlug: "([^"]+)", name: "([^"]+)"/g)].map((m) => ({ oldSlug: m[1], name: m[2] }));
  assert.equal(fixes.length, 3);
  for (const f of fixes) assert.ok(CARD_SLUG_RENAMES[f.oldSlug], `${f.oldSlug} must be in CARD_SLUG_RENAMES`);
  assert.deepEqual(fixes.map((f) => f.name), ["Kennen, Heart of the Tempest", "Master Yi, Wuju Bladesman", "Master Yi, Wuju Bladesman"]);
  assert.match(script, /const APPLY = process\.argv\.includes\("--apply"\);/, "dry run by default");
  assert.match(read(".github/workflows/maintenance.yml"), /run: npx tsx scripts\/fix-card-names\.ts \$\{\{ inputs\.apply && '--apply' \|\| '' \}\}/);

  const walk = (d: string): string[] =>
    readdirSync(join(ROOT, d)).flatMap((n) => {
      const p = `${d}/${n}`;
      return statSync(join(ROOT, p)).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
    });
  const allowed = new Set(["src/lib/card-slug-renames.ts"]);
  for (const f of walk("src").filter((f) => !allowed.has(f))) {
    for (const old of Object.keys(CARD_SLUG_RENAMES)) {
      assert.ok(!read(f).includes(`"${old}"`), `${f} still links the old slug ${old}`);
    }
  }
});
