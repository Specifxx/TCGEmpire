// Build a ready-to-post social pack from today's committed price data:
//   node social/make.mjs movers              this week's biggest risers and drops
//   node social/make.mjs top RAD             a set's 10 most expensive cards
//   node social/make.mjs boxes RAD           cheapest booster box in each market
// Options: --out <dir> (default social/out/<day>-<pack>), --remote-art (allow
// card art from the image CDN when the site has no local copy; needs network).
// Writes video.html (1080x1920, for TikTok, Reels and Shorts), slides.html
// (1080x1350 Instagram carousel), the captions and CHECK.md. Then:
//   node social/render-reel.mjs <dir>     → video.mp4 + cover.jpg
//   node social/render-slides.mjs <dir>   → s1.png, s2.png…
// or `bash social/build.sh <pack> [SET]` for all of it. Rules: social/README.md.
import fs from "node:fs";
import path from "node:path";
import { movers, setTop, cheapestBoxes, cardArt, cardLabel, money, pct, prettyDay, shiftDay, SETS, ROOT } from "./lib/data.mjs";
import { videoHtml } from "./lib/video.mjs";
import { slidesHtml } from "./lib/slides.mjs";
import { artSrc, esc } from "./lib/style.mjs";

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
const [pack, setArg] = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--out");
const remoteArt = flag("--remote-art");
const SITE = "https://riftcompare.com";
const DISCLAIMER = "RiftCompare is fan-made and isn't endorsed by Riot Games.";
const utm = (p, src, campaign) => `${SITE}${p}?utm_source=${src}&utm_medium=social&utm_campaign=${campaign}`;
const year = (day) => day.slice(0, 4);

const meta = (c) => {
  const l = cardLabel(c);
  return [l.set, l.number, ...l.tags].filter(Boolean).join(" · ");
};

function build() {
  if (pack === "movers") return buildMovers();
  if (pack === "top") return buildTop((setArg ?? "").toUpperCase());
  if (pack === "boxes") return buildBoxes((setArg ?? "").toUpperCase());
  console.error("usage: node social/make.mjs movers | top <SET> | boxes <SET>   (sets: " + Object.keys(SETS).join(", ") + ")");
  process.exit(2);
}

function buildMovers() {
  const m = movers({ limit: 5, remoteArt });
  if (m.up.length < 3 || m.down.length < 3) throw new Error(`not enough movers with art (${m.up.length} up, ${m.down.length} down)`);
  const range = `${prettyDay(m.weekAgo)} – ${prettyDay(m.today)} ${year(m.today)}`.toUpperCase();
  const legal = `Price: the cheapest in-stock listing across our AU, US, UK and SG stores each day, in US$, before postage (${prettyDay(m.weekAgo)} vs ${prettyDay(m.today)}). ${DISCLAIMER} Riftbound and its card art © Riot Games.`;
  const value = (x) => `<span class="was">${money(x.wasCents)}</span><span class="v">${money(x.nowCents)}</span>`;
  const card = (x, tone) => ({ kind: "card", badge: pct(x.pct), badgeTone: tone, art: artSrc(cardArt(x.card)), landscape: x.card.orientation === "landscape", name: x.card.name, meta: meta(x.card), value: value(x), len: 2.2 });
  const scenes = [
    { kind: "hook", kicker: "RIFTBOUND · THIS WEEK", title: "BIGGEST", titleSize: 200, title2: "PRICE MOVES", title2Size: 128, ribbon: range, line: "5 up, 5 down. Cheapest listing, in US$." },
    ...m.up.map((x) => card(x, "up")),
    { kind: "bridge", text: "And the<br>biggest drops", len: 1.2 },
    ...m.down.map((x) => card(x, "down")),
  ];
  const cta = `Every Riftbound card.<br>Every store. <span style="color: var(--rc-green)">One search.</span>`;
  const items = [...m.up, ...m.down].map((x) => ({ art: artSrc(cardArt(x.card)), rank: pct(x.pct), name: x.card.name, meta: meta(x.card), value: `${money(x.nowCents)}<small>was ${money(x.wasCents)}</small>`, down: x.pct < 0 }));
  const line = (x) => `${pct(x.pct)} ${x.card.name} (${cardLabel(x.card).number}) · ${money(x.wasCents)} → ${money(x.nowCents)}`;
  const list = `📈 Up\n${m.up.map(line).join("\n")}\n\n📉 Down\n${m.down.map(line).join("\n")}`;
  const basis = `Cheapest in-stock listing across our AU, US, UK and SG stores, in US$, before postage, ${prettyDay(m.weekAgo)} vs ${prettyDay(m.today)}.`;
  return {
    name: `${m.today}-movers`, day: m.today, accent: "#34d17e",
    video: videoHtml({ accent: "#34d17e", scenes, cta, legal }),
    slides: slidesHtml({ accent: "#34d17e", cover: { kicker: "RIFTBOUND · THIS WEEK", title: "PRICE", title2: "MOVERS", ribbon: range, fan: m.up.slice(0, 3).map((x) => artSrc(cardArt(x.card))) }, items, pageTitle: "This week's movers", cta, legal }),
    captions: {
      tiktok: `Biggest Riftbound price moves this week 👀 ${m.up[0].card.name} ${pct(m.up[0].pct)}, ${m.down[0].card.name} ${pct(m.down[0].pct)}\n\nEvery card, every store, one search: riftcompare.com (link in bio)\n\n#riftbound #riftboundtcg #leagueoflegends #tcg #tcgcommunity`,
      instagram: `Riftbound price movers, ${prettyDay(m.weekAgo)} – ${prettyDay(m.today)} 📊\n\n${list}\n\n${basis} A week is short: a move can be one store selling out.\n\nTrack any card across 230+ stores in AU, US, UK, EU, CA and SG 👉 riftcompare.com/movers (link in bio)\n\nWhich one surprised you? 👇\n\n${DISCLAIMER}\n\n#Riftbound #RiftboundTCG #LeagueOfLegends #TCG #TCGCommunity`,
      youtubeTitle: `Riftbound's biggest price moves this week (${prettyDay(m.today)}) #riftbound #shorts`,
      youtube: `The 5 biggest risers and 5 biggest drops in Riftbound card prices this week.\n\n${list}\n\n${basis}\n\nEvery card, every store: ${utm("/movers", "youtube", `movers-${m.today}`)}\n\n${DISCLAIMER}\n\n#riftbound #riftboundtcg #leagueoflegends`,
    },
    check: [...m.up, ...m.down].map((x) => `- ${line(x)}: ${SITE}/card/${x.card.slug}`),
    links: { page: "/movers" },
  };
}

function buildTop(code) {
  const set = SETS[code];
  if (!set) throw new Error(`unknown set ${code}`);
  const r = setTop(code, { limit: 10, remoteArt });
  if (r.top.length < 5) throw new Error(`${set.name}: only ${r.top.length} priced cards with art (${r.noArt.length} skipped for no local art; try --remote-art)`);
  const n = r.top.length;
  const day = `${prettyDay(r.today)} ${year(r.today)}`.toUpperCase();
  const legal = `Price: the cheapest in-stock listing across our AU, US, UK and SG stores on ${prettyDay(r.today)} ${year(r.today)}, in US$, before postage. ${DISCLAIMER} Riftbound and its card art © Riot Games.`;
  const ranked = r.top.map((x, i) => ({ ...x, rank: i + 1 }));
  const scenes = [
    { kind: "hook", kicker: `RIFTBOUND · ${set.name.toUpperCase()}`, title: `TOP ${n}`, titleSize: 260, title2: "Most expensive", title2Size: 96, title2Top: 890, ribbon: day, line: "Cheapest listing for each, today." },
    ...[...ranked].reverse().map((x) => ({
      kind: "card", badge: `#${x.rank}`, badgeTone: "rank", art: artSrc(cardArt(x.card)), landscape: x.card.orientation === "landscape",
      name: x.card.name, meta: meta(x.card), value: `<span class="from">from</span><span class="v">${money(x.nowCents)}</span>`, len: x.rank === 1 ? 3 : 2.1,
    })),
  ];
  const cta = `Every ${esc(set.name)} card.<br>Every store. <span style="color: var(--rc-green)">One search.</span>`;
  const line = (x) => `${x.rank}. ${x.card.name} ${cardLabel(x.card).number}${cardLabel(x.card).tags.length ? ` (${cardLabel(x.card).tags.join(", ")})` : ""} · ${money(x.nowCents)}`;
  const list = ranked.map(line).join("\n");
  const basis = `Cheapest in-stock listing on ${prettyDay(r.today)} across our AU, US, UK and SG stores, in US$, before postage.`;
  const tag = set.name.replace(/\W/g, "");
  return {
    name: `${r.today}-top-${code.toLowerCase()}`, day: r.today, accent: "#ffb02e",
    video: videoHtml({ accent: "#ffb02e", scenes, cta, legal }),
    slides: slidesHtml({ accent: "#ffb02e", cover: { kicker: `RIFTBOUND · ${set.name.toUpperCase()}`, title: `TOP ${n}`, titleSize: 200, title2: "Most expensive", title2Size: 84, title2Top: 480, ribbon: day, fan: ranked.slice(0, 3).map((x) => artSrc(cardArt(x.card))) }, items: ranked.map((x) => ({ art: artSrc(cardArt(x.card)), rank: `#${x.rank}`, name: x.card.name, meta: meta(x.card), value: `${money(x.nowCents)}<small>cheapest listing</small>` })), pageTitle: `${set.name} top ${n}`, cta, legal }),
    captions: {
      tiktok: `The ${n} most expensive Riftbound ${set.name} cards right now 💸 #1 is ${ranked[0].card.name} from ${money(ranked[0].nowCents)}\n\nCheapest listing for every card: riftcompare.com (link in bio)\n\n#riftbound #riftboundtcg #leagueoflegends #tcg #${tag.toLowerCase()}`,
      instagram: `The ${n} most expensive Riftbound ${set.name} cards right now 💸\n\n${list}\n\n${basis}${r.held.length ? " A card whose cheapest listing halved overnight is left out until we've checked it." : ""}\n\nEvery ${set.name} card across 230+ stores in AU, US, UK, EU, CA and SG 👉 riftcompare.com/sets/${set.slug} (link in bio)\n\nWhich one are you chasing? 👇\n\n${DISCLAIMER}\n\n#Riftbound #RiftboundTCG #Riftbound${tag} #LeagueOfLegends #TCG`,
      youtubeTitle: `Top ${n} most expensive Riftbound ${set.name} cards (${prettyDay(r.today)}) #riftbound #shorts`,
      youtube: `The ${n} most expensive cards in Riftbound ${set.name}, by their cheapest listing today.\n\n${list}\n\n${basis}\n\nEvery ${set.name} card, every store: ${utm(`/sets/${set.slug}`, "youtube", `top-${code.toLowerCase()}-${r.today}`)}\n\n${DISCLAIMER}\n\n#riftbound #riftboundtcg #leagueoflegends`,
    },
    check: [
      ...ranked.map((x) => `- ${line(x)}: ${SITE}/card/${x.card.slug}`),
      ...r.held.map((x) => `- HELD BACK (halved overnight, check it): ${x.card.name} ${x.card.collectorNumber} ${money(x.prevCents)} → ${money(x.nowCents)}: ${SITE}/card/${x.card.slug}`),
      ...r.noArt.map((x) => `- SKIPPED (no local card art; rerun with --remote-art): ${x.card.name} ${x.card.collectorNumber} ${money(x.nowCents)}`),
    ],
    links: { page: `/sets/${set.slug}` },
  };
}

function buildBoxes(code) {
  const set = SETS[code];
  if (!set) throw new Error(`unknown set ${code}`);
  const b = cheapestBoxes(code);
  if (b.markets.length < 3) throw new Error(`${set.name}: booster boxes listed in only ${b.markets.length} markets`);
  const day = b.asOf.slice(0, 10);
  const legal = `Prices: the cheapest in-stock ${set.name} booster box at an independent store in each market on ${prettyDay(day)} ${year(day)}, in its own currency, before postage. eBay and TCGplayer are left out. ${DISCLAIMER}`;
  const rows = b.markets.map((x) => ({ chip: x.market, main: x.store, note: `${x.stores} store${x.stores === 1 ? "" : "s"} compared${x.preorder ? " · pre-order" : ""}`, side: money(x.priceCents, x.currency) }));
  const scenes = [
    { kind: "hook", kicker: `RIFTBOUND · ${set.name.toUpperCase()}`, title: "BOOSTER BOX", titleSize: 150, title2: "Cheapest store", title2Size: 96, title2Top: 800, ribbon: `${prettyDay(day)} ${year(day)}`.toUpperCase(), line: "In 6 countries, in their own money." },
    { kind: "rows", title: `${esc(set.name)}<br>booster box`, subtitle: "Cheapest in-stock store, before postage", subtitleTop: 400, rowsTop: 470, rows, len: 7.5 },
  ];
  const cta = `Every store in your country.<br><span style="color: var(--rc-green)">One search.</span>`;
  const list = b.markets.map((x) => `${x.market}: ${money(x.priceCents, x.currency)} at ${x.store}${x.preorder ? " (pre-order)" : ""}`).join("\n");
  const basis = `Cheapest in-stock ${set.name} booster box at an independent store in each market on ${prettyDay(day)}, before postage; eBay and TCGplayer left out. Prices are in each country's own currency, not converted.`;
  return {
    name: `${day}-boxes-${code.toLowerCase()}`, day, accent: "#5aa9ff",
    video: videoHtml({ accent: "#5aa9ff", scenes, cta, legal }),
    slides: slidesHtml({ accent: "#5aa9ff", cover: { kicker: `RIFTBOUND · ${set.name.toUpperCase()}`, title: "BOOSTER BOX", titleSize: 140, title2: "Cheapest store", title2Size: 92, title2Top: 430, ribbon: `${prettyDay(day)} ${year(day)}`.toUpperCase(), fan: [] }, items: b.markets.map((x) => ({ rank: x.market, name: x.store, meta: `${x.stores} STORES COMPARED${x.preorder ? " · PRE-ORDER" : ""}`, value: `${money(x.priceCents, x.currency)}<small>before postage</small>` })), pageTitle: `${set.name} booster box`, cta, legal }),
    captions: {
      tiktok: `Where's the cheapest Riftbound ${set.name} booster box? Here's the lowest store price in 6 countries 📦\n\nCompare every store in yours: riftcompare.com (link in bio)\n\n#riftbound #riftboundtcg #leagueoflegends #tcg #boosterbox`,
      instagram: `Riftbound ${set.name} booster box: the cheapest store in each country 📦\n\n${list}\n\n${basis}\n\nCompare every store in your country 👉 riftcompare.com/sealed (link in bio)\n\nWhat did you pay? 👇\n\n${DISCLAIMER}\n\n#Riftbound #RiftboundTCG #Riftbound${set.name.replace(/\W/g, "")} #LeagueOfLegends #TCG`,
      youtubeTitle: `Cheapest Riftbound ${set.name} booster box in 6 countries (${prettyDay(day)}) #riftbound #shorts`,
      youtube: `The cheapest in-stock Riftbound ${set.name} booster box at an independent store in AU, US, UK, EU, CA and SG.\n\n${list}\n\n${basis}\n\nCompare every store: ${utm("/sealed", "youtube", `boxes-${code.toLowerCase()}-${day}`)}\n\n${DISCLAIMER}\n\n#riftbound #riftboundtcg #leagueoflegends`,
    },
    check: b.markets.map((x) => `- ${x.market}: ${money(x.priceCents, x.currency)} at ${x.store}, "${x.title}"${x.preorder ? " (PRE-ORDER: say so or drop it)" : ""}`),
    links: { page: "/sealed" },
  };
}

const p = build();
const dir = path.resolve(opt("--out") ?? path.join(ROOT, "social/out", p.name));
fs.mkdirSync(dir, { recursive: true });
for (const f of fs.readdirSync(dir)) if (/^(s\d+\.png|video\.mp4|cover\.jpg|soundtrack\.wav|still-.*\.jpg)$/.test(f)) fs.rmSync(path.join(dir, f));
fs.writeFileSync(path.join(dir, "video.html"), p.video);
fs.writeFileSync(path.join(dir, "slides.html"), p.slides);
fs.writeFileSync(path.join(dir, "tiktok.txt"), p.captions.tiktok + "\n");
fs.writeFileSync(path.join(dir, "instagram.txt"), p.captions.instagram + "\n");
fs.writeFileSync(path.join(dir, "youtube.txt"), `TITLE\n${p.captions.youtubeTitle}\n\nDESCRIPTION\n${p.captions.youtube}\n`);
fs.writeFileSync(path.join(dir, "CHECK.md"), `# ${p.name}: check before posting

Data day: ${p.day} (Sydney). Open two or three of these on the site; if a number
is off, don't post it, and say which one in the project thread.

${p.check.join("\n")}

Posting on a later day? Re-run \`bash social/build.sh\` so the numbers are today's.
Instagram story link sticker: ${utm(p.links.page, "instagram", "story")}
`);
fs.writeFileSync(path.join(dir, "POST-with-claude-in-chrome.md"), chromePrompt(p));
console.log(dir);

// A paste-ready Claude in Chrome prompt that posts this pack, captions inlined
// (Chrome can't read the .txt files). The person picks the files; Claude fills
// the forms and stops before each final Post button.
function chromePrompt(p) {
  const block = (t) => "```\n" + t + "\n```";
  return `# Post ${p.name} with Claude in Chrome

Before pasting: put video.mp4, cover.jpg and s1.png, s2.png… from this pack in your
Downloads folder, and open CHECK.md and spot-check two prices on riftcompare.com.
Paste everything below the line into Claude in Chrome, on a computer.

---

You are helping me post one short video for RiftCompare (a free Riftbound card
price site) to TikTok, YouTube Shorts and Instagram. I'm signed in to all three.

Rules: never post anything until I say "post it" for that platform: fill everything in,
then stop and show me. Never comment, like, follow or message anyone. When a step needs
a file from my computer, tell me which button to click and which file (from my Downloads
folder) to pick, then wait for me. Copy captions exactly as written, including line breaks
and emoji.

## 1. TikTok
Open https://www.tiktok.com/tiktokstudio/upload. I'll pick video.mp4. Then:
- Description:
${block(p.captions.tiktok)}
- Cover: pick the frame about 2 seconds in (the title card).
- Who can watch: Everyone. Allow comments, Duet and Stitch.
- Leave "AI-generated content" off (it's our own data video). Don't add a location or product link.
Stop and show me before Post.

## 2. YouTube Shorts
Open https://studio.youtube.com, click Create, Upload videos. I'll pick video.mp4. Then:
- Title:
${block(p.captions.youtubeTitle)}
- Description:
${block(p.captions.youtube)}
- Thumbnail: Shorts can't take an uploaded one; skip it.
- Audience: "No, it's not made for kids". Altered content: No.
- Visibility: Public. Stop and show me before Publish.

## 3. Instagram Reel
Open https://www.instagram.com, click Create (+), Post. I'll pick video.mp4.
- Crop: Original (9:16). If Instagram offers "Share as Reel", keep it on.
- Cover: "Add from computer"; I'll pick cover.jpg. If that's not offered, pick the frame at about 2 seconds.
- Caption:
${block(p.captions.instagram)}
Stop and show me before Share. After I've posted it, add this first comment and pin it:
${block("Which one surprised you? Every price is on riftcompare.com (link in bio) 👆")}

## 4. Instagram carousel (2 days later; skip today unless I ask)
Create (+), Post, pick s1.png, s2.png… in order (select several), crop Original (4:5), then the same caption as the Reel.

Finish with the link to each post.
`;
}
