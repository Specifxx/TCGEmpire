import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CHAMPIONS } from "../src/lib/champions";

const ROOT = process.cwd();
const SRC = readFileSync(join(ROOT, "src/app/champions/[slug]/page.tsx"), "utf8");
const MAX = 155;

// ─────────────────────────────────────────────────────────────────────────────
// THE CHAMPION PAGE'S DESCRIPTION NEEDS THE SAME LENGTH GUARD ITS TITLE HAS.
// ─────────────────────────────────────────────────────────────────────────────
// Added 2026-09-21 from the Search Console export. The title on this template
// was already stepped down to 60 characters — that was done after Bing raised
// 397 "Title too long" warnings, and the code comment says so. The description
// sitting immediately beside it had no guard at all, and a champion printed in
// more than one set spent ~40 characters naming them: Jayce rendered at 170
// characters and Ahri at 182, against a ~155 cut. The half being amputated was
// the "cheapest way to build <name>" close — the only part that asks for the
// click.
//
// 87 champion pages carrying 10,096 impressions, so this is not a rounding
// error. These tests pin the ladder rather than the strings, because the copy
// is allowed to change and the guard is not.

test("the champion description is built from a stepped-down ladder with a hard cap", () => {
  assert.match(SRC, /const descCandidates = \[/, "the description must be a ladder, not one fixed string");
  assert.match(
    SRC,
    /descCandidates\.find\(\(d\) => d\.length <= 155\)/,
    "the ladder must pick the first rung that fits 155 characters",
  );
  // A fallback is required: `.find()` returns undefined when nothing fits, and
  // an undefined description silently ships no meta description at all.
  assert.match(SRC, /\?\? descCandidates\[descCandidates\.length - 1\]/, "the ladder needs a last-rung fallback");
  // The shortest rung must not depend on the facts the longer rungs carry, or
  // a champion with many sets has nothing left to fall back to.
  const last = SRC.match(/`Every Riftbound \$\{champ\.name\} card with live prices from every store we track\.`/);
  assert.ok(last, "the final rung must be the fact-free one");
});

test("every champion's description fits, for every shape its data can take", () => {
  // Rebuilt from the same template the route uses. If the route's copy changes,
  // this drifts and should be updated WITH it — the point is that some ladder
  // lands under the cap for every champion, not that these exact words do.
  const DOMAINS = ["Fury", "Calm", "Mind", "Body", "Chaos", "Order"];
  const SETS = ["Origins", "Proving Grounds", "Spirit Forged", "Unleashed", "Vendetta", "Radiance"];

  const build = (name: string, count: number, domains: string[], sets: string[]) => {
    const domainBit =
      domains.length === 1 ? `a ${domains[0]} champion` : domains.length > 1 ? `spanning ${domains.join(", ")}` : "";
    const setBit = sets.length === 1 ? ` in ${sets[0]}` : sets.length > 1 ? ` across ${sets.join(", ")}` : "";
    const factBit = domainBit ? `${count} printings — ${domainBit}${setBit}. ` : "";
    const shortFactBit = domainBit ? `${count} printings — ${domainBit}. ` : "";
    const rungs = [
      `Every Riftbound ${name} card, priced. ${factBit}Compare live prices across stores to find the cheapest way to build ${name}.`,
      `Every Riftbound ${name} card, priced. ${shortFactBit}Compare live prices across stores to find the cheapest way to build ${name}.`,
      `Every Riftbound ${name} card, priced. ${shortFactBit}Compare live prices across every store we track.`,
      `Every Riftbound ${name} card, priced. Compare live prices across stores to find the cheapest way to build ${name}.`,
      `Every Riftbound ${name} card with live prices from every store we track.`,
    ];
    return rungs.find((d) => d.length <= MAX) ?? rungs[rungs.length - 1];
  };

  const champions: { name: string }[] = Array.isArray(CHAMPIONS)
    ? (CHAMPIONS as { name: string }[])
    : (Object.values(CHAMPIONS) as { name: string }[]);
  assert.ok(champions.length > 0, "no champions loaded");

  for (const champ of champions) {
    // Every plausible shape: 1-3 domains crossed with 1-6 sets, and a printing
    // count wide enough to cost an extra digit.
    for (let nd = 0; nd <= 3; nd++) {
      for (let ns = 0; ns <= SETS.length; ns++) {
        const d = build(champ.name, 120, DOMAINS.slice(0, nd), SETS.slice(0, ns));
        assert.ok(
          d.length <= MAX,
          `${champ.name} with ${nd} domain(s) and ${ns} set(s) produces a ${d.length}-char description: ${d}`,
        );
      }
    }
  }
});
