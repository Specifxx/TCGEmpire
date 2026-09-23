import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MISSING_CARD_ART } from "../src/lib/card-art-missing";
import { cardImageSrc } from "../src/lib/card-image-url";

// See DECISIONS.md, "Card pages with no picture: the mirror was never re-run",
// 2026-09-23.

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("the placeholder names the card's own set, not a hard-coded OGN", () => {
  const art = read("src/components/CardArt.tsx");
  assert.doesNotMatch(art, /\{collectorNumber\}\s*·\s*OGN/, "every non-Origins placeholder claimed to be Origins");
  assert.match(art, /setCode\?: string;/);
  assert.match(read("src/components/CardImage.tsx"), /setCode=\{card\.setCode\}/, "CardImage must pass the set through");
});

test("Irelia, Graceful (SFD 141) is mirrored again, not on the missing list", () => {
  const stem = "sfd-141-221-63414e32c737e1e8";
  assert.ok(!MISSING_CARD_ART.has(stem));
  assert.ok(existsSync(join(process.cwd(), "public/card-art", `${stem}.webp`)));
  assert.equal(
    cardImageSrc({ imageUrl: `https://cdn.riftscribe.gg/cards/originals/${stem}.png` }),
    `/card-art/${stem}.webp`,
  );
});

test("the missing list is down to the one card the CDN still lacks", () => {
  // 71 on 2026-09-13; 70 came back. If this grows again, re-run
  // scripts/mirror-card-art.ts before assuming the art is really gone.
  assert.deepEqual([...MISSING_CARD_ART], ["unl-055a-219-bde73d52abbc1f36"]);
});

test("set-official-art only fills printings with no working picture, keyed by slug", () => {
  const src = read("scripts/set-official-art.ts");
  for (const slug of ["bird-unl-t02-000", "brush-unl-t03-000", "reflection-unl-t06-000", "vex-mocking-unl-055a-219"]) {
    assert.ok(src.includes(`"${slug}"`), `${slug} missing from OFFICIAL_ART`);
  }
  // Never overwrite working art; never borrow a different printing's picture.
  assert.match(src, /if \(!isBroken\(c\.imageUrl\)\)/);
  assert.match(src, /where: \{ slug \}/);
  // Brush is the landscape token — without orientation it renders squashed.
  assert.match(src, /"brush-unl-t03-000"[^\]]*"landscape"/);
  const wf = read(".github/workflows/maintenance.yml");
  assert.match(wf, /inputs\.task == 'set-official-art'/);
  assert.match(wf, /- set-official-art /);
});
