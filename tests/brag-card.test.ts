import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bragLink, bragModel } from "../src/lib/brag-card";
import { pullBragFields, summarisePulls } from "../src/lib/pull-tracker";

// Brag cards (DECISIONS.md 2026-11-26, community plan move 4). lib/brag-card.ts is the same file as TCG Prices'.
const money = (c: number) => `$${(c / 100).toFixed(2)}`;

test("the I-pulled card names the best card, its price and the log against what was paid", () => {
  const sum = summarisePulls(
    [
      { num: "298", qty: 1, eachCents: 18800 },
      { num: "012", qty: 3, eachCents: 50 },
      { num: "200", qty: 1, eachCents: null },
    ],
    5400,
  );
  const f = pullBragFields("Origins", { name: "Jinx, Rebel", eachCents: 18800 }, sum, 5400, money)!;
  assert.equal(f.kicker, "I pulled · Origins");
  assert.equal(f.title, "Jinx, Rebel");
  assert.equal(f.value, "$188.00");
  assert.deepEqual(f.pill, { text: "$135.50 more than I paid", tone: "up" });
  assert.deepEqual(
    f.rows.map((r) => [r.label, r.value]),
    [
      ["All my pulls", "$189.50"],
      ["I paid", "$54.00"],
      ["Cards logged", "5"],
    ],
  );
});

test("a log that lost money or has no price paid says so plainly, and nothing priced draws no card", () => {
  const lost = summarisePulls([{ num: "1", qty: 1, eachCents: 900 }], 5400);
  assert.deepEqual(pullBragFields("Origins", { name: "A", eachCents: 900 }, lost, 5400, money)!.pill, { text: "My pulls: $9.00 from $54.00", tone: "neutral" });
  const unpaid = summarisePulls([{ num: "1", qty: 1, eachCents: 900 }], null);
  const f = pullBragFields("Origins", { name: "A", eachCents: 900 }, unpaid, null, money)!;
  assert.equal(f.pill.text, "My pulls: $9.00");
  assert.ok(!f.rows.some((r) => r.label === "I paid"));
  assert.equal(pullBragFields("Origins", null, unpaid, null, money), null);
  assert.equal(pullBragFields("Origins", { name: "A", eachCents: 0 }, unpaid, null, money), null);
});

test("the card model only takes a safe accent and picture, and links back tagged", () => {
  const m = bragModel({ site: "RiftCompare", host: "riftcompare.com", accent: "nope", kicker: "i pulled", title: "x", value: "$1", cta: "Log", image: "/card-art/a.webp", imageShape: "card", date: new Date("2026-11-26T00:00:00Z") });
  assert.equal(m.accent, "#3b82f6");
  assert.equal(m.kicker, "I PULLED");
  assert.equal(m.image, "/card-art/a.webp");
  assert.equal(bragModel({ ...m, pill: null, rows: [], image: "data:image/png;base64,x", date: new Date() }).image, null);
  assert.equal(bragLink("https://riftcompare.com", "/tools/pull-tracker/origins", "pull"), "https://riftcompare.com/tools/pull-tracker/origins?utm_source=share&utm_medium=brag-card&utm_campaign=pull");
});

test("the pull tracker shares the picture only where a phone can, and counts it", () => {
  const src = readFileSync("src/components/PullTracker.tsx", "utf8");
  assert.match(src, /navigator\.canShare/);
  assert.match(src, /trackEvent\("brag_share", \{ kind: "pull"/);
  assert.match(src, /cardImageSrc\(bestCard\)/, "the art is our own same-origin copy, so the canvas stays readable");
  assert.doesNotMatch(readFileSync("src/lib/brag-card.ts", "utf8"), /fetch\(|next\/og|ImageResponse/);
});
