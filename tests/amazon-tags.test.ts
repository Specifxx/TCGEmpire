// Amazon Associates (2026-10-29): each Amazon gets ITS account's tag (riftcompare-20 earns only on amazon.com,
// compareempire-22 on amazon.com.au); a market without an account shows no Amazon; the Pokémon board carries a search.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { amazonFor, amazonSearchUrl, amazonTagForHost } from "../src/lib/amazon";
import { affiliateUrl } from "../src/lib/affiliate";
import { buildBoard } from "../src/lib/pokemon/board";

test("each Amazon store gets its own account's tag", () => {
  assert.equal(amazonTagForHost("www.amazon.com", {}), "riftcompare-20");
  assert.equal(amazonTagForHost("www.amazon.com.au", {}), "compareempire-22");
  assert.equal(amazonTagForHost("amazon.com.au", { AMAZON_AU_TAG: "riftcompare-22" }), "riftcompare-22");
  assert.equal(amazonTagForHost("www.amazon.co.uk", { AMAZON_UK_TAG: "riftcompare-21" }), "riftcompare-21");
  const au = new URL(affiliateUrl("https://www.amazon.com.au/s?k=Riftbound", "amazon_sealed", "/sealed"));
  assert.equal(au.searchParams.get("tag"), process.env.AMAZON_AU_TAG || "compareempire-22");
  const us = new URL(affiliateUrl("https://www.amazon.com/s?k=Riftbound", "amazon_sealed", "/sealed"));
  assert.equal(us.searchParams.get("tag"), process.env.AMAZON_ASSOCIATE_TAG || "riftcompare-20");
});

test("where: US and AU by default, UK/CA/EU only with a tag, never Singapore", () => {
  assert.equal(amazonFor("US", {})!.host, "www.amazon.com");
  assert.equal(amazonFor("AU", {})!.host, "www.amazon.com.au");
  for (const c of ["UK", "CA", "EU", "SG"] as const) assert.equal(amazonFor(c, {}), null, c);
  assert.equal(amazonFor("EU", { AMAZON_DE_TAG: "riftcompare-21" })!.host, "www.amazon.de");
  assert.equal(amazonFor("US", { AMAZON_ASSOCIATE_TAG: "not a tag" })!.tag, "riftcompare-20");
  const u = new URL(amazonSearchUrl("US", "Pokemon TCG  Ascended Heroes Elite Trainer Box", "rc-US-pkmn-table", {})!);
  assert.equal(u.searchParams.get("k"), "Pokemon TCG Ascended Heroes Elite Trainer Box");
  assert.equal(u.searchParams.get("ascsubtag"), "rc-us-pkmn-table");
  assert.equal(amazonSearchUrl("SG", "x", "y", {}), null);
});

test("/sealed: Amazon only where the market has an account, never the AU fallback", () => {
  const page = readFileSync(new URL("../src/app/sealed/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /AMAZON_HOSTS/);
  assert.match(page, /const amazon = amazonFor\(country\);/);
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
