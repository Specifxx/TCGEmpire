import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ISSUES,
  ISSUE_CODES,
  REPORT_KINDS,
  REPORT_STATUSES,
  SEALED_GROUP_NAME,
  SEALED_SET_NAMES,
  issueLabel,
  issueNoun,
  issueWantsPrice,
  sealedReportTarget,
  shouldNotifyReporter,
} from "../src/lib/price-report";
import { sendPriceReportFixedEmail } from "../src/lib/email";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// "THIS PRICE IS WRONG."
//
// Every price on this site is scraped, and a scraper cannot tell you it has
// started lying — StoreHealthSnapshot catches stale fetches, dropped listings
// and frozen or jumped prices, but not "the listing says $12 and the shop's page
// says $19". Only a person looking at both can catch that, and this is the path
// they use.
//
// The tests below pin the two things that make such a report worth acting on:
//   • the "what we were showing" figure comes from OUR database, never from the
//     request body — a number a stranger can type into an admin screen is a
//     number an admin cannot act on;
//   • the form and the API validate against the SAME list of issue codes, so an
//     option added to the dropdown can't be rejected by a stale allow-list.
// ─────────────────────────────────────────────────────────────────────────────

const ROUTE = "src/app/api/price-report/route.ts";
const FORM = "src/components/ReportPriceButton.tsx";

test("the form and the API agree on what can be reported, because they share one list", () => {
  // The drift this prevents: someone adds a radio option, the route's Set
  // doesn't know the code, and every report of the new kind 400s while the form
  // believes it sent something valid.
  const route = read(ROUTE);
  const form = read(FORM);
  assert.match(route, /from "@\/lib\/price-report"/, "the route must validate against the shared contract");
  assert.match(form, /from "@\/lib\/price-report"/, "the form must render from the shared contract");
  assert.match(route, /ISSUE_CODES\.has\(issue\)/, "issue codes must be checked against the shared set");
  assert.match(form, /ISSUES\.map\(/, "the form's options must be generated from the shared list, not typed out");

  // And the contract itself is coherent.
  assert.equal(ISSUE_CODES.size, ISSUES.length, "duplicate issue code");
  assert.ok(ISSUE_CODES.has("PRICE_WRONG"));
  assert.ok(!ISSUE_CODES.has("NOT_A_REAL_CODE"));
  assert.equal(issueLabel("OUT_OF_STOCK"), "It's out of stock");
  // Only the price issue asks for a price: an input that cannot be filled in is
  // a question the reporter has to skip.
  assert.ok(issueWantsPrice("PRICE_WRONG"));
  for (const i of ISSUES) {
    if (i.code !== "PRICE_WRONG") assert.ok(!issueWantsPrice(i.code), `${i.code} should not ask for a price`);
  }
});

test("the price we were showing is read from our own database, never from the request", () => {
  // THE assertion. The report's whole worth is the comparison "we say X, the shop
  // says Y", and X has to be ours. If the client could send it, an admin would be
  // triaging a number a stranger chose.
  const route = read(ROUTE);
  assert.match(route, /shownPriceCents = listing\.priceCents/, "the shown price must come from a database row");
  assert.ok(
    !/shownPriceCents[^\n]*body[?.]/.test(route),
    "shownPriceCents must never be read out of the request body",
  );
  // Both sides look it up — cards by RetailerPrice, sealed by its natural key.
  assert.match(route, /prisma\.retailerPrice\.(findUnique|findFirst)/, "cards must be looked up");
  assert.match(route, /prisma\.sealedListing\.findFirst/, "sealed must be looked up");

  // The form's counterpart: it sends identity, not a figure.
  const form = read(FORM);
  const payload = /body: JSON\.stringify\(\{[\s\S]*?\}\),/.exec(form);
  assert.ok(payload, "expected the submit payload");
  assert.ok(
    !/priceCents:|shownPrice/.test(payload![0]),
    "the form must not send what we were showing — only actualPriceCents, which is the reporter's own claim",
  );
  assert.match(payload![0], /actualPriceCents/, "the reporter's claimed correction is still sent");
});

test("a listing id belonging to a different card cannot attach its price to this report", () => {
  // RetailerPrice ids are globally unique, so a findUnique by a supplied id would
  // happily return some other card's listing and record ITS price as what we were
  // showing for this one.
  const route = read(ROUTE);
  assert.match(
    route,
    /if \(listing && \(!listingId \|\| listing\.cardId === cardId\)\)/,
    "an id-based lookup must verify the row belongs to the reported card",
  );
});

test("an unknown market is rejected rather than silently filed against the default", () => {
  // normalizeCountry() coerces anything unrecognised to the default market, which
  // is right for rendering a page and wrong here: it would file a report against
  // the US when we don't know which market's listing was being looked at.
  const route = read(ROUTE);
  // Comments stripped: the route's own comment names normalizeCountry to explain
  // why it is NOT used, and a bare negative match would fire on the explanation.
  const code = route.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/normalizeCountry/.test(code), "must not coerce an unknown market to the default");
  assert.match(code, /body\.country in COUNTRIES/, "market must be membership-tested");
  assert.match(code, /Unknown market/, "and rejected with an error when it isn't one");
});

test("a claimed price is bounded, and rejected rather than clamped", () => {
  // A clamped figure is a number the reporter never typed, sitting in an admin
  // screen under their name.
  const route = read(ROUTE);
  assert.match(route, /MAX_CLAIM_CENTS/, "the claimed price must be bounded");
  assert.match(route, /n > MAX_CLAIM_CENTS/, "…and the bound must actually be applied");
  assert.ok(!/Math\.min\([^)]*MAX_CLAIM_CENTS/.test(route), "must reject an out-of-range figure, not clamp it");
  assert.match(route, /Number\.isInteger\(n\)/, "cents must be an integer");
});

test("reports are accepted from signed-out visitors, with the usual abuse controls", () => {
  // Requiring an account would mean only existing members can tell us our data is
  // broken — and the person who notices a wrong price is usually the stranger who
  // arrived from a search and would otherwise just close the tab.
  const route = read(ROUTE);
  assert.ok(!/status: 401/.test(route), "a signed-out visitor must not be turned away");
  assert.match(route, /price-report-anon:\$\{clientIp\(req\)\}/, "anonymous posts are rate-limited by IP");
  assert.match(route, /body\?\.website/, "honeypot");
  assert.match(route, /MAX_NOTE|MAX_EMAIL|MAX_PAGE/, "free text is bounded");

  // Safe because nothing here is ever published. If a public read path is ever
  // added, that reasoning has to be revisited — so this asserts there isn't one.
  const publicReaders = ["src/app/api/price-report/route.ts"];
  for (const f of publicReaders) {
    assert.ok(!/priceReport\.find/.test(read(f)), `${f} must not read reports back out to the public`);
  }
});

test("every surface that shows listings can report them", () => {
  // The user-facing ask was card pages, the card popup and sealed. A surface that
  // shows a price a visitor can't report is one where a wrong number goes
  // unreported — which is the entire failure this feature exists to fix.
  for (const [file, why] of [
    ["src/components/CardMarketSection.tsx", "the card page's price table"],
    ["src/components/QuickView.tsx", "the card quick-view popup"],
    ["src/components/SealedQuickView.tsx", "the sealed quick-view popup"],
  ] as const) {
    const src = read(file);
    assert.match(src, /<ReportPriceButton/, `${why} must offer a report link`);
    assert.match(src, /listings=\{reportable\}/, `${why} must pass the listings it displayed`);
  }
});

test("the report picker offers one entry per store, out-of-stock included", () => {
  // Two separate bugs this guards. Deduping: a store holds several RetailerPrice
  // rows (condition and foil are part of its unique key), so an undeduped picker
  // lists the same shop three times and the reporter cannot tell which to choose.
  // Out-of-stock: "you list it as available and it isn't" is one of the issue
  // types, and those are exactly the rows it applies to — a picker built only
  // from in-stock rows can never receive that report.
  for (const file of ["src/components/CardMarketSection.tsx", "src/components/QuickView.tsx"]) {
    const src = read(file);
    const block = /const reportable = [\s\S]*?\n  \}\)\(\)|const reportable = useMemo\([\s\S]*?\}, \[[^\]]*\]\);/.exec(src);
    assert.ok(block, `${file}: expected a reportable list`);
    assert.match(block![0], /byRetailer\.has/, `${file}: the picker must be deduped by store`);
  }
  // The card page reads both lists; the popup reads the unfiltered fetch.
  assert.match(
    read("src/components/CardMarketSection.tsx"),
    /\[\.\.\.prices, \.\.\.outOfStock\]/,
    "the card page's picker must include out-of-stock rows",
  );
  assert.match(
    read("src/components/QuickView.tsx"),
    /NOT countryRows/,
    "the popup's picker must not reuse the in-stock-only buy list",
  );
});

test("admin triage exists, is gated, and validates against the shared status list", () => {
  // A report nobody can mark as checked is a pile that grows. The per-store
  // rollup that actually catches a broken scraper counts OPEN reports, so triage
  // is what keeps it meaningful.
  const admin = read("src/app/api/admin/price-reports/route.ts");
  assert.match(admin, /user\?\.isAdmin/, "must be admin-gated");
  assert.match(admin, /status: 404/, "an unauthorised caller must not learn the route exists");
  assert.match(admin, /REPORT_STATUSES as readonly string\[\]\)\.includes\(action\)/, "status must come from the shared list");
  assert.deepEqual([...REPORT_STATUSES], ["NEW", "CONFIRMED", "REJECTED", "FIXED"]);

  const page = read("src/app/admin/messages/page.tsx");
  assert.match(page, /priceReport\.findMany/, "the inbox must show the queue");
  assert.match(page, /Check these stores/, "…and the per-store rollup that makes it actionable");
  assert.match(page, /openReports\.filter/, "the rollup must count OPEN reports, not every report ever filed");
  assert.match(page, /reportsError/, "a brand-new table must not be able to take the whole inbox down");
});

test("the report kinds match what the schema stores", () => {
  assert.deepEqual([...REPORT_KINDS].sort(), ["card", "sealed"]);
  const schema = read("prisma/schema.prisma");
  const model = /model PriceReport \{[\s\S]*?\n\}/.exec(schema);
  assert.ok(model, "expected the PriceReport model");
  // No FK to Card: ids are not stable across a catalogue rebuild, and a report is
  // evidence about a STORE — it should outlive the row it was filed against.
  assert.ok(!/cardId.*@relation/.test(model![0]), "PriceReport must not cascade away with a card");
  assert.match(model![0], /@@index\(\[retailer, createdAt\]\)/, "the per-store rollup needs its index");
});

// ─────────────────────────────────────────────────────────────────────────────
// CLOSING THE LOOP (2026-09-23). A reporter used to hear nothing back, ever.
// Marking a report FIXED now emails them once — the one message that makes
// someone bother reporting the next wrong price too. The tests below pin the
// three things that keep that email from becoming a liability: it goes on the
// move to FIXED and nowhere else, it can never fail the triage it rides on, and
// it only goes to an address someone gave us or has proved they own.
// ─────────────────────────────────────────────────────────────────────────────

const ADMIN_ROUTE = "src/app/api/admin/price-reports/route.ts";

test("a reporter is emailed on the move to FIXED, and on nothing else", () => {
  // The full 4×4 table, so a status added later has to be decided here rather
  // than inherit an email by accident. CONFIRMED is "still wrong", REJECTED is
  // an argument waiting to happen, and FIXED → FIXED is a re-click.
  for (const prev of REPORT_STATUSES) {
    for (const next of REPORT_STATUSES) {
      const want = next === "FIXED" && prev !== "FIXED";
      assert.equal(shouldNotifyReporter(prev, next), want, `${prev} → ${next} should ${want ? "" : "not "}email`);
    }
  }
});

test("the admin route thanks the reporter without ever putting the status change at risk", () => {
  // Comments stripped: the route's header talks about the email, and a pin
  // should match the code that does it, not the prose that explains it.
  const code = read(ADMIN_ROUTE).replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(
    code,
    /shouldNotifyReporter\(report\.status as ReportStatus, next\)/,
    "the decision must come from the shared rule, applied to the status being left",
  );
  assert.match(code, /prisma\.priceReport\.findUnique\(/, "the report must be read before it is changed");

  // One email per report even with two admin tabs open: the write that flips
  // the row is conditional, and only a write that flipped something sends.
  assert.match(
    code,
    /updateMany\(\{\s*where: \{ id, status: \{ not: "FIXED" \} \}/,
    "the FIXED write must be scoped to rows not already FIXED",
  );
  assert.match(code, /if \(flipped\.count > 0\)/, "only the click that actually flipped the row may send");

  // The send has its own try/catch, so nothing in it can reach the route's 500.
  const call = /try \{\s*await thankReporter\([^)]*\);\s*\} catch \(e\) \{\s*console\.error/.exec(code);
  assert.ok(call, "the thank-you must be awaited inside its own try/catch that logs");
  assert.ok(code.indexOf("updateMany(") < call!.index, "the status is written before the email is attempted");
  assert.match(
    code.slice(call!.index),
    /^try \{[\s\S]*?\}\s*catch \(e\) \{[\s\S]*?\}\s*\}\s*return NextResponse\.json\(\{ ok: true \}\);/,
    "…and the route still reports success after it, sent or not",
  );

  // Same guard as the other senders, and nobody is emailed at an address they
  // haven't shown they own.
  assert.match(code, /if \(!isEmailEnabled\(\)\)/, "sending must be guarded like the other senders");
  assert.match(code, /account\?\.emailVerified \? account\.email : null/, "an account address is only used once verified");
  // PII: a reporter's address must not end up in the function logs.
  assert.ok(!/console\.\w+\([^;]*\$\{to\}/.test(code), "never log the recipient");
});

test("a sealed report names and links the product the way its /sealed tile does", () => {
  // There is no per-product sealed page, so the link is a filter — exact set +
  // type where the group has a set (its groupKey IS `${setCode}|${type}`).
  assert.deepEqual(
    sealedReportTarget("VEN|Booster Box", { title: "whatever the store wrote", productType: "Booster Box", setCode: "VEN" }),
    { name: "Vendetta Booster Box", path: "/sealed?set=VEN&type=Booster%20Box" },
  );
  // The tile's set names (sealed-import's SET_NAMES), not lib/constants SETS':
  // no tile says "Spirit Forged" or "Origins: Proving Grounds", so neither may
  // the email that links to one.
  const named = (setCode: string, productType: string) =>
    sealedReportTarget(`${setCode}|${productType}`, { title: "", productType, setCode }).name;
  assert.equal(named("SFD", "Booster Box"), "Spiritforged Booster Box");
  // OGS's name is also a product type. Exactly equal collapses, as on the tile…
  assert.equal(named("OGS", "Proving Grounds"), "Proving Grounds");
  // …and the case says it once. The /sealed tile used to stutter "Proving Grounds
  // Proving Grounds Case"; since 2026-09-23 it names groups with the same
  // joinOverlapping helper, so the tile and the email cannot disagree.
  assert.equal(named("OGS", "Proving Grounds Case"), "Proving Grounds Case");
  assert.match(
    readFileSync(join(process.cwd(), "src/lib/sealed-import.ts"), "utf8"),
    /joinOverlapping\(setName, r\.productType\)/,
    "getAllSealedGroups must name tiles with joinOverlapping, the helper the fixed-report email uses",
  );
  // Whole words only: a type that merely starts with the set's last word is not
  // an overlap.
  assert.equal(named("OGS", "Groundsman Box"), "Proving Grounds Groundsman Box");
  // A set code with no display name reads as the code, as it does on the tile.
  assert.equal(named("XYZ", "Booster Box"), "XYZ Booster Box");

  // THE REGRESSION (review, 2026-09-23). The T1 Signature Edition groups are
  // setless and every row is a reseller's eBay listing, so the tile's name is an
  // override. This used to name the email after the row's title and link
  // ?q=<that title> — a page reading "No sealed products match your filters".
  // Now it is the tile's name, and ?q= of it finds that tile (/sealed's q is a
  // substring match on the group name — pinned below).
  assert.deepEqual(
    sealedReportTarget("T1S|T1 Signature Edition|CN", {
      title: "Riftbound T1 Sig Ed CHINESE NEW SEALED Ships Fast!!",
      productType: "T1 Signature Edition",
      setCode: null,
    }),
    {
      name: "T1 2025 Worlds Champion Signature Edition (Chinese)",
      path: "/sealed?q=T1%202025%20Worlds%20Champion%20Signature%20Edition%20(Chinese)",
    },
  );
  // Any other setless group is named by the title of the row the route picked
  // (the floor-filtered cheapest — pinned below), and linked ?q= that name, the
  // way SearchBar, Rising Sealed and the nav menu link `g.name`.
  assert.deepEqual(
    sealedReportTarget("riftboundgiftbox", { title: "Riftbound Gift Box & Sleeves", productType: "Bundle", setCode: null }),
    { name: "Riftbound Gift Box & Sleeves", path: "/sealed?q=Riftbound%20Gift%20Box%20%26%20Sleeves" },
  );
  // A stored key is data: "constructor" must not resolve to Object's.
  assert.equal(
    sealedReportTarget("constructor", { title: "Plain title", productType: "Bundle", setCode: null }).name,
    "Plain title",
  );
});

test("the sealed naming mirror still matches getAllSealedGroups", () => {
  // sealedReportTarget mirrors a rule that lives, unexported, in
  // lib/sealed-import.ts. These pins read that file, so a tile-naming change
  // there fails HERE rather than silently sending emails that name (and link)
  // something the page no longer calls that.
  const src = read("src/lib/sealed-import.ts");
  const table = (name: string) => {
    const m = new RegExp(`const ${name}: Record<string, string> = \\{([\\s\\S]*?)\\};`).exec(src);
    assert.ok(m, `expected ${name} in sealed-import.ts`);
    return Object.fromEntries([...m![1].matchAll(/(?:"([^"]+)"|(\w+)): "([^"]*)"/g)].map((x) => [x[1] ?? x[2], x[3]]));
  };
  assert.deepEqual({ ...SEALED_SET_NAMES }, table("SET_NAMES"), "SEALED_SET_NAMES must equal sealed-import's SET_NAMES");
  assert.deepEqual({ ...SEALED_GROUP_NAME }, table("T1_GROUP_NAME"), "SEALED_GROUP_NAME must equal sealed-import's T1_GROUP_NAME");

  // The naming rule itself: floor first, then set name joined to the type
  // (joinOverlapping, shared with sealedReportTarget since 2026-09-23) or the
  // title, then the per-key override.
  assert.match(src, /if \(r\.priceCents < sealedFloorCents\(r\.productType\)\) continue;\s*let g = groups\.get\(r\.groupKey\);/);
  assert.match(
    src,
    /const setName = r\.setCode \? SET_NAMES\[r\.setCode\] \?\? r\.setCode : null;[\s\S]{0,600}?const name = !setName \? r\.title : joinOverlapping\(setName, r\.productType\);/,
  );
  assert.match(src, /const name = T1_GROUP_NAME\[g\.groupKey\];\s*if \(name\) g\.name = name;/);
  // …which the route feeds the same row: the report's market, cheapest first,
  // past the same floor.
  const route = read(ADMIN_ROUTE).replace(/\/\/.*$/gm, "");
  assert.match(route, /where: \{ groupKey: report\.sealedGroupKey, country: report\.country \},\s*orderBy: \{ priceCents: "asc" \}/);
  assert.match(route, /rows\.find\(\(r\) => r\.priceCents >= sealedFloorCents\(r\.productType\)\)/);
  assert.match(route, /sealedReportTarget\(report\.sealedGroupKey, row\)/);
  // And the ?q= link finds a tile by its name.
  assert.match(read("src/app/sealed/page.tsx"), /g\.name\.toLowerCase\(\)\.includes\(ql\)/);
});

test("the email never repeats a store name the reporter's form supplied", () => {
  // api/price-report falls back to the form's retailerName when the listing had
  // already gone, and a signed-out reporter's address can be anyone's — so
  // echoing that name would make a thank-you from our domain a relay for
  // arbitrary text. The name comes from the store registry, or from the stored
  // name only when our own row supplied it (shownPriceCents set alongside it).
  const code = read(ADMIN_ROUTE).replace(/\/\/.*$/gm, "");
  assert.match(code, /storeName: trustedStoreName\(report\)/);
  assert.ok(!/retailerName: report\.retailerName/.test(code), "the stored name must not be passed through as-is");
  assert.match(code, /hasOwnProperty\.call\(RETAILERS, report\.retailer\)\) return RETAILERS\[report\.retailer\]\.name;/);
  assert.match(code, /return report\.shownPriceCents != null \? report\.retailerName : null;/);
  // Pinned on the other side too: the form's name only lands when the lookup
  // found nothing, which is exactly when shownPriceCents stays null.
  assert.match(read(ROUTE), /retailerName: retailerName \|\| str\(body\?\.retailerName, 120\) \|\| retailer/);
});

test("every issue has a noun, so the email never thanks someone for a price they didn't report", () => {
  for (const i of ISSUES) assert.ok(issueNoun(i.code).length > 0, `${i.code} needs a noun`);
  assert.equal(issueNoun("PRICE_WRONG"), "price");
  assert.equal(issueNoun("LINK_BROKEN"), "link");
  assert.equal(issueNoun("OUT_OF_STOCK"), "stock status");
  assert.equal(issueNoun("NOT_A_REAL_CODE"), "listing", "an unknown code reads as something true of every report");
});

async function captureFixedEmail(t: test.TestContext, opts: Parameters<typeof sendPriceReportFixedEmail>[1]) {
  const originalKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "test-key";
  const originalFetch = global.fetch;
  let sent: { from: string; to: string; subject: string; html: string } | null = null;
  global.fetch = (async (_url: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  t.after(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
  });
  const ok = await sendPriceReportFixedEmail("reporter@example.com", opts);
  assert.equal(ok, true);
  return sent! as { from: string; to: string; subject: string; html: string };
}

test("the thank-you email is transactional, on-brand, and escapes what it is given", async (t) => {
  const mail = await captureFixedEmail(t, {
    itemName: "Jinx <b>",
    // Escaped regardless: a setless sealed group's name is a store's listing title.
    storeName: `Shop "<script>"`,
    issue: "PRICE_WRONG",
    url: "https://riftcompare.com/sealed?set=VEN&type=Booster%20Box",
  });
  assert.equal(mail.to, "reporter@example.com");
  assert.match(mail.from, /RiftCompare/, "the same from-address as every other transactional send");
  assert.equal(mail.subject, `Fixed: the Shop "<script>" price you reported for Jinx <b>`, "a subject is plain text, not HTML");
  assert.match(
    mail.html,
    /Thanks — the Shop &quot;&lt;script&gt;&quot; price you reported for <strong[^>]*>Jinx &lt;b&gt;<\/strong> has been fixed/,
  );
  assert.ok(!/<script>/.test(mail.html), "nothing reporter-supplied may reach the HTML raw");
  assert.match(mail.html, /href="https:\/\/riftcompare\.com\/sealed\?set=VEN&amp;type=Booster%20Box"/, "links to the item");
  // The standard shell and footer, and nothing marketing.
  assert.match(mail.html, /Rift<span style="color:#34d17e">Compare<\/span>/);
  assert.match(mail.html, /RiftCompare · Riftbound card price comparison\./);
  assert.ok(
    !/Unsubscribe|Create your free account|utm_/i.test(mail.html),
    "transactional: no opt-out list, no account CTA, no campaign tags",
  );
});

test("the thank-you claims only what FIXED means", async (t) => {
  // Review, 2026-09-23. FIXED is an admin's click: the card page revalidates
  // daily and a sealed group sits behind a 48h data cache until the next import,
  // so the page may still show the old figure — and a broken link or a stock
  // status has no "corrected price" at all.
  const mail = await captureFixedEmail(t, {
    itemName: "Jinx",
    storeName: null,
    issue: "LINK_BROKEN",
    url: "https://riftcompare.com/card/jinx",
  });
  // No trusted store name: the noun stands alone rather than borrowing one.
  assert.equal(mail.subject, "Fixed: the link you reported for Jinx");
  assert.match(mail.html, /Thanks — the link you reported for <strong[^>]*>Jinx<\/strong> has been fixed\./);
  assert.match(mail.html, /It can take up to a day to show everywhere on the site\./);
  assert.match(mail.html, />See it on RiftCompare<\/a>/, "a neutral button — there may be no corrected price to see");
  assert.ok(!/corrected price|corrected it at the source|right for everyone/i.test(mail.html), "no claim FIXED can't back");
  // A report reopened and fixed again sends again (shouldNotifyReporter), so the
  // footer must not promise otherwise.
  assert.ok(!/won't email you|email you again|only once|getting this once/i.test(mail.html), "no promise the route breaks");
  assert.match(mail.html, /because you reported a problem with a listing on RiftCompare and it has now been fixed/);
});

test("the report form says what the email is for, and only promises one that can arrive", () => {
  // The optional address now has a use the reporter can see — say so where it
  // is asked for, or nobody leaves one.
  const form = read(FORM);
  assert.match(form, /\(optional — we&apos;ll email you once it&apos;s&nbsp;fixed\)/);
  // But only to signed-out reporters: api/price-report keeps a typed address for
  // them alone (a signed-in reporter's is dropped for the account's), and the
  // admin route writes to an account address only once it is verified. Promising
  // a signed-in, unverified reporter an email was promising one that never comes.
  assert.match(read(ROUTE), /email: user \? null : email\(body\?\.email\)/, "the premise of the pins below");
  assert.match(form, /\{user \? \(\s*user\.emailVerified && \(/, "signed in: a promise only when the account address is verified");
  assert.match(form, /\) : \(\s*<label className="block">\s*<span[^>]*>\s*Email /, "the field is the signed-out branch");
  assert.match(form, /email: !user && email\.trim\(\) \? email\.trim\(\) : undefined/, "and a signed-in form sends none");
});
