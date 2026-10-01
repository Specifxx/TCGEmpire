import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sponsorFor, type NewsletterSponsor } from "../src/lib/newsletter-sponsor";
import { buildDigest, type DigestExtras } from "../src/lib/newsletter";

const sp = (over: Partial<NewsletterSponsor> = {}): NewsletterSponsor => ({
  name: "Acme Sleeves", headline: "Sleeves <b>for</b> chase cards", body: "Matte sleeves & top-loaders.",
  url: "https://acme.example/riftbound", cta: "Shop sleeves", from: "2026-10-01", until: "2026-10-07", ...over,
});

test("sponsorFor picks a booking only inside its dates and markets, https only", () => {
  const d = new Date("2026-10-03T21:00:00Z");
  assert.equal(sponsorFor("US", d, [sp()])?.name, "Acme Sleeves");
  assert.equal(sponsorFor("US", new Date("2026-10-08T21:00:00Z"), [sp()]), null, "after `until`");
  assert.equal(sponsorFor("US", d, [sp({ markets: ["AU"] })]), null, "other market");
  assert.equal(sponsorFor("AU", d, [sp({ markets: ["AU"] })])?.name, "Acme Sleeves");
  assert.equal(sponsorFor("US", d, [sp({ url: "http://acme.example" })]), null, "no plain http");
  assert.equal(sponsorFor("US", d, [sp({ imageUrl: "javascript:alert(1)" })]), null, "no non-https image");
});

const card = (name: string) => ({ id: name, slug: name.toLowerCase(), name, setCode: "OGN", collectorNumber: "001/298" }) as never;
const mover = (name: string, pct: number) => ({ card: card(name), points: [], nowCents: 1000, refCents: 800, pct });
const movers = { spiking: [mover("Jinx", 25)], plummeting: [mover("Ahri", -20)], value: [] };

test("the sponsored slot is labelled, escaped, UTM-tagged and rel=sponsored", () => {
  const d = buildDigest(movers, "US", [], { sponsor: sp() })!;
  assert.match(d.inner, /SPONSORED · Acme Sleeves/);
  assert.match(d.inner, /Sleeves &lt;b&gt;for&lt;\/b&gt; chase cards/, "sponsor text is HTML-escaped");
  assert.match(d.inner, /href="https:\/\/acme\.example\/riftbound\?utm_source=riftcompare&amp;utm_medium=email&amp;utm_campaign=newsletter-sponsor" rel="sponsored"/);
});

test("with no booking the slot is a labelled 'sponsor this newsletter' line, and the account digest has none", () => {
  assert.match(buildDigest(movers, "US", [], { sponsor: "house" })!.inner, /Sponsor this newsletter/);
  const plain = buildDigest(movers, "US", [], {})!.inner;
  assert.doesNotMatch(plain, /SPONSORED/);
  assert.doesNotMatch(readFileSync("src/lib/user-digest.ts", "utf8"), /sponsor:\s*true/, "account digests carry no sponsor");
  assert.match(readFileSync("src/lib/newsletter.ts", "utf8"), /loadDigestExtras\(market, new Date\(\), \{ sponsor: true \}\)/);
});

test("the extra sections render only from the data they are given", () => {
  const extras: DigestExtras = {
    index: { latest: 114.9, d7: 1.2, d30: -3.4 },
    stats: { priced: 1234, liveStores: 42 },
    peaks: [{ card: card("Kai'Sa"), nowCents: 50000, peakCents: 62000, peakDay: "2026-09-12" }],
    popular: [{ ...card("Vi"), lowestPriceCentsUs: 1999, lowestPriceCents: null } as never],
    articles: [{ title: "Radiance guide", excerpt: "All about it", href: "/guides/x", date: "2026-09-30", fresh: true }],
    releases: [{ name: "Radiance", date: "2026-10-23", daysAway: 22, href: "/blog/riftbound-radiance-spoilers" }],
  };
  const inner = buildDigest(movers, "US", [], extras)!.inner;
  for (const s of ["The market at a glance", "114.9", "+1.2%", "1,234 cards with a live price", "42 US stores", "Most valuable cards right now", "peak US$620.00 on 12 Sept 2026", "What collectors are searching for", "from US$19.99", "New on the blog this week", "Radiance guide", "Coming up", "in 22 days"]) {
    assert.ok(inner.includes(s), s);
  }
  const bare = buildDigest(movers, "US", [], {})!.inner;
  for (const s of ["🧭 The market at a glance", "🏆 Most valuable", "🔎 What collectors", "📅 Coming up"]) assert.ok(!bare.includes(s), s);
});

test("a quiet week still sends nothing, extras or not", () => {
  assert.equal(buildDigest({ spiking: [], plummeting: [], value: [] }, "US", [], { sponsor: "house", index: { latest: 100, d7: 0, d30: 0 } }), null);
});
