import { test } from "node:test";
import assert from "node:assert/strict";
import { isGiveawayTeamEmail } from "../src/lib/admin-emails";

test("the giveaway team covers admins and the company mailboxes, not visitors", () => {
  assert.equal(isGiveawayTeamEmail("bill.jyang101@gmail.com"), true);
  assert.equal(isGiveawayTeamEmail("CompareEmpire@gmail.com"), true);
  assert.equal(isGiveawayTeamEmail("riftcompare@gmail.com"), true);
  assert.equal(isGiveawayTeamEmail("someone@example.com"), false);
  assert.equal(isGiveawayTeamEmail(null), false);
});
