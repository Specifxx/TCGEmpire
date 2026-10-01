import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  COMMANDS,
  EMBED_LIMITS,
  EPHEMERAL,
  MAX_CHOICES,
  MAX_CHOICE_NAME,
  PERPACK_ROWS,
  autocompleteProducts,
  autocompleteSets,
  fallbackReply,
  interactionContext,
  parseMarket,
  parsePerPackKind,
  perPackReply,
  resolveProduct,
  resolveSet,
  sealedReply,
  setReply,
  verifyDiscordRequest,
  type DiscordReply,
} from "../src/lib/pokemon/discord";
import { textViolations } from "./helpers/pokemon-copy";
import type { PkCatalog, PkOfferRow, PkProductDetail, PkTile } from "../src/lib/pokemon/types";

// The Pokémon Discord app (lib/pokemon/discord.ts, app/api/pokemon/discord).
// Its whole point is to carry our figures into communities that ban links, so
// what a reply may carry is pinned here: exactly one link (ours, utm-tagged),
// no affiliate or marketplace URL, no mentions, the site's honesty rules, and
// Discord's own embed limits. Against the P0 fixtures (a trimmed real US
// catalogue and the 30th Celebration ETB), with other markets derived below.

const catalog = JSON.parse(readFileSync("tests/fixtures/pokemon-catalog-us.json", "utf8")) as PkCatalog;
const product = JSON.parse(readFileSync("tests/fixtures/pokemon-product-etb.json", "utf8")) as PkProductDetail;
// Six hours after the fixture's import: every row is fresh.
const NOW = Date.parse("2026-10-01T18:00:00Z");

// ── Signatures ───────────────────────────────────────────────────────────────

function keypair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  // The last 32 bytes of the SPKI DER are the raw key, which is what Discord shows.
  const raw = (publicKey.export({ format: "der", type: "spki" }) as Buffer).subarray(-32).toString("hex");
  const signBody = (ts: string, body: string) => sign(null, Buffer.from(ts + body), privateKey).toString("hex");
  return { raw, signBody };
}

test("verifyDiscordRequest: a real signature verifies; tampering, a wrong timestamp and malformed input fail", () => {
  const { raw, signBody } = keypair();
  const body = JSON.stringify({ type: 1 });
  const ts = "1759320000";
  const sig = signBody(ts, body);
  assert.equal(verifyDiscordRequest(body, sig, ts, raw), true);
  assert.equal(verifyDiscordRequest(body, sig.toUpperCase(), ts, raw.toUpperCase()), true, "hex is case-insensitive");
  assert.equal(verifyDiscordRequest(JSON.stringify({ type: 2 }), sig, ts, raw), false, "tampered body");
  assert.equal(verifyDiscordRequest(body, sig, "1759320001", raw), false, "wrong timestamp");
  assert.equal(verifyDiscordRequest(body, sig, "", raw), false, "no timestamp");
  assert.equal(verifyDiscordRequest(body, `zz${sig.slice(2)}`, ts, raw), false, "bad hex signature");
  assert.equal(verifyDiscordRequest(body, sig.slice(0, 126), ts, raw), false, "short signature");
  assert.equal(verifyDiscordRequest(body, "", ts, raw), false, "no signature");
  assert.equal(verifyDiscordRequest(body, sig, ts, raw.slice(0, 62)), false, "short key");
  assert.equal(verifyDiscordRequest(body, sig, ts, `${raw.slice(0, 62)}zz`), false, "bad hex key");
  assert.equal(verifyDiscordRequest(body, sig, ts, ""), false, "no key");
  assert.equal(verifyDiscordRequest(body, sig, ts, keypair().raw), false, "someone else's key");
});

// ── Commands ─────────────────────────────────────────────────────────────────

test("COMMANDS: user and server installs, every context, market and kind choices, Discord's name limits", () => {
  assert.deepEqual(
    COMMANDS.map((c) => c.name),
    ["sealed", "perpack", "set"],
  );
  for (const c of COMMANDS) {
    assert.deepEqual(c.integration_types, [0, 1], `${c.name}: server and user install`);
    assert.deepEqual(c.contexts, [0, 1, 2], `${c.name}: servers, the app's DM, other DMs`);
    assert.match(c.name, /^[-_a-z0-9]{1,32}$/);
    assert.ok(c.description.length >= 1 && c.description.length <= 100, c.name);
    const market = c.options.find((o) => o.name === "market") as { required?: boolean; choices?: { value: string }[] } | undefined;
    assert.ok(market && market.required === false, `${c.name} takes an optional market`);
    assert.deepEqual(
      market.choices?.map((x) => x.value),
      ["US", "UK", "EU", "AU", "CA", "SG"],
    );
    for (const o of c.options) {
      assert.match(o.name, /^[-_a-z0-9]{1,32}$/);
      assert.ok(o.description.length <= 100);
      for (const ch of ("choices" in o ? o.choices : undefined) ?? []) assert.ok(ch.name.length <= 100);
    }
  }
  const byName = Object.fromEntries(COMMANDS.map((c) => [c.name, c]));
  assert.equal(byName.sealed.options[0].name, "product");
  assert.equal((byName.sealed.options[0] as { autocomplete?: boolean }).autocomplete, true);
  assert.equal(byName.set.options[0].name, "name");
  assert.equal((byName.set.options[0] as { autocomplete?: boolean }).autocomplete, true);
  const kind = byName.perpack.options[0] as { name: string; choices: { value: string }[] };
  assert.equal(kind.name, "kind");
  assert.deepEqual(
    kind.choices.map((x) => x.value),
    ["booster-box", "etb", "booster-bundle"],
  );
  assert.equal(parseMarket("UK"), "UK");
  assert.equal(parseMarket("NZ"), "US");
  assert.equal(parseMarket(null), "US");
  assert.equal(parsePerPackKind("etb"), "etb");
  assert.equal(parsePerPackKind("tin"), null);
  assert.equal(parsePerPackKind("__proto__"), null);
  assert.equal(interactionContext({ type: 2, context: 0 }), "server");
  assert.equal(interactionContext({ type: 2, context: 2 }), "dm-or-group");
  assert.equal(interactionContext({ type: 2 }), "unknown");
});

// ── Autocomplete and resolution ──────────────────────────────────────────────

test("autocomplete: at most 25 choices, names at most 100 characters, every value a real slug", () => {
  const slugs = new Set(catalog.tiles.map((t) => t.slug));
  const setSlugs = new Set(catalog.sets.map((s) => s.slug));
  const long: PkTile = { ...catalog.tiles[0], slug: "very-long", name: `Elite Trainer Box ${"x".repeat(150)}` };
  const wide = { tiles: [...catalog.tiles, long] };
  for (const q of ["", "etb", "booster box", "30th", "elite trainer", "zzzz nothing"]) {
    const choices = autocompleteProducts(wide, q);
    assert.ok(choices.length <= MAX_CHOICES, q);
    for (const c of choices) {
      assert.ok(c.name.length >= 1 && c.name.length <= MAX_CHOICE_NAME, `${q}: ${c.name.length}`);
      assert.ok(slugs.has(c.value) || c.value === "very-long", c.value);
    }
  }
  assert.equal(autocompleteProducts(wide, "").length, MAX_CHOICES, "an empty box still suggests");
  assert.deepEqual(autocompleteProducts(wide, "zzzz nothing"), []);
  assert.ok(autocompleteProducts(wide, "Elite Trainer x").some((c) => c.value === "very-long" && c.name.endsWith("…")));
  const etb = autocompleteProducts(catalog, "30th etb");
  assert.ok(etb.some((c) => c.value === "30th-celebration-elite-trainer-box"), "the alias 'etb' finds Elite Trainer Boxes");
  for (const q of ["", "delta", "ME", "zzzz"]) {
    const choices = autocompleteSets(catalog, q);
    assert.ok(choices.length <= MAX_CHOICES);
    for (const c of choices) assert.ok(setSlugs.has(c.value) && c.name.length <= MAX_CHOICE_NAME);
  }
  assert.equal(autocompleteSets(catalog, "delta")[0]?.value, "delta-reign");
});

test("resolveProduct / resolveSet: slug, then name, then the closest match; null for invented strings", () => {
  assert.equal(resolveProduct(catalog, "30th-celebration-elite-trainer-box")?.slug, "30th-celebration-elite-trainer-box");
  assert.equal(resolveProduct(catalog, "30th Celebration Elite Trainer Box")?.slug, "30th-celebration-elite-trainer-box");
  const box = resolveProduct(catalog, "perfect order booster box");
  assert.equal(box?.kind, "booster-box");
  assert.ok(box && !/half/i.test(box.name), "the box before the half box");
  for (const invented of ["zzzz not a product", "Pikachu's Secret Vault 9000", "x", "", "   ", "'; drop table", "../../etc/passwd"]) {
    assert.equal(resolveProduct(catalog, invented), null, invented);
  }
  assert.equal(resolveProduct(catalog, null), null);
  assert.equal(resolveSet(catalog, "delta-reign")?.slug, "delta-reign");
  assert.equal(resolveSet(catalog, "Delta Reign")?.slug, "delta-reign");
  assert.equal(resolveSet(catalog, "DLR")?.slug, "delta-reign", "by set code");
  assert.equal(resolveSet(catalog, "zzzz invented set"), null);
  assert.equal(resolveSet(catalog, ""), null);
});

// ── Replies ──────────────────────────────────────────────────────────────────

const ebayRow = (o: Partial<PkOfferRow>): PkOfferRow => ({
  market: "US",
  source: "ebay",
  priceCents: 0,
  currency: "USD",
  shippingCents: 499,
  url: "https://www.ebay.com/itm/1?campid=5339155912",
  title: "listing",
  inStock: true,
  checkedAt: "2026-10-01T09:00:00.000Z",
  ...o,
});

// Variants of the fixture: an eBay listing between TCGplayer's and a dearer
// one, so "cheapest first, eBay in its price position" can be seen; and the UK
// with an eBay UK row (the fixture has no UK listing).
const withEbay: PkProductDetail = {
  ...product,
  offers: [...product.offers, ebayRow({ priceCents: 10999 }), ebayRow({ market: "UK", currency: "GBP", priceCents: 8999, shippingCents: 0, url: "https://www.ebay.co.uk/itm/2" })],
};

// Singapore: no listing anywhere, TCGplayer's market price converted (lib/fx.ts's SGD default).
const sgCatalog: PkCatalog = {
  ...catalog,
  market: "SG",
  currency: "SGD",
  tiles: catalog.tiles.map((t) => ({
    ...t,
    lowCents: null,
    lowSource: null,
    perPackCents: null,
    openCount: 0,
    refCents: t.refCents == null ? null : Math.round(t.refCents * 1.35),
  })),
};

function allReplies(): { label: string; reply: DiscordReply }[] {
  const sg = sgCatalog;
  return [
    { label: "sealed US", reply: sealedReply(withEbay, "US", NOW) },
    { label: "sealed UK", reply: sealedReply(withEbay, "UK", NOW) },
    { label: "sealed EU", reply: sealedReply(withEbay, "EU", NOW) },
    { label: "sealed SG", reply: sealedReply(product, "SG", NOW) },
    { label: "sealed no listing", reply: sealedReply({ ...product, offers: product.offers.filter((o) => o.source !== "tcgplayer") }, "US", NOW) },
    { label: "sealed presale", reply: sealedReply({ ...product, presale: true, releasedOn: "2026-11-06" }, "US", NOW) },
    { label: "perpack box", reply: perPackReply(catalog, "booster-box") },
    { label: "perpack etb", reply: perPackReply(catalog, "etb") },
    { label: "perpack bundle", reply: perPackReply(catalog, "booster-bundle") },
    { label: "perpack SG", reply: perPackReply(sg, "booster-box") },
    { label: "set released", reply: setReply(catalog, "perfect-order") },
    { label: "set pre-order", reply: setReply(catalog, "delta-reign") },
    { label: "set SG", reply: setReply(sg, "perfect-order") },
  ];
}

const desc = (r: DiscordReply) => r.data.embeds?.[0]?.description ?? "";

test("sealed: listings cheapest first with eBay in its price position, references below, ≈ when converted", () => {
  const us = desc(sealedReply(withEbay, "US", NOW));
  const tcg = us.indexOf("**US$115.00** · TCGplayer");
  const ebay = us.indexOf("**US$109.99** · eBay · + US$4.99 postage");
  assert.ok(ebay >= 0 && tcg > ebay, "the cheaper eBay listing comes first, in eBay's own price position");
  assert.match(us, /US\$12\.\d\d a pack at the cheapest listing \(9 packs\)/);
  assert.ok(us.indexOf("Reference prices") > tcg, "references sit below the listings");
  assert.match(us, /TCGplayer market price: US\$162\.45/);
  assert.doesNotMatch(us, /≈/, "nothing is converted in the US");
  assert.match(us, /Release: TCGplayer lists 16 Sep 2026/);

  const uk = desc(sealedReply(withEbay, "UK", NOW));
  assert.match(uk, /Cheapest listings in the United Kingdom/);
  assert.match(uk, /\*\*£89\.99\*\* · eBay UK · free postage/);
  assert.match(uk, /TCGplayer market price: ≈ £[\d.,]+ \(converted\)/);
  assert.match(uk, /Cardmarket trend price: ≈ £[\d.,]+ \(converted\)/);
  assert.match(desc(sealedReply(withEbay, "EU", NOW)), /\*\*€85\.00\*\* · Cardmarket/);

  const sg = desc(sealedReply(product, "SG", NOW));
  assert.match(sg, /No tracked listings in Singapore\./);
  assert.doesNotMatch(sg, /^\d+\. /m, "no listing row in Singapore");
  assert.match(sg, /TCGplayer market price: ≈ S\$/, "the reference only");

  assert.match(desc(sealedReply({ ...product, presale: true, releasedOn: "2026-11-06" }, "US", NOW)), /Pre-order: TCGplayer lists 6 Nov 2026/);
});

test("perpack and set: ranked lowest per pack first; pre-orders said as such; SG claims no listing", () => {
  const box = desc(perPackReply(catalog, "booster-box"));
  const figures = [...box.matchAll(/^\d+\. \*\*US\$([\d,.]+) a pack\*\*/gm)].map((m) => Number(m[1].replace(/,/g, "")));
  assert.ok(figures.length > 0 && figures.length <= PERPACK_ROWS);
  for (let i = 1; i < figures.length; i++) assert.ok(figures[i - 1] <= figures[i], "lowest per pack first");
  assert.match(box, /Pre-orders are left out/);
  assert.match(desc(perPackReply(catalog, "etb")), /Elite Trainer Box/);

  assert.match(desc(perPackReply(sgCatalog, "booster-box")), /No tracked listings in Singapore/);
  const sgSet = desc(setReply(sgCatalog, "perfect-order"));
  assert.match(sgSet, /No tracked listings in Singapore\./);
  assert.match(sgSet, /≈ S\$/);

  const released = desc(setReply(catalog, "perfect-order"));
  assert.match(released, /Booster Box: \*\*US\$/);
  assert.match(released, /Release: TCGplayer lists /);
  const pre = desc(setReply(catalog, "delta-reign"));
  assert.match(pre, /Pre-orders open: TCGplayer lists 6 Nov 2026/);
  assert.match(pre, /· pre-order/);
  assert.match(pre, /Booster Box: \*\*US\$[\d,.]+\*\* · TCGplayer · pre-order · US\$[\d.]+ a pack/, "a pre-order is said as such");

  const missing = setReply(catalog, "no-such-set");
  assert.equal(missing.data.flags, EPHEMERAL);
  assert.equal(missing.data.embeds, undefined);
});

test("every reply: one link (ours, utm-tagged) in embed.url, no marketplace host, no mentions, embed limits, honest copy", () => {
  for (const { label, reply } of allReplies()) {
    const json = JSON.stringify(reply);
    assert.equal(reply.type, 4, label);
    assert.deepEqual(reply.data.allowed_mentions, { parse: [] }, `${label}: never pings anyone`);
    const embed = reply.data.embeds?.[0];
    assert.ok(embed, `${label}: an embed`);
    assert.equal(reply.data.embeds?.length, 1);

    const urls = json.match(/https?:\/\/[^\s"\\)]+/g) ?? [];
    assert.deepEqual(urls, [embed.url], `${label}: exactly one URL, the embed's`);
    const u = new URL(embed.url);
    assert.equal(u.origin, "https://riftcompare.com");
    assert.equal(u.searchParams.get("utm_source"), "discord-bot");
    assert.equal(u.searchParams.get("utm_medium"), "bot");
    assert.match(u.searchParams.get("utm_campaign") ?? "", /^pkmn-(sealed|perpack|set)$/);
    assert.ok(!("thumbnail" in embed) && !("image" in embed), `${label}: no image (its URL would be a marketplace host)`);

    // Lowercase on purpose: these are hosts and tracking parameters. The
    // capitalised source NAME (TCGplayer, eBay, Cardmarket) must appear: a
    // listing always says where it is.
    for (const host of ["ebay.", "tcgplayer.com", "pxf.io", "cardmarket", "campid", "partner."]) {
      assert.ok(!json.includes(host), `${label}: "${host}" in the payload`);
    }

    assert.ok(embed.title.length <= EMBED_LIMITS.title, label);
    assert.ok(embed.description.length <= EMBED_LIMITS.description, label);
    assert.ok(embed.footer.text.length <= EMBED_LIMITS.footer, label);
    assert.ok(!("fields" in embed) || (embed as { fields: unknown[] }).fields.length <= EMBED_LIMITS.fields);
    assert.ok(json.length < 6000, `${label}: under Discord's 6,000-character embed total`);

    assert.match(embed.footer.text, /^Item price, postage extra · updated daily · as of \d{1,2} [A-Z][a-z]{2} \d{4}$/, label);
    assert.deepEqual(textViolations(`${embed.title}\n${embed.description}\n${embed.footer.text}`), [], label);
    assert.doesNotMatch(json, /\bNaN\b|\bundefined\b|\bnull\b|\btoday\b/i, label);
    assert.doesNotMatch(embed.description, /\b(?:sales?|sold for)\b/i, `${label}: listings, never sales`);
  }
});

test("fallbackReply: ephemeral, no embed, no link, no mentions", () => {
  for (const reason of ["not found", "timeout", "error", "unknown"] as const) {
    const r = fallbackReply(reason);
    assert.equal(r.type, 4);
    assert.equal(r.data.flags, EPHEMERAL);
    assert.deepEqual(r.data.allowed_mentions, { parse: [] });
    assert.equal(r.data.embeds, undefined);
    assert.ok(r.data.content && r.data.content.length <= 2000);
    assert.doesNotMatch(JSON.stringify(r), /https?:\/\//);
    assert.deepEqual(textViolations(r.data.content ?? ""), []);
  }
});

// ── The route ────────────────────────────────────────────────────────────────

// Read as text: importing the route loads lib/pokemon/data.ts, whose React
// cache() exists only under Next's react-server build. Its live behaviour (404
// when off, 401 when tampered, PONG, the not-found fallback with no product
// read) is checked against a dev server, signing with a keypair made as
// keypair() above makes one and POKEMON_DISCORD_PUBLIC_KEY set to its raw hex.
const routeSrc = readFileSync("src/app/api/pokemon/discord/route.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("route: POST only, nodejs, force-dynamic; gate, then signature, then parse, then data", () => {
  assert.deepEqual([...routeSrc.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]).sort(), ["POST", "dynamic", "runtime"]);
  assert.match(routeSrc, /export const runtime = "nodejs";/);
  assert.match(routeSrc, /export const dynamic = "force-dynamic";/);
  const post = routeSrc.slice(routeSrc.indexOf("export async function POST"));
  const at = (re: RegExp) => post.search(re);
  assert.ok(at(/if \(!pokemonEnabled\(\) \|\| !publicKey\) return NextResponse\.json\(\{ error: "Not found" \}, \{ status: 404 \}\)/) >= 0);
  assert.ok(at(/!pokemonEnabled\(\)/) < at(/req\.text\(\)/), "the gate comes before the body is read");
  assert.ok(at(/verifyDiscordRequest\(/) < at(/JSON\.parse\(/), "no parse before verification");
  assert.ok(at(/JSON\.parse\(/) < at(/getPokemonCatalog\(/), "no data read before verification");
  // A typed value only ever reaches getPokemonProduct as a slug the catalogue resolved.
  assert.deepEqual(routeSrc.match(/getPokemonProduct\([^)]*\)/g), ["getPokemonProduct(tile.slug)"]);
  assert.match(routeSrc, /const tile = resolveProduct\(/);
  assert.match(routeSrc, /DEADLINE_MS = 2500/);
  // The log line the privacy notice on /pokemon/discord describes, and nothing more.
  assert.match(routeSrc, /console\.info\("\[pokemon-discord\]", \{ command, market, context: interactionContext\(interaction\) \}\);/);
  assert.doesNotMatch(routeSrc, /\b(?:guild_id|channel_id|member|user)\b/, "no ids are read");
});
