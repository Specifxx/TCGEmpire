import { NextResponse } from "next/server";
import { createPublicKey, verify as edVerify } from "node:crypto";
import { prisma } from "@/lib/db";
import { normalizeSearch } from "@/lib/format";
import { getPriceMovers } from "@/lib/price-history";
import { DEFAULT_COUNTRY } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { cardHref } from "@/lib/card-url";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // node:crypto for Ed25519

// The RiftCompare Discord bot — HTTP interactions, so it runs serverless with no
// gateway connection. Install it in any community server and every `/price` answer
// is a branded, linked touchpoint back to the site.
//
// Setup (one-time): create an app at discord.com/developers, set the Interactions
// Endpoint URL to https://riftcompare.com/api/discord/interactions, put the app's
// PUBLIC KEY in DISCORD_BOT_PUBLIC_KEY, then register the slash commands with
// `npx tsx scripts/register-discord-commands.ts`.
const PUBLIC_KEY = process.env.DISCORD_BOT_PUBLIC_KEY ?? "";

// Discord signs (timestamp + body) with the app's Ed25519 key. Node verifies raw
// Ed25519 once the 32-byte key is wrapped in a SPKI DER header.
function verifySignature(rawBody: string, signature: string, timestamp: string): boolean {
  if (!PUBLIC_KEY || !/^[0-9a-f]{64}$/i.test(PUBLIC_KEY)) return false;
  try {
    const der = Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"), // SPKI prefix for Ed25519
      Buffer.from(PUBLIC_KEY, "hex"),
    ]);
    const key = createPublicKey({ key: der, format: "der", type: "spki" });
    return edVerify(null, Buffer.from(timestamp + rawBody), key, Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

const EMBED_GREEN = 0x34d17e;
const utm = (path: string) => `${SITE_URL}${path}?utm_source=discord-bot&utm_medium=bot&utm_campaign=price-command`;

async function priceEmbed(query: string) {
  const nq = normalizeSearch(query);
  if (nq.length < 2) return null;
  const card = await prisma.card.findFirst({
    where: { nameNormalized: { contains: nq } },
    orderBy: [{ searchCount: "desc" }, { viewCount: "desc" }],
    select: {
      id: true, slug: true, name: true, setCode: true, setName: true, collectorNumber: true,
      rarity: true, imageThumbUrl: true,
      lowestPriceCents: true, lowestPriceCentsUs: true, lowestPriceCentsUk: true, lowestPriceCentsSg: true, lowestPriceCentsCa: true,
    },
  });
  if (!card) return null;

  const url = utm(cardHref(card));
  const markets: { label: string; cents: number | null; cur: string }[] = [
    { label: "🇦🇺 AU", cents: card.lowestPriceCents, cur: "AUD" },
    { label: "🇺🇸 US", cents: card.lowestPriceCentsUs, cur: "USD" },
    { label: "🇬🇧 UK", cents: card.lowestPriceCentsUk, cur: "GBP" },
    { label: "🇸🇬 SG", cents: card.lowestPriceCentsSg, cur: "SGD" },
    { label: "🇨🇦 CA", cents: card.lowestPriceCentsCa, cur: "CAD" },
  ];
  const priced = markets.filter((m) => m.cents != null);
  return {
    title: `${card.name} — ${card.setCode} ${card.collectorNumber}`,
    url,
    color: EMBED_GREEN,
    description:
      (priced.length
        ? priced.map((m) => `${m.label} **${formatMoney(m.cents!, m.cur)}**`).join(" · ")
        : "No live price right now — prices refresh daily.") +
      `\n[Compare every store →](${url})`,
    ...(card.imageThumbUrl ? { thumbnail: { url: card.imageThumbUrl } } : {}),
    footer: { text: `${card.setName} · ${card.rarity} · live lowest in-stock prices · riftcompare.com` },
  };
}

async function moversEmbed() {
  // A Discord interaction carries no IP and no geo header, so there is no region
  // to detect — this is the pure default path, and it belongs to DEFAULT_COUNTRY
  // rather than a literal. It was "AU" from when AU was the default market.
  const movers = await getPriceMovers(DEFAULT_COUNTRY, 3);
  const line = (arr: typeof movers.spiking, up: boolean) =>
    arr.length
      ? arr.map((m) => `${up ? "▲" : "▼"} [**${m.card.name}**](${utm(cardHref(m.card))}) ${m.pct > 0 ? "+" : ""}${m.pct}%`).join("\n")
      : "_nothing notable_";
  return {
    title: "📈 Riftbound price movers — this week",
    url: utm("/movers"),
    color: EMBED_GREEN,
    description: `**Spiking**\n${line(movers.spiking, true)}\n\n**Dropping**\n${line(movers.plummeting, false)}\n\n[Full report →](${utm("/movers")})`,
    footer: { text: "AU market · updated daily · riftcompare.com" },
  };
}

export async function POST(req: Request) {
  const signature = req.headers.get("x-signature-ed25519") ?? "";
  const timestamp = req.headers.get("x-signature-timestamp") ?? "";
  const rawBody = await req.text();

  if (!verifySignature(rawBody, signature, timestamp)) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }

  const interaction = JSON.parse(rawBody);

  // PING → PONG (Discord's endpoint verification).
  if (interaction.type === 1) return NextResponse.json({ type: 1 });

  // Slash commands.
  if (interaction.type === 2) {
    const name: string = interaction.data?.name ?? "";
    try {
      if (name === "price") {
        const query: string = interaction.data?.options?.find((o: { name: string }) => o.name === "card")?.value ?? "";
        const embed = await priceEmbed(query);
        if (!embed) {
          return NextResponse.json({
            type: 4,
            data: { content: `No card matching **${query.slice(0, 60)}** — try part of the name (e.g. \`/price card: kai'sa\`).`, flags: 64 },
          });
        }
        return NextResponse.json({ type: 4, data: { embeds: [embed] } });
      }
      if (name === "movers") {
        return NextResponse.json({ type: 4, data: { embeds: [await moversEmbed()] } });
      }
    } catch {
      return NextResponse.json({ type: 4, data: { content: "Something hiccuped — try again in a moment.", flags: 64 } });
    }
  }

  return NextResponse.json({ type: 4, data: { content: "Unknown command", flags: 64 } });
}
