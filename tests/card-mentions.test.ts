import test from "node:test";
import assert from "node:assert/strict";
import { autoLinkCardNames, canonicalPrinting, cardHrefsIn, linkableName } from "../src/lib/content/card-mentions";

const E = [
  { name: "Falling Star", href: "/card/falling-star-ogn-029-298" },
  { name: "Jinx, Loose Cannon", href: "/card/jinx-loose-cannon-ogn-251" },
  { name: "Recall", href: "/card/recall-ogn-001" },
];

test("links only the first unlinked mention of each multi-word card name", () => {
  const out = autoLinkCardNames("Falling Star is good. Play Falling Star twice. Recall it.", E);
  assert.equal(out, "[Falling Star](/card/falling-star-ogn-029-298) is good. Play Falling Star twice. Recall it.");
  assert.equal(linkableName("Recall"), false);
});

test("never links inside headings, images, shortcodes, code or an existing link", () => {
  const body = [
    "## Falling Star is great",
    "![Falling Star](/x.png)",
    "[[embed:0]]",
    "Try `Falling Star` or [the Falling Star page](/somewhere) — Falling Star wins.",
  ].join("\n");
  const out = autoLinkCardNames(body, E).split("\n");
  assert.equal(out[0], "## Falling Star is great");
  assert.equal(out[1], "![Falling Star](/x.png)");
  assert.equal(out[2], "[[embed:0]]");
  assert.equal(out[3], "Try `Falling Star` or [the Falling Star page](/somewhere) — [Falling Star](/card/falling-star-ogn-029-298) wins.");
});

test("a card the author already linked is not linked again; whole words only", () => {
  const body = "See [it](/card/falling-star-ogn-029-298). Falling Star again. Falling Stars and Falling Star's art.";
  assert.equal(autoLinkCardNames(body, E), body);
  assert.equal(autoLinkCardNames("Falling Stars shine.", E), "Falling Stars shine.");
  assert.equal(autoLinkCardNames("Jinx, Loose Cannon!", E), "[Jinx, Loose Cannon](/card/jinx-loose-cannon-ogn-251)!");
});

test("cardHrefsIn lists linked card pages once, in order", () => {
  assert.deepEqual(cardHrefsIn("[a](/card/x) [b](/card/y) [c](/card/x) [d](/blog/z)"), ["/card/x", "/card/y"]);
});

test("canonicalPrinting prefers the base printing with the lowest number", () => {
  const c = (collectorNumber: string, variant: string | null = null, isPromo = false) => ({ collectorNumber, variant, isPromo });
  assert.deepEqual(canonicalPrinting([c("029a", "a"), c("029"), c("300", null, true)]), c("029"));
  assert.deepEqual(canonicalPrinting([c("029a", "a")]), c("029a", "a"));
  assert.equal(canonicalPrinting([]), null);
});
