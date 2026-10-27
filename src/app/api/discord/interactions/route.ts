import { verifyDiscordSignature } from "@/lib/discord/verify";
import { handleInteraction, type Interaction } from "@/lib/discord/bot";
import { getBulkCardSummary } from "@/lib/public-api";

// The Discord price bot's Interactions Endpoint (DECISIONS.md, "Discord price
// bot", 2026-10-27; lib/discord/bot.ts). Discord POSTs each slash command here,
// signed; an unsigned or wrongly signed request gets 401, which is also what
// Discord's own setup check expects to see. No database: Riftbound reads the
// self-cached public catalogue, the other games their sites' public search.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(req: Request) {
  const key = process.env.DISCORD_PUBLIC_KEY ?? "";
  const body = await req.text();
  const ok = verifyDiscordSignature(key, req.headers.get("x-signature-ed25519"), req.headers.get("x-signature-timestamp"), body);
  if (!ok) return new Response("invalid request signature", { status: 401 });
  let interaction: Interaction;
  try {
    interaction = JSON.parse(body) as Interaction;
  } catch {
    return new Response("bad request", { status: 400 });
  }
  const reply = await handleInteraction(interaction, {
    fetch: (url, init) => fetch(url, { ...init, cache: "no-store" }),
    riftbound: (market) => getBulkCardSummary(market).catch(() => null),
  });
  return Response.json(reply);
}

// For the ops monitor: is the endpoint deployed, and does it have its key?
// Status only, never the key.
export function GET() {
  return Response.json(
    { ok: true, configured: Boolean(process.env.DISCORD_PUBLIC_KEY) },
    { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400", "X-Robots-Tag": "noindex" } },
  );
}
