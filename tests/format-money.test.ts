import test from "node:test";
import assert from "node:assert/strict";
import { formatMoney } from "../src/lib/format";

// A negative amount used to render as "US$-190.00": Intl signed the number and
// the symbol was prepended to it, so the minus landed between the symbol and the
// digits (the Condition and Selling-Fee calculators showed it on every loss).
// Since 2026-09-23 a negative takes a LEADING U+2212 minus before the symbol,
// matching the site's other signed figures ("−68.8%"). Every formatMoney
// consumer is display text — the portfolio CSV export formats its own numbers
// with toFixed — so the typographic minus never reaches anything that parses it.
test("formatMoney puts a leading U+2212 minus before the currency symbol", () => {
  assert.equal(formatMoney(-19000, "USD"), "−US$190.00");
  assert.equal(formatMoney(-149, "AUD"), "−A$1.49");
  assert.equal(formatMoney(-123456, "GBP"), "−£1,234.56");
});

test("formatMoney leaves positive, zero and rounds-to-zero amounts unsigned", () => {
  assert.equal(formatMoney(19000, "USD"), "US$190.00");
  assert.equal(formatMoney(0, "EUR"), "€0.00");
  assert.equal(formatMoney(-0, "EUR"), "€0.00");
  assert.equal(formatMoney(-0.4, "SGD"), "S$0.00");
});
