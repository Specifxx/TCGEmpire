import { test } from "node:test";
import assert from "node:assert/strict";
import { applyEdit, cleanLinkUrl, validateProfileEdit } from "../src/lib/content/creator-edit";
import { CREATORS } from "../src/lib/content/creators";

test("links are cleaned and held to their platform", () => {
  assert.equal(cleanLinkUrl("YouTube", "https://youtube.com/@riftsandboundstcg?si=Ga8frFKo3EqgFYf-"), "https://youtube.com/@riftsandboundstcg");
  assert.equal(cleanLinkUrl("TikTok", "www.tiktok.com/@rifts.and.bounds"), "https://www.tiktok.com/@rifts.and.bounds");
  assert.equal(cleanLinkUrl("TikTok", "https://evil.example/@x"), null);
  assert.equal(cleanLinkUrl("Website", "http://insecure.com"), null);
  assert.equal(cleanLinkUrl("Website", "javascript:alert(1)"), null);
});

test("validation rejects bad input and fills handles", () => {
  assert.equal(validateProfileEdit({ blurb: "short", links: [] }).ok, false);
  assert.equal(validateProfileEdit({ blurb: "Pack openings weekly", links: [], tags: "a" }).ok, false);
  assert.equal(validateProfileEdit({ blurb: "Pack openings weekly", links: [{ platform: "X", url: "x.com/a" }], tags: "a,b,c,d" }).ok, false);
  const v = validateProfileEdit({ blurb: "Pack openings weekly", links: [{ platform: "TikTok", url: "tiktok.com/@me" }] });
  assert.ok(v.ok && v.edit.links[0].handle === "@me");
});

test("a stored edit overrides content but never name, slug or code", () => {
  const c = CREATORS[0];
  const row = { slug: c.slug, blurb: "New one-line blurb here", links: JSON.stringify([{ platform: "Twitch", url: "https://twitch.tv/x" }]), tipUrl: null, tags: "", region: null, editedAt: new Date() };
  const m = applyEdit(c, row);
  assert.equal(m.blurb, "New one-line blurb here");
  assert.equal(m.name, c.name);
  assert.deepEqual(m.code, c.code);
  assert.equal(applyEdit(c, { ...row, links: "not json" }), c);
  assert.equal(applyEdit(c, { ...row, editedAt: null }), c);
});
