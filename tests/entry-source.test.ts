import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanCampaign } from "../src/lib/entry-source";

test("cleanCampaign keeps a safe creator or post tag and drops everything else", () => {
  assert.equal(cleanCampaign("?utm_source=instagram&utm_campaign=Brodie_Plays-1"), "brodie_plays-1");
  assert.equal(cleanCampaign("?utm_campaign=a b@c.com"), "abccom");
  assert.equal(cleanCampaign("?utm_campaign=" + "x".repeat(80)), "x".repeat(40));
  assert.equal(cleanCampaign("?utm_source=reddit"), undefined);
  assert.equal(cleanCampaign(""), undefined);
});
