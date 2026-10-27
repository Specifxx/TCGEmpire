import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { verifyDiscordSignature } from "../src/lib/discord/verify";
import { BOT_GAMES, botGame, ebayLink, parseDeckList, tcgplayerCartLink, tcgplayerSearchLink } from "../src/lib/discord/games";
import { rankRiftbound, type LookupDeps, type RiftboundEntry } from "../src/lib/discord/lookup";
import { AD_LINE, BOT_COMMANDS, handleInteraction } from "../src/lib/discord/bot";
import { discordBot } from "../src/lib/ops/checks";

function keys() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");
  return { raw, privateKey };
}

test("the signature check accepts Discord's signature and nothing else", () => {
  const { raw, privateKey } = keys();
  const body = JSON.stringify({ type: 1 });
  const ts = "1700000000";
  const sig = sign(null, Buffer.from(ts + body), privateKey).toString("hex");
  assert.equal(verifyDiscordSignature(raw, sig, ts, body), true);
  assert.equal(verifyDiscordSignature(raw, sig, ts, body + " "), false);
  assert.equal(verifyDiscordSignature(raw, sig, "1700000001", body), false);
  assert.equal(verifyDiscordSignature(raw, null, ts, body), false);
  assert.equal(verifyDiscordSignature("", sig, ts, body), false);
  assert.equal(verifyDiscordSignature(keys().raw, sig, ts, body), false);
});

const ENTRIES: RiftboundEntry[] = [
  { slug: "jinx-loose-cannon-ogn", name: "Jinx, Loose Cannon", setName: "Origins", collectorNumber: "001", rarity: "Epic", priceCents: 1250 },
  { slug: "jinx-demolitionist-ogn", name: "Jinx, Demolitionist", setName: "Origins", collectorNumber: "002", rarity: "Common", priceCents: 30 },
  { slug: "vi-ogn", name: "Vi", setName: "Origins", collectorNumber: "010", rarity: "Rare", priceCents: 400 },
  { slug: null, name: "Jinx (no page)", setName: "Origins", collectorNumber: "003", rarity: "Rare", priceCents: 9999 },
];

const deps = (over: Partial<LookupDeps> = {}): LookupDeps => ({
  fetch: async () => new Response("{}", { status: 500 }),
  riftbound: async () => ENTRIES,
  ...over,
});

test("Riftbound ranking needs every word, skips cards without a page and prices in the market's currency", () => {
  const hits = rankRiftbound(ENTRIES, "jinx", "AU");
  assert.deepEqual(hits.map((h) => h.path), ["/card/jinx-loose-cannon-ogn", "/card/jinx-demolitionist-ogn"]);
  assert.equal(hits[0].price, "Cheapest in stock: A$12.50");
  assert.deepEqual(rankRiftbound(ENTRIES, "jinx vi", "US"), []);
});

test("every reply with paid links opens with the #ad disclosure, and every button fits Discord's limit", async () => {
  const r = (await handleInteraction(
    { type: 2, data: { name: "price", options: [{ name: "game", value: "riftbound" }, { name: "card", value: "jinx" }, { name: "market", value: "UK" }] } },
    deps(),
  )) as { type: number; data: { content: string; embeds: unknown[]; components: { components: { url: string }[] }[] } };
  assert.equal(r.type, 4);
  assert.ok(r.data.content.startsWith(AD_LINE));
  assert.ok(AD_LINE.includes("#ad"));
  assert.equal(r.data.embeds.length, 2);
  const urls = r.data.components[0].components.map((b) => b.url);
  assert.equal(urls.length, 3);
  assert.ok(urls.every((u) => u.length <= 512));
  assert.match(urls[0], /^https:\/\/riftcompare\.com\/card\/jinx-loose-cannon-ogn\?utm_source=discord/);
  assert.match(urls[1], /ebay\.co\.uk/);
  assert.match(urls[2], /^https:\/\/partner\.tcgplayer\.com\//);
});

test("a game with no search, or a search that fails, still answers with search links", async () => {
  const r = (await handleInteraction(
    { type: 2, data: { name: "price", options: [{ name: "game", value: "onepiece" }, { name: "card", value: "luffy" }] } },
    deps(),
  )) as { data: { content: string; components: { components: { url: string }[] }[] } };
  assert.ok(r.data.content.startsWith(AD_LINE));
  assert.match(r.data.content, /No One Piece match/);
  assert.equal(r.data.components[0].components.length, 3);
});

test("One Piece and engine hits come from the sister site's public search", async () => {
  const seen: string[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    seen.push(`${url} ${JSON.stringify(init?.headers ?? {})}`);
    const hits = url.includes("opcompare")
      ? [{ kind: "card", slug: "op05-119-luffy", name: "Monkey.D.Luffy", number: "OP05-119", variant: "Alt Art", set: "OP05", img: "https://img.example/1.jpg", price: "A$80.00", priceKind: "store" }]
      : [{ slug: "char-aznable", name: "Char Aznable", set: "Newtype Rising", price: "$4.00", number: "ST01-001", rarity: "R" }];
    return new Response(JSON.stringify({ hits }), { status: 200 });
  };
  const op = (await handleInteraction(
    { type: 2, data: { name: "price", options: [{ name: "game", value: "onepiece" }, { name: "card", value: "luffy" }, { name: "market", value: "AU" }] } },
    deps({ fetch }),
  )) as { data: { embeds: { url: string; description: string }[] } };
  assert.match(op.data.embeds[0].url, /^https:\/\/opcompare\.app\/card\/op05-119-luffy/);
  assert.match(op.data.embeds[0].description, /Cheapest in stock: A\$80\.00/);
  assert.match(seen[0], /country=AU/);
  const g = (await handleInteraction(
    { type: 2, data: { name: "price", options: [{ name: "game", value: "gundam" }, { name: "card", value: "char" }, { name: "market", value: "AU" }] } },
    deps({ fetch }),
  )) as { data: { embeds: { description: string; footer?: { text: string } }[] } };
  assert.match(g.data.embeds[0].description, /TCGplayer market: \$4\.00/);
  assert.match(g.data.embeds[0].footer!.text, /prices the US only/);
});

test("deck lists parse the common export formats", () => {
  const lines = parseDeckList("Main Deck:\n4 Monkey.D.Luffy\n4x Nami\nZoro x3\n// side\n1 Sol Ring (CMR) 263\n- 2 Nami\n\nLone Card");
  assert.deepEqual(lines, [
    { qty: 4, name: "Monkey.D.Luffy" },
    { qty: 6, name: "Nami" },
    { qty: 3, name: "Zoro" },
    { qty: 1, name: "Sol Ring" },
    { qty: 1, name: "Lone Card" },
  ]);
});

test("/deck opens a box, and its answer is a TCGplayer Mass Entry cart through Impact", async () => {
  const modal = (await handleInteraction({ type: 2, data: { name: "deck", options: [{ name: "game", value: "lorcana" }, { name: "market", value: "UK" }] } }, deps())) as {
    type: number;
    data: { custom_id: string; title: string };
  };
  assert.equal(modal.type, 9);
  assert.equal(modal.data.custom_id, "deck:lorcana:US");
  assert.ok(modal.data.title.length <= 45);
  const r = (await handleInteraction(
    { type: 5, data: { custom_id: "deck:lorcana:US", components: [{ components: [{ custom_id: "list", value: "4 Elsa - Snow Queen\n2 Stitch" }] }] } },
    deps(),
  )) as { data: { content: string; embeds: { title: string; description: string }[] } };
  assert.ok(r.data.content.startsWith(AD_LINE));
  assert.equal(r.data.embeds[0].title, "Lorcana deck: 6 cards, 2 different");
  const cart = tcgplayerCartLink(botGame("lorcana"), parseDeckList("4 Elsa\n2 Stitch"));
  const inner = new URL(decodeURIComponent(new URL(cart).searchParams.get("u")!));
  assert.equal(inner.origin + inner.pathname, "https://www.tcgplayer.com/massentry");
  assert.equal(inner.searchParams.get("c"), "4 Elsa||2 Stitch");
  assert.equal(new URL(cart).searchParams.get("sharedid"), "discord-lorcana-deck");
});

test("affiliate links carry our tags and the game's name", () => {
  const e = new URL(ebayLink(botGame("onepiece"), "US", "Monkey.D.Luffy"));
  assert.equal(e.searchParams.get("campid"), "5339155912");
  assert.equal(e.searchParams.get("_nkw"), "One Piece TCG Monkey.D.Luffy");
  assert.match(e.searchParams.get("customid") ?? "", /discord-onepiece-price/);
  assert.match(tcgplayerSearchLink(botGame("yugioh"), "Dark Magician"), /sharedid=discord-yugioh-price/);
});

test("the commands Discord receives are valid: every game is a choice, descriptions fit", () => {
  for (const c of BOT_COMMANDS) {
    assert.match(c.name, /^[a-z]{1,32}$/);
    assert.ok(c.description.length <= 100);
    for (const o of ("options" in c ? c.options : []) as { description: string; choices?: unknown[] }[]) assert.ok(o.description.length <= 100);
  }
  const game = ((BOT_COMMANDS[0] as { options: unknown }).options as { name: string; choices: { value: string }[] }[]).find((o) => o.name === "game")!;
  assert.deepEqual(game.choices.map((c) => c.value), BOT_GAMES.map((g) => g.key));
});

test("PING gets PONG", async () => {
  assert.deepEqual(await handleInteraction({ type: 1 }, deps()), { type: 1 });
});

test("the ops check passes only when an unsigned request is refused with 401", async () => {
  const mk = (status: number, configured = true) =>
    ({
      now: new Date("2026-10-27T00:00:00Z"),
      sleep: async () => {},
      fetch: async (_u: string, init?: RequestInit) =>
        init?.method === "POST" ? new Response("x", { status }) : new Response(JSON.stringify({ ok: true, configured }), { status: 200 }),
    }) as unknown as Parameters<typeof discordBot>[0];
  assert.equal((await discordBot(mk(401))).severity, "ok");
  assert.equal((await discordBot(mk(200))).severity, "warn");
  assert.equal((await discordBot(mk(401, false))).severity, "unknown");
});

test("deck pages and the deck builder offer the whole list as one TCGplayer cart", async () => {
  const { tcgplayerMassEntryUrl } = await import("../src/lib/tcgplayer-cart");
  const u = new URL(tcgplayerMassEntryUrl("Lorcana TCG", [{ qty: 4, name: " Elsa " }, { qty: 0, name: "Gone" }, { qty: 2, name: "Stitch" }]));
  assert.equal(u.searchParams.get("productline"), "Lorcana TCG");
  assert.equal(u.searchParams.get("c"), "4 Elsa||2 Stitch");
  const { readFileSync } = await import("node:fs");
  for (const f of ["src/components/decks/PublishedDeckView.tsx", "src/components/DeckBuilder.tsx"]) {
    const src = readFileSync(f, "utf8");
    assert.match(src, /surface="deck_cart"/, f);
    assert.match(src, /Buy all on TCGplayer/, f);
  }
  assert.match(readFileSync("src/app/decks/[slug]/page.tsx", "utf8"), /tcgplayerCartHref=\{affiliateUrl\(tcgplayerMassEntryUrl\(/);
});
