// Amazon Associates (2026-10-29): each Amazon gets ITS account's tag (riftcompare-20 earns only on amazon.com,
// riftcompare-22 on amazon.com.au); a market without an account shows no Amazon; the Pokémon board carries a search.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { amazonFor, amazonSearchUrl, amazonSellsSealed, amazonTagForHost } from "../src/lib/amazon";
import { affiliateUrl } from "../src/lib/affiliate";
import { buildBoard } from "../src/lib/pokemon/board";

test("each Amazon store gets its own account's tag, hard-coded (owner, 2026-11-02)", () => {
  assert.equal(amazonTagForHost("www.amazon.com"), "riftcompare-20");
  assert.equal(amazonTagForHost("amazon.com.au"), "riftcompare-22");
  assert.equal(amazonTagForHost("www.amazon.co.uk"), "compareempi03-21");
  assert.equal(amazonTagForHost("www.amazon.ca"), "compareempire-20");
  assert.equal(amazonTagForHost("www.amazon.de"), "compareempire-21");
  const au = new URL(affiliateUrl("https://www.amazon.com.au/s?k=Riftbound", "amazon_sealed", "/sealed"));
  assert.equal(au.searchParams.get("tag"), "riftcompare-22");
  const us = new URL(affiliateUrl("https://www.amazon.com/s?k=Riftbound", "amazon_sealed", "/sealed"));
  assert.equal(us.searchParams.get("tag"), "riftcompare-20");
});

test("where: US, AU, UK, CA and EU (amazon.de), never Singapore", () => {
  assert.equal(amazonFor("US")!.host, "www.amazon.com");
  assert.equal(amazonFor("AU")!.host, "www.amazon.com.au");
  assert.equal(amazonFor("UK")!.host, "www.amazon.co.uk");
  assert.equal(amazonFor("CA")!.host, "www.amazon.ca");
  assert.equal(amazonFor("EU")!.host, "www.amazon.de");
  assert.equal(amazonFor("SG"), null);
  const u = new URL(amazonSearchUrl("US", "Pokemon TCG  Ascended Heroes Elite Trainer Box", "rc-US-pkmn-table")!);
  assert.equal(u.searchParams.get("k"), "Pokemon TCG Ascended Heroes Elite Trainer Box");
  assert.equal(u.searchParams.get("ascsubtag"), "rc-us-pkmn-table");
  assert.equal(amazonSearchUrl("SG", "x", "y"), null);
});

test("/sealed: Amazon only where the market has an account, never the AU fallback", () => {
  // The marketplace rows moved to a client component on 2026-11-05 (the page is one CDN copy for every market).
  for (const f of ["../src/app/sealed/page.tsx", "../src/components/SealedMarketplaceSearches.tsx"]) assert.doesNotMatch(readFileSync(new URL(f, import.meta.url), "utf8"), /AMAZON_HOSTS/);
  const rows = readFileSync(new URL("../src/components/SealedMarketplaceSearches.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(rows, /amazonFor|amazon_sealed|amazon\.com|Amazon →/, "no Amazon on the hub's category searches (owner, 2026-11-12)");
});

test("the Pokémon board: an Amazon search in the US and AU, none in Singapore; no price", () => {
  const us = buildBoard("Ascended Heroes Elite Trainer Box", [], "US", { page: "/pokemon/sealed/x", surface: "table" });
  assert.match(us.amazonSearch!.href, /^https:\/\/www\.amazon\.com\/s\?k=Pokemon\+TCG\+Ascended\+Heroes\+Elite\+Trainer\+Box&tag=[a-z0-9-]+-2\d&ascsubtag=rc-us-pkmn-table$/);
  assert.equal(us.amazonSearch!.label, "Check price on Amazon US");
  assert.match(buildBoard("Pokémon TCG: X", [], "AU", { page: "p", surface: "table" }).amazonSearch!.href, /amazon\.com\.au\/s\?k=Pok%C3%A9mon\+TCG%3A\+X&/);
  assert.equal(buildBoard("X", [], "SG", { page: "p", surface: "table" }).amazonSearch, null);
  const view = readFileSync(new URL("../src/components/pokemon/PokemonBoardView.tsx", import.meta.url), "utf8");
  assert.match(view, /board\.amazonSearch && <AffiliateDisclosure partner="amazon" tight \/>/);
});

test("sealed: Amazon's row only for set products Amazon sells (owner, 2026-11-12)", () => {
  for (const t of ["Booster Box", "Booster Pack", "Sleeved Booster", "Bundle", "Starter Set", "Box Set"]) assert.equal(amazonSellsSealed({ productType: t, groupKey: `OGN|${t}` }), true, t);
  for (const t of ["Nexus Night Pack", "Promo Pack", "T1 Signature Edition", "Worlds 2026 Edition", "Proving Grounds", "Champion Deck (Ahri)", "Showdown Decks", "Booster Case", "Sealed"]) assert.equal(amazonSellsSealed({ productType: t, groupKey: `OGN|${t}` }), false, t);
  assert.equal(amazonSellsSealed({ productType: "Booster Box", groupKey: "T1S|Booster Box|CN" }), false, "a Chinese edition");
});
