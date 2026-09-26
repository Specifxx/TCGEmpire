import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildReleaseEmail,
  groupByEmail,
  renderReleaseEmailText,
  restockTransitions,
  singlesNotices,
  type ReleaseAlertRow,
} from "../src/lib/release-alerts";

const row = (over: Partial<ReleaseAlertRow> = {}): ReleaseAlertRow => ({
  id: "r1",
  email: "a@b.co",
  scope: "set",
  market: "US",
  unsubToken: "tok",
  singlesNotifiedAt: null,
  restockNotifiedAt: null,
  ...over,
});

test("a set-wide signup is told once singles have a store price in its own market", () => {
  const facts = { pricedCount: { US: 0, AU: 12 }, cards: {} };
  assert.equal(singlesNotices([row()], facts).size, 0);
  const n = singlesNotices([row({ market: "AU" })], facts).get("r1");
  assert.deepEqual(n, { kind: "singles", market: "AU", pricedCount: 12, card: null });
  // Already told → never again.
  assert.equal(singlesNotices([row({ market: "AU", singlesNotifiedAt: new Date() })], facts).size, 0);
});

test("a card-page signup waits for THAT card, not the set", () => {
  const facts = {
    pricedCount: { US: 40 },
    cards: { c1: { name: "Aphelios, Exalted", href: "/card/aphelios", price: { US: null } } },
  };
  assert.equal(singlesNotices([row({ scope: "c1" })], facts).size, 0);
  facts.cards.c1.price.US = 1299 as unknown as null;
  const n = singlesNotices([row({ scope: "c1" })], facts).get("r1")!;
  assert.deepEqual(n.card, { name: "Aphelios, Exalted", href: "/card/aphelios", priceCents: 1299 });
});

test("restock fires only for a product that was sold out everywhere and is open again", () => {
  const prev = new Set(["box"]);
  const t = restockTransitions(
    [
      { key: "box", state: "open" },
      { key: "bundle", state: "soldout" },
      { key: "pack", state: "open" },
      { key: "vault", state: "other" },
    ],
    prev,
  );
  assert.deepEqual(t, { restocked: ["box"], markSoldOut: ["bundle"], clear: ["box"] });
  // A product that simply stays open, or goes stale ("other"), never counts.
  assert.deepEqual(restockTransitions([{ key: "box", state: "other" }], prev), { restocked: [], markSoldOut: [], clear: [] });
});

test("one email per address, and the email states only facts with an unsubscribe", () => {
  assert.equal(groupByEmail([row(), row({ id: "r2", scope: "c1" }), row({ id: "r3", email: "x@y.z" })]).size, 2);
  const e = buildReleaseEmail("Radiance", "/sets/radiance", [
    { kind: "singles", market: "US", pricedCount: 3, card: null },
    { kind: "restock", market: "US", products: ["Radiance Booster Box"] },
  ]);
  assert.equal(e.subject, "Radiance singles have store prices");
  assert.match(e.lines.join(" "), /3 Radiance singles have a store price in the United States/);
  assert.match(e.lines.join(" "), /Back in stock for pre-order in the United States: Radiance Booster Box/);
  const text = renderReleaseEmailText(e, "tok");
  assert.match(text, /Unsubscribe: https:\/\/riftcompare\.com\/alerts\/release\?token=tok/);
  assert.doesNotMatch(text, /ebay|tcgplayer/i); // no affiliate links in emails
});

test("signup API: explicit action only, coming-soon sets only, unsubscribe is POST-only", () => {
  const api = readFileSync("src/app/api/alerts/release/route.ts", "utf8");
  assert.match(api, /export async function POST/);
  assert.doesNotMatch(api, /export async function GET/);
  assert.match(api, /set\?\.comingSoon/);
  const unsub = readFileSync("src/app/api/alerts/release/unsubscribe/route.ts", "utf8");
  assert.doesNotMatch(unsub, /export async function GET/);
  const cron = readFileSync("src/app/api/cron/release-alerts/route.ts", "utf8");
  assert.match(cron, /Bearer \$\{secret\}/);
  const wf = readFileSync(".github/workflows/refresh-prices.yml", "utf8");
  assert.match(wf, /name: Release alerts \(Radiance\)\n[\s\S]*?github\.event_name != 'push'[\s\S]*?\/api\/cron\/release-alerts\?set=RAD/);
});

test("the signup is on Radiance posts, /radiance-preorders and Radiance card pages", () => {
  assert.match(readFileSync("src/components/ArticleView.tsx", "utf8"), /article\.tags\.includes\("radiance"\) && radianceAlertOpen && \(\s*<ReleaseAlertSignup/);
  assert.match(readFileSync("src/app/radiance-preorders/page.tsx", "utf8"), /<ReleaseAlertSignup setCode=\{SET_CODE\}/);
  const card = readFileSync("src/app/card/[id]/page.tsx", "utf8");
  assert.match(card, /source="card_unlisted"[\s\S]{0,200}heading="No store has listed this yet — get told when one does"/);
  assert.match(card, /isRadianceCard && rows\.length > 0 && \(/);
});
