import test from "node:test";
import assert from "node:assert/strict";
import { buildCardIndex, resolveCardId, type CardLite } from "../src/lib/price-import";
import { listingMatchesCard } from "../src/lib/ebay";

// ─────────────────────────────────────────────────────────────────────────────
// The two "wrong card or product" reports in the inbox on 2026-09-24, each
// pinned with the REAL listing title that caused it.
// ─────────────────────────────────────────────────────────────────────────────

const c = (id: string, name: string, setCode: string, collectorNumber: string, rarity = "Showcase"): CardLite => ({
  id, name, setCode, collectorNumber, rarity, variant: null, isPromo: false,
});
const CARDS: CardLite[] = [
  c("azir-over", "Azir, Emperor of the Sands", "SFD", "247/221"),
  c("jax-over", "Jax, Grandmaster at Arms", "SFD", "245/221"),
  c("jax-base", "Jax, Grandmaster at Arms", "SFD", "193/221", "Epic"),
  c("vi-over", "Vi, Piltover Enforcer", "UNL", "229/219"),
  c("vi-base", "Vi, Piltover Enforcer", "UNL", "187/219", "Rare"),
];
const idx = buildCardIndex(CARDS);
const resolve = (title: string) => resolveCardId({ title, handle: "h", variants: [] } as never, idx);

test("a store listing that names Jax is never filed under Azir because it carries Azir's number", () => {
  // Sweets and Geeks' listing reached the number-only path and landed on Azir
  // (SFD 247) at US$60 — a Jax card with Azir's collector number on it.
  const got = resolve("Jax - Grandmaster At Arms (Overnumbered) - Spiritforged - 247/221 Foil Special Edition");
  assert.notEqual(got, "azir-over", "a Jax title must never price Azir");
});

test("the number-only path still matches a title that DOES name the card", () => {
  // The guard must not become a blanket refusal — the path exists for titles
  // whose wording defeats the name lookup but which plainly name the card.
  assert.equal(resolve("Emperor of the Sands (Azir) (Overnumbered) - 247/221 [SFD]"), "azir-over");
});

// listingMatchesCard also requires a price (its first stage); every fixture carries one.
const P = { price: { value: "10.00" } };
const vi229 = { name: "Vi, Piltover Enforcer", setCode: "UNL", number: "229", total: "219", isSignature: false, isPromo: false };

test("an eBay title for Vi #187 with a mistyped '/229' is not the overnumbered 229/219", () => {
  // The exact title, found at US$1.99 in six eBay markets and published as the
  // price of a ~US$70 chase print.
  const it = { ...P, title: "Riftbound: League of Legends Unleashed - Vi - Piltover Enforcer #187/229 - FOIL" };
  assert.equal(listingMatchesCard(it, vi229), false);
});

test("a genuine overnumbered Vi listing still matches, with or without the /219", () => {
  assert.equal(listingMatchesCard({ ...P, title: "Vi Piltover Enforcer 229/219 Overnumbered Foil Riftbound Unleashed" }, vi229), true);
  assert.equal(listingMatchesCard({ ...P, title: "Riftbound Unleashed Vi Piltover Enforcer Overnumbered #229" }, vi229), true);
});
