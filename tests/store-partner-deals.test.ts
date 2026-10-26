import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  CODE_RECHECK_DAYS,
  STORE_PARTNER_DEALS,
  activeStoreCode,
  codesNeedingRecheck,
  dealForHost,
  partnerRefUrl,
  type StorePartnerDeal,
} from "../src/lib/store-partner-deals";

// Store partner codes (2026-10-26, DECISIONS.md "Store partner codes: the store
// links start earning").

const NOW = new Date("2026-10-26T12:00:00Z");
const DEALS: StorePartnerDeal[] = [
  {
    host: "examplecards.com.au",
    name: "Example Cards",
    since: "2026-10-20",
    code: "RIFT5",
    offer: "5% off singles",
    checked: "2026-10-20",
    ref: { param: "ref", value: "riftcompare" },
  },
  { host: "stale.example", name: "Stale", since: "2026-08-01", code: "OLD", offer: "10% off", checked: "2026-09-01" },
  { host: "ended.example", name: "Ended", since: "2026-10-01", code: "END", offer: "5% off", checked: "2026-10-25", until: "2026-10-26" },
  { host: "refonly.example", name: "Ref only", since: "2026-10-01", ref: { param: "sca_ref", value: "123.abc" } },
];

test("a code shows only for the partner's own host, www or not", () => {
  const c = activeStoreCode("https://www.examplecards.com.au/products/x?variant=1", NOW, DEALS);
  assert.deepEqual(c, { code: "RIFT5", offer: "5% off singles", checked: "2026-10-20", name: "Example Cards" });
  assert.equal(activeStoreCode("https://othercards.com.au/products/x", NOW, DEALS), null);
  assert.equal(activeStoreCode("not a url", NOW, DEALS), null);
  assert.equal(activeStoreCode(null, NOW, DEALS), null);
});

test("an unchecked or ended code hides itself rather than going dead on the site", () => {
  assert.equal(activeStoreCode("https://stale.example/x", NOW, DEALS), null, `older than ${CODE_RECHECK_DAYS} days`);
  assert.equal(activeStoreCode("https://ended.example/x", NOW, DEALS), null, "on its until date");
  assert.equal(activeStoreCode("https://refonly.example/x", NOW, DEALS), null, "no code, no chip");
});

test("the commission parameter is added for partners only", () => {
  assert.equal(
    partnerRefUrl(new URL("https://www.examplecards.com.au/products/x?variant=1"), DEALS),
    "https://www.examplecards.com.au/products/x?variant=1&ref=riftcompare",
  );
  assert.equal(partnerRefUrl(new URL("https://refonly.example/p"), DEALS), "https://refonly.example/p?sca_ref=123.abc");
  assert.equal(partnerRefUrl(new URL("https://stale.example/p"), DEALS), null);
  assert.equal(dealForHost("WWW.EXAMPLECARDS.COM.AU", DEALS)?.name, "Example Cards");
});

test("the ops monitor hears about a code a week before it hides", () => {
  const due = codesNeedingRecheck(new Date("2026-11-14T00:00:00Z"), 7, DEALS);
  assert.deepEqual(due.map((d) => d.host).sort(), ["ended.example", "examplecards.com.au", "stale.example"]);
  assert.equal(due.find((d) => d.host === "examplecards.com.au")?.hidesOn, "2026-11-19");
  assert.deepEqual(codesNeedingRecheck(NOW, 7, [DEALS[0]]), []);
});

test("every real deal is well formed", () => {
  for (const d of STORE_PARTNER_DEALS) {
    assert.match(d.host, /^[a-z0-9.-]+\.[a-z]{2,}$/, `${d.name}: bare lowercase hostname, no www`);
    assert.ok(!d.host.startsWith("www."), d.name);
    assert.ok(!Number.isNaN(Date.parse(d.since)), `${d.name}: since`);
    if (d.code) {
      assert.ok(d.offer, `${d.name}: a code says what it gives`);
      assert.ok(d.checked && !Number.isNaN(Date.parse(d.checked)), `${d.name}: a code has a checked date`);
      assert.match(d.code, /^[A-Z0-9_-]{3,20}$/i, `${d.name}: code`);
    }
    if (d.ref) assert.match(d.ref.param, /^[a-z0-9_]+$/i, `${d.name}: ref param`);
  }
  const hosts = STORE_PARTNER_DEALS.map((d) => d.host);
  assert.equal(new Set(hosts).size, hosts.length, "one entry per store");
});

// THE HARD RULE: a deal is a label, never a position. Nothing that ranks or
// filters rows may read the deals.
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}

test("only the chip, the link rewrite and the ops check read the deals", () => {
  const allowed = new Set([
    "src/lib/store-partner-deals.ts",
    "src/lib/affiliate.ts",
    "src/components/StoreCodeChip.tsx",
    "src/app/stores/partners/page.tsx",
    "src/lib/ops/checks.ts",
  ]);
  const readers = walk("src").filter((p) => /store-partner-deals/.test(strip(readFileSync(p, "utf8"))));
  for (const p of readers) assert.ok(allowed.has(p), `${p} reads the partner deals; a deal must never rank, filter or price a row`);
  assert.doesNotMatch(readFileSync("src/lib/market-rows.ts", "utf8"), /store-partner|StoreCode|partnerRef/);
});

test("the policy pages disclose the program", () => {
  assert.match(readFileSync("src/app/editorial-policy/page.tsx", "utf8"), /store partners/);
  assert.match(readFileSync("src/app/stores/partners/page.tsx", "utf8"), /never changes your place in any comparison/);
});
