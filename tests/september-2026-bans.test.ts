import test from "node:test";
import assert from "node:assert/strict";
import { ARTICLES } from "../src/lib/articles";

// ─────────────────────────────────────────────────────────────────────────────
// Riot banned Ekko, Recurrent and Stacked Deck on 15 September 2026, effective
// 18 September — the first wave to hit Standard and Constructed 2v2 together
// from day one. Two things had to change: the evergreen banlist guide (which
// promises to update "the moment any further changes... are announced") and a
// new community-reaction/meta-speculation post sourced from r/riftboundtcg's
// own "New banned cards" thread. Pin both, plus the two hub references that
// used to hardcode July as "the most recent changes" and would otherwise now
// be quietly wrong.
// ─────────────────────────────────────────────────────────────────────────────

function guide() {
  const a = ARTICLES.find((x) => x.slug === "riftbound-banlist-explained");
  assert.ok(a, "expected the banlist guide to exist");
  return a!;
}

function reactionPost() {
  const a = ARTICLES.find((x) => x.slug === "riftbound-september-2026-bans-meta-shift");
  assert.ok(a, "expected the September ban reaction post to exist");
  return a!;
}

test("the banlist guide carries the September 2026 wave", () => {
  const a = guide();
  assert.equal(a.updated, "2026-09-15");
  assert.match(a.body, /Ekko, Recurrent/);
  assert.match(a.body, /Stacked Deck/);
  assert.match(a.body, /effective \*\*18 September 2026\*\*/);
  assert.match(a.body, /the first wave to hit the Standard and 2v2 ban lists together from day one/);
});

test("the guide's embeds are ordered newest-first and match the body's [[embed:N]] references", () => {
  const a = guide();
  assert.ok(a.embeds, "expected the plural embeds array");
  assert.equal(a.embeds![0].title, "September 2026 additions");
  assert.deepEqual(a.embeds![0].slugs, ["ekko-recurrent-ogn-110-298", "stacked-deck-ogn-183-298"]);
  assert.equal(a.embeds![1].title, "July 2026 additions");
  assert.equal(a.embeds![2].title, "The original 7 banned cards");

  // Every [[embed:N]] in the body must reference an index that exists.
  const refs = [...a.body.matchAll(/\[\[embed:(\d+)\]\]/g)].map((m) => Number(m[1]));
  assert.deepEqual(refs, [0, 1, 2], "body must reference embeds in the same order they're declared");
});

test("the guide cross-links the new reaction post, and vice versa", () => {
  const g = guide();
  const p = reactionPost();
  assert.match(g.body, /\/blog\/riftbound-september-2026-bans-meta-shift/);
  assert.match(p.body, /\/guides\/riftbound-banlist-explained/);
});

test("the reaction post's excerpt fits the SERP length budget (content-links.test.ts's own rule)", () => {
  const p = reactionPost();
  assert.ok(p.excerpt.length >= 50 && p.excerpt.length <= 250, `excerpt is ${p.excerpt.length} chars`);
});

test("the reaction post clears the 1500-word policy for its publish date", () => {
  const p = reactionPost();
  const words = p.body.trim().split(/\s+/).filter(Boolean).length;
  assert.ok(words >= 1500, `only ${words} words`);
});

test("the reaction post sources the Reddit thread and Riot's own announcement, with real attribution", () => {
  const p = reactionPost();
  assert.match(p.body, /reddit\.com\/r\/riftboundtcg\/comments\/1wgkixo\/new_banned_cards/);
  assert.match(p.body, /playriftbound\.com\/en-us\/news\/announcements\/september-ban-list-updates-effective-september-18-2026/);
  // At least a few of the actual commenters quoted, not a generic "the community says".
  for (const user of ["u/CataChronix", "u/TheSandMan713", "u/Lazarius"]) {
    assert.ok(p.body.includes(user), `expected ${user} to be attributed by name`);
  }
});

test("the reaction post frames meta speculation as community opinion, not a RiftCompare prediction", () => {
  const p = reactionPost();
  assert.match(p.body, /don't publish price or meta predictions dressed up as analysis/i);
});

test("the two 'most recent ban' hub references no longer point to July as though it were current", () => {
  // Found by SLUG, not by its old "## Riftbound rules FAQ" heading. That heading
  // was removed on 2026-09-21 when the article's hand-written FAQ section was
  // folded into its `faq` field — the page had been rendering the same questions
  // twice, once from the markdown and once from components/ArticleFaq.tsx. The
  // questions themselves are all still here, and every assertion below still
  // checks exactly what it always did; only the way the article is located
  // changed, and a slug cannot drift out from under this the way a heading did.
  const hub = ARTICLES.find((a) => a.slug === "riftbound-rules-explained");
  assert.ok(hub, "expected the rules hub article");
  assert.doesNotMatch(hub!.body, /July 2026 ban list update.{0,40}most recent/s);
  assert.match(hub!.body, /riftbound-september-2026-bans-meta-shift/);
  const staleFaq = (hub!.faq ?? []).find((f) => /current banned cards/i.test(f.q));
  assert.ok(staleFaq, "expected the banned-cards FAQ entry");
  assert.doesNotMatch(staleFaq!.a, /July 2026 ban list update covers the most recent/);
});
