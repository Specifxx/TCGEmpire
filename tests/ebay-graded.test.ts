import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseGrade, isGradedListing, cardIdentityStages, type EbayCardIdentity } from "../src/lib/ebay";
import { isTwiceDailyPrinting, eBayWorthSearching } from "../src/lib/price-import";

// ─────────────────────────────────────────────────────────────────────────────
// Graded (slabbed) listings, the twice-daily chase refresh, and the tabbed panel.
//
// The expensive mistakes here are all silent:
//   1. A slab leaking into the price path. It trades far above raw, so it lands
//      as the "cheapest" and propagates through lowestPriceCents into history,
//      the index, alerts and the Product JSON-LD.
//   2. A wrong grade. PSA 10 vs PSA 1 is an order of magnitude of value, and a
//      naive regex gets this exactly backwards on the most common title there is.
//   3. The chase pass deleting rows it did not refresh. refreshEbayMarkets
//      replaces a market WHOLESALE; a subset pass through that path would drop
//      ~600 cards' prices twice a day with no error.
//   4. The chase pass's own writes convincing the full pass it is not due.
// ─────────────────────────────────────────────────────────────────────────────

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// ── Grade parsing ────────────────────────────────────────────────────────────

test("grades parse out of realistic slab titles", () => {
  const cases: [string, string | null, number | null][] = [
    ["PSA 10 Akali Rogue Assassin VEN Signature", "PSA", 10],
    ["Riftbound Jinx PSA10 GEM MINT", "PSA", 10],
    ["BGS 9.5 Vayne Hunter — Black Label", "BGS", 9.5],
    ["CGC 9 Riftbound Vi Piltover", "CGC", 9],
    ["SGC 8.5 Riftbound Lux", "SGC", 8.5],
    ["Riftbound Ahri PSA-9 Mint", "PSA", 9],
    ["PSA 10.0 Riftbound Leona", "PSA", 10],
    // Grader with no number: still graded, grade unknown. Never guessed.
    ["Riftbound Draven PSA graded, see photos", "PSA", null],
    ["Riftbound Swain — CGC slab", "CGC", null],
    // Not graded at all.
    ["Riftbound Ambessa 196/166 Overnumbered NM", null, null],
  ];
  for (const [title, grader, grade] of cases) {
    const got = parseGrade(title);
    assert.equal(got.grader, grader, `grader for "${title}"`);
    assert.equal(got.grade, grade, `grade for "${title}"`);
  }
});

test("PSA 10 is never read as PSA 1 — the ordering trap", () => {
  // A `[1-9]` branch placed before the `10` branch matches the leading digit of
  // "10" and silently records every gem-mint slab as the worst possible grade.
  for (const t of ["PSA 10", "PSA10", "BGS 10", "CGC 10 Pristine", "PSA 10.0"]) {
    assert.equal(parseGrade(`Riftbound Jinx ${t}`).grade, 10, t);
  }
});

test("a number not attached to a grader is not a grade", () => {
  // The grader must sit immediately before the number. These all contain a
  // grader AND a digit, and none of them states a grade.
  assert.equal(parseGrade("1 of 10 Riftbound PSA graded").grade, null);
  assert.equal(parseGrade("Riftbound Vi 042/166 — will PSA grade").grade, null);
  assert.equal(parseGrade("Riftbound Lux 10th Anniversary PSA").grade, null);
});

test("isGradedListing and parseGrade agree on what counts as graded", () => {
  for (const t of ["PSA 10 Jinx", "BGS 9.5 Vi", "Riftbound Vex CGC", "graded Riftbound Ahri"]) {
    assert.ok(isGradedListing(t), `${t} should be graded`);
  }
  assert.ok(!isGradedListing("Riftbound Ambessa 196/166 NM"));
});

// ── The price path never sees a slab ─────────────────────────────────────────

const CARD: EbayCardIdentity = {
  name: "Akali, Rogue Assassin", setCode: "VEN", number: "189", total: "166", isSignature: true,
};
const item = (title: string) => ({ title, price: { value: "100.00", currency: "USD" } });

test("the graded partition leaves the price survivor set identical", () => {
  // The property the whole free-capture design rests on: filtering with
  // allowGraded and then removing graded must equal filtering without it.
  const titles = [
    "PSA 10 Akali Rogue Assassin VEN Signature",
    "Akali Rogue Assassin VEN 189*/166 Signature Foil NM",
    "BGS 9.5 Akali Rogue Assassin VEN Signature",
    "Akali Rogue Assassin VEN Signature Overnumbered",
    "Riftbound VEN bulk lot 50 cards Akali signature",
    "PSA 10 Akali Rogue Assassin VEN Signature lot of 3",
  ];
  const items = titles.map(item);

  const strict = cardIdentityStages(CARD);
  const today = items.filter((it) => strict.every((s) => s.pred(it)));

  const relaxed = cardIdentityStages(CARD, { allowGraded: true });
  const kept = items.filter((it) => relaxed.every((s) => s.pred(it)));
  const graded = kept.filter((it) => isGradedListing(it.title));
  const pricePath = kept.filter((it) => !graded.includes(it));

  assert.deepEqual(pricePath, today, "partitioned price path must equal today's survivor set");
  assert.ok(graded.length > 0, "and the graded bucket must actually catch the slabs");
  // A slab inside a lot is neither: NOT_A_SINGLE rejects it from both buckets.
  assert.ok(
    !graded.some((it) => /lot of 3/.test(it.title)),
    "a slab in a lot must not be captured as a single graded listing",
  );
});

test("capture happens before the reference-value guard", () => {
  // That guard drops anything >8x the store price and over $4,000 — which is the
  // archetypal PSA 10. Capturing after it would silently lose the most valuable
  // slabs, the exact listings this feature exists to surface.
  const src = read("src/lib/ebay.ts");
  const capture = src.indexOf("captureGraded.push(");
  const guard = src.indexOf("not absurdly above store value");
  const prune = src.indexOf("pruneCheapOutliers(valid)");
  const adSlice = src.indexOf("valid.slice(0, 4)");
  assert.ok(capture > 0 && guard > 0 && prune > 0 && adSlice > 0, "could not locate all four");
  assert.ok(capture < guard, "graded must be captured before the reference-value guard");
  assert.ok(capture < prune, "…and before pruneCheapOutliers, the only set-dependent step");
  assert.ok(capture < adSlice, "…and before the ad carousel slice, or it fills with slabs");
});

test("graded rows live in their own table, unreachable from prices", () => {
  const schema = read("prisma/schema.prisma");
  assert.match(schema, /model EbayGradedListing \{/);
  const model = schema.slice(schema.indexOf("model EbayGradedListing {"));
  const body = model.slice(0, model.indexOf("\n}"));
  for (const f of ["grader", "grade", "itemId", "priceCents"]) {
    assert.match(body, new RegExp(`\\b${f}\\b`), `EbayGradedListing.${f} missing`);
  }
  const importer = read("src/lib/price-import.ts");
  const helper = importer.slice(importer.indexOf("function gradedRowsFor"));
  const helperBody = helper.slice(0, helper.indexOf("\n}\n"));
  assert.ok(
    !/retailerPrice|lowestPriceCents/.test(helperBody),
    "the graded row builder must never touch price tables",
  );
});

// ── Twice-daily chase refresh ────────────────────────────────────────────────

test("the twice-daily set is exactly promo, signature and overnumbered", () => {
  assert.ok(isTwiceDailyPrinting({ collectorNumber: "012/166", isPromo: true }), "promo");
  assert.ok(isTwiceDailyPrinting({ collectorNumber: "189*/166", isPromo: false }), "signature");
  assert.ok(isTwiceDailyPrinting({ collectorNumber: "196/166", isPromo: false }), "overnumbered");
  assert.ok(!isTwiceDailyPrinting({ collectorNumber: "042/166", isPromo: false }), "plain base print");
});

test("every twice-daily printing also passes the catalogue rule", () => {
  // The two filters are stacked in the pass. If they ever disagree, a card would
  // be scheduled for refresh and then skipped — a silent no-op twice a day.
  const cases = [
    { rarity: "Common", collectorNumber: "012/166", variant: null, isPromo: true },
    { rarity: "Uncommon", collectorNumber: "007/166", variant: null, isPromo: true },
    { rarity: "Common", collectorNumber: "189*/166", variant: null, isPromo: false },
    { rarity: "Uncommon", collectorNumber: "196/166", variant: null, isPromo: false },
  ];
  for (const c of cases) {
    assert.ok(isTwiceDailyPrinting(c), `${c.collectorNumber} should be twice-daily`);
    assert.ok(eBayWorthSearching(c), `${c.collectorNumber} scheduled but excluded by the catalogue rule`);
  }
});

test("the chase pass NEVER deletes rows it did not refresh", () => {
  // THE landmine. refreshEbayMarkets replaces a market wholesale:
  //   deleteMany({ where: { retailer } })
  // A 150-card subset through that path deletes every eBay row in the market and
  // writes back only the subset — ~600 cards' prices gone, twice a day, silently.
  const src = read("src/lib/price-import.ts");
  const fn = src.slice(src.indexOf("export async function refreshEbayChasePrintings"));
  // Ends at the function's own closing brace (column 0) rather than at the next
  // block comment: that boundary silently moved when the auction pass below it
  // was deleted, and the slice then swallowed unrelated functions.
  const body = fn.slice(0, fn.indexOf("\n}\n"));
  const deletes = body.match(/deleteMany\(\{[^}]*\}[^)]*\)/g) ?? [];
  assert.ok(deletes.length >= 3, "expected scoped deletes for prices, carousel and graded");
  for (const d of deletes) {
    assert.match(d, /cardId: \{ in: slice \}/, `unscoped delete in the chase pass: ${d}`);
  }
});

test("the chase gate uses a stamp the chase pass can actually advance", () => {
  // REGRESSION. Gating chase on _min made it a latch the chase pass could not
  // clear: _min is deliberately immune to chase writes (that is what protects
  // the full pass), so chaseDue stayed true for the entire 10-20h window.
  //
  // There are THREE daily invocations of this import, not two — GitHub Actions
  // at 07:00 and 19:00, and vercel.json's own cron at 18:00 — so it fired at
  // 18:00 and again at 19:00. ~420 wasted Browse calls, and each
  // primeEbayBudget() also cleared a rate-limit latch the morning pass had set.
  const src = read("src/lib/price-import.ts");
  assert.match(src, /_max: \{ lastSeen: true \}/, "the groupBy must also select _max");
  assert.match(
    src,
    /const chaseDue = !ebayDue && olderThan\(newestPerMarket, chaseCutoff\)\.length > 0;/,
    "chase must gate on the NEWEST write, which its own run advances",
  );
  assert.match(
    src,
    /const staleMarkets = olderThan\(oldestPerMarket, fullCutoff\);/,
    "the full pass must still gate on the OLDEST row",
  );
});

test("the import runs exactly twice a day, and the gate comment says so", () => {
  // The redundant vercel.json cron (18:00) was removed 2026-08-24: it double-
  // fired an hour before the 19:00 GitHub run, wasting ~420 eBay Browse calls
  // and a whole operational import. The 20h/10h eBay gate was always tuned for
  // the 07:00 (full) + 19:00 (chase) pair, so the chase pass just moves to 19:00.
  // This test keeps reality and the gate comment in lockstep in BOTH directions:
  // vercel.json must NOT re-add the import cron, and GitHub must keep exactly two.
  const vercel = JSON.parse(read("vercel.json"));
  const refresh = (vercel.crons ?? []).filter((c: any) => c.path === "/api/cron/refresh-prices");
  assert.equal(refresh.length, 0, "vercel.json must not schedule the price import (GitHub Actions owns it)");
  const gha = read(".github/workflows/refresh-prices.yml");
  const crons = [...gha.matchAll(/cron:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.equal(crons.length + refresh.length, 2, "expected exactly 2 daily import invocations in total");
  // If a schedule moves, the reasoning in the gate comment has to move with it.
  const src = read("src/lib/price-import.ts");
  assert.match(src, /TWO daily invocations/, "the gate must document the two invocations");
});

test("a failed search never deletes a price row", () => {
  // searchEbayLowest returns null for BOTH "no listing" and "the call failed".
  // The chase pass deletes rows for every card in `reached`, so conflating them
  // means one transient 5xx wipes a live price on a chase card, twice a day.
  const ebay = read("src/lib/ebay.ts");
  const fn = ebay.slice(ebay.indexOf("export async function searchEbayLowest"));
  const body = fn.slice(0, fn.indexOf("// Keyword each sealed product type"));
  // Every non-answer path must mark the call failed.
  assert.ok(body.includes("status?: { ok: boolean }"), "must expose a status out-param");
  assert.ok(
    (body.match(/status\.ok = false/g) ?? []).length >= 4,
    "no-token, network throw, 429 and !res.ok must all report failure",
  );

  const importer = read("src/lib/price-import.ts");
  const chase = importer.slice(importer.indexOf("export async function refreshEbayChasePrintings"));
  const chaseBody = chase.slice(0, chase.indexOf("\n}\n"));
  assert.match(
    chaseBody,
    /if \(!status\.ok\) \{\s*reached\.delete\(c\.id\);/,
    "a card whose search did not complete must leave the delete scope",
  );
});

test("the full pass's due-gate cannot be fooled by a chase write", () => {
  // The FULL pass must read _min. _max answers "did anything refresh recently?",
  // which a 150-card chase write satisfies every evening — the full catalogue
  // would then never run again. _min answers "how stale is the oldest row?",
  // which only the full pass can move.
  //
  // (_max is also selected now, but it belongs to the CHASE gate — see the
  // regression test above. What matters is which stamp each gate reads.)
  const src = read("src/lib/price-import.ts");
  assert.match(
    src,
    /const oldestPerMarket = new Map\(lastPerMarket\.map\(\(r\) => \[r\.retailer, r\._min\.lastSeen\]\)\);/,
    "the oldest-row stamp must come from _min",
  );
  assert.match(
    src,
    /const staleMarkets = olderThan\(oldestPerMarket, fullCutoff\);/,
    "the full pass must gate on the oldest row, not the newest",
  );
});

test("the chase pass never runs in the same invocation as the full pass", () => {
  const src = read("src/lib/price-import.ts");
  assert.match(
    src,
    /const chaseDue = !ebayDue && olderThan\(newestPerMarket, chaseCutoff\)\.length > 0;/,
    "chaseDue must exclude the full-pass case, or chase cards get queried twice for nothing",
  );
});

// ── The tabbed panel ─────────────────────────────────────────────────────────

test("tabs implement the real ARIA pattern, not aria-pressed buttons", () => {
  const src = read("src/components/EbayTabs.tsx");
  for (const attr of ['role="tablist"', 'role="tab"', "aria-selected", "aria-controls", "aria-labelledby"]) {
    assert.ok(src.includes(attr), `EbayTabs must set ${attr}`);
  }
  assert.match(src, /tabIndex=\{isActive \? 0 : -1\}/, "roving tabindex");
  for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"]) {
    assert.ok(src.includes(key), `keyboard support for ${key}`);
  }
});

test("the eBay section does not claim its listings include graded copies", () => {
  // The code has partitioned slabs out of the price path since the Graded tab
  // shipped, but the card page's own subtitle still read "including used, graded
  // and international sellers" — so the ONE place a reader was told a slab might
  // be sitting in the price comparison was the site itself. Copy that contradicts
  // the pipeline is indistinguishable, to a reader, from the pipeline being wrong.
  const page = read("src/app/card/[id]/page.tsx");
  const at = page.indexOf("Also available on eBay");
  assert.ok(at > 0, "could not locate the eBay section");
  const section = page.slice(at, at + 1200);
  assert.doesNotMatch(
    section,
    /listings including used, graded/,
    "the section must not advertise graded copies as part of the raw listings",
  );
  assert.match(section, /own tab/, "it should say where graded and auctions actually live");
});

test("graded is split out before anything that can reach a price", () => {
  // Order is the whole guarantee. The partition must precede the reference
  // guard, the delivered() sort, pruneCheapOutliers AND the carousel capture —
  // a slab surviving into any of them either becomes the published price or
  // shows up in the Listings tab, which is exactly what the tab exists to stop.
  const src = read("src/lib/ebay.ts");
  const split = src.indexOf("captureGraded.push(");
  assert.ok(split > 0, "could not locate the graded partition");
  for (const marker of [
    "not absurdly above store value", // the reference guard
    "const valid = cur.sort(",         // the price sort
    "pruneCheapOutliers(valid)",       // the outlier prune
    "captureAdListings.push(",         // the Listings-tab carousel
  ]) {
    const at = src.indexOf(marker);
    assert.ok(at > 0, `could not locate ${marker}`);
    assert.ok(at > split, `${marker} runs BEFORE the graded partition — slabs can reach it`);
  }
});

test("a single tab renders no tablist chrome", () => {
  // Most cards have listings only. A tablist of one reads as a broken control.
  const src = read("src/components/EbayTabs.tsx");
  assert.match(src, /const showTabs = tabs\.length > 1;/);
});

test("every eBay tab surface is tracked and disclosed exactly once", () => {
  const graded = read("src/components/EbayGradedLive.tsx");
  assert.match(graded, /retailer="ebay_graded"/, "graded clicks need their own key");
  assert.ok(!graded.includes("AffiliateDisclosure"), "the panel owns the disclosure, not the tab body");

  // …and the two panels that render bare children must each carry one.
  for (const f of ["src/components/EbayCardPanelLive.tsx", "src/components/QuickView.tsx"]) {
    assert.match(read(f), /<AffiliateDisclosure partner="ebay" tight \/>/, `${f} must disclose`);
  }
});

test("bare mode is only ever used where a parent discloses", () => {
  // AffiliateDisclosure's rule: if an affiliate link renders, its disclosure
  // renders. `bare` suppresses the inner one, so it is only safe under a parent
  // that provides one.
  for (const f of ["src/components/EbayAdCarouselLive.tsx"]) {
    const src = read(f);
    assert.match(src, /\{!bare && <AffiliateDisclosure|\{!bare && \(\s*<div className="border-t/, `${f} must gate its disclosure on !bare`);
  }
});

