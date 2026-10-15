import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { listingMatchesCard, type EbayCardIdentity } from "../src/lib/ebay";
import { REGIONAL_PRINTINGS, regionalPrinting } from "../src/lib/regional-printings";

// Regional exclusives (2026-10-15, DECISIONS.md "Regional exclusives"): a handful
// of cards that ARE a Korean or Chinese printing get eBay prices, while every
// other card still rejects foreign listings exactly as before.

const L = (title: string, country = "US") => ({ title, price: { value: "100.00" }, itemLocation: { country } });

function card(externalId: string | null, number: string, total: string, name: string, opts: Partial<EbayCardIdentity> = {}): EbayCardIdentity {
  return {
    name,
    setCode: total === "167" ? "RAD" : "OGN",
    number,
    total,
    isSignature: false,
    isPromo: false,
    regional: regionalPrinting(externalId),
    ...opts,
  };
}

const yasuoKr = card("promo-ogn-076b-yasuo-remorseful-kr-msi", "076b", "298", "Yasuo, Remorseful", { isPromo: true });
const ahriKr = card("regional-ogn-303a-ahri-nine-tailed-fox-kr", "303a", "298", "Ahri, Nine-Tailed Fox");
const ahriEn = card(null, "303", "298", "Ahri, Nine-Tailed Fox");
const seraCn = card("regional-rad-174as-seraphine-starry-eyed-songstress-cn", "174a", "167", "Seraphine, Starry-Eyed Songstress", { isSignature: true });
const seraEnSig = card(null, "174", "167", "Seraphine, Starry-Eyed Songstress", { isSignature: true });
const jinxKr = card("promo-ogn-030-jinx-demolitionist-kr-launch", "030", "298", "Jinx, Demolitionist", { isPromo: true });

test("every regional printing is in the manual catalogue under the same externalId", () => {
  const manual = JSON.parse(readFileSync("prisma/manual-cards.json", "utf8")) as { externalId?: string }[];
  const ids = new Set(manual.map((m) => m.externalId).filter(Boolean));
  for (const r of REGIONAL_PRINTINGS) assert.ok(ids.has(r.externalId), r.externalId);
  assert.equal(regionalPrinting("ogn-303-298"), undefined, "an ordinary card is not regional");
});

test("the Korean Yasuo promo matches how sellers actually title it, and only in Korean or Korea", () => {
  assert.ok(listingMatchesCard(L("Riftbound MSI 2026 Korea Exclusive Yasuo Promo Card Korean"), yasuoKr));
  assert.ok(listingMatchesCard(L("[Sealed] Riftbound MSI Korea Exclusive Yasuo Promo Card Limited Lucky Draw"), yasuoKr));
  assert.ok(listingMatchesCard(L("Riftbound Yasuo 076b/298 Promo Card — Korean · NM"), yasuoKr));
  assert.ok(!listingMatchesCard(L("Yasuo Remorseful 076/298 Riftbound Origins Promo"), yasuoKr), "English, no region");
  assert.ok(!listingMatchesCard(L("Korean Yasuo Remorseful 076a/298 Showcase"), yasuoKr), "a different printing's number");
  assert.ok(!listingMatchesCard(L("Riftbound Korea Exclusive Ahri Promo Card"), yasuoKr), "a different card");
});

test("the Korea-only Ahri is told apart from the ordinary 303 printed in the same packs", () => {
  assert.ok(listingMatchesCard(L("Riftbound Korean Ahri Nine-Tailed Fox 303a/298 Overnumber"), ahriKr));
  assert.ok(listingMatchesCard(L("Riftbound Korea Exclusive Gumiho Ahri Overnumber Allen Song"), ahriKr));
  assert.ok(!listingMatchesCard(L("Riftbound Korean Ahri Nine-Tailed Fox 303/298 Overnumber"), ahriKr), "the ordinary 303, in Korean");
  assert.ok(!listingMatchesCard(L("Ahri Nine-Tailed Fox 303a/298 Overnumbered Origins"), ahriKr), "no language");
});

test("English cards still reject the regional listings, unchanged", () => {
  assert.ok(!listingMatchesCard(L("Riftbound Korean Ahri Nine-Tailed Fox 303a/298 Overnumber"), ahriEn));
  assert.ok(listingMatchesCard(L("Ahri Nine-Tailed Fox 303/298 Overnumbered Origins Riftbound"), ahriEn));
  assert.ok(!listingMatchesCard(L("Riftbound Seraphine Starry-Eyed Songstress 174a*/167 S-Chinese Exclusive Presale"), seraEnSig));
});

test("the Chinese Seraphine needs its 174a number and a Chinese signal", () => {
  assert.ok(listingMatchesCard(L("Riftbound Seraphine Starry-Eyed Songstress 174a*/167 S-Chinese Exclusive Presale"), seraCn));
  assert.ok(listingMatchesCard(L("Riftbound Seraphine 174a Signature Overnumber Radiance", "CN"), seraCn), "shipped from China");
  assert.ok(!listingMatchesCard(L("Riftbound Chinese Seraphine Starry-Eyed Songstress 174*/167 Signature"), seraCn), "the ordinary signed 174");
  assert.ok(!listingMatchesCard(L("Riftbound Seraphine Starry-Eyed Songstress 174a*/167 Signature"), seraCn), "no Chinese signal");
});

test("the Korean launch Jinx promo", () => {
  assert.ok(listingMatchesCard(L("Riftbound Jinx Demolitionist 030/298 Korean Launch Promo"), jinxKr));
  assert.ok(!listingMatchesCard(L("Riftbound Jinx Demolitionist 030/298 Promo Origins"), jinxKr), "English promo wording only");
});
