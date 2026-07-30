import { NextResponse } from "next/server";
import { postDiscordDaily } from "@/lib/discord";

// Posts the daily Riftle prompt to Discord. Vercel Cron (see vercel.json) fires it
// at 09:00 UTC, or any scheduler hitting this URL with
// Authorization: Bearer <CRON_SECRET>. Inert until DISCORD_WEBHOOK_URL is set.
//
// (Previously described itself as posting "the daily market wrap ... after the
// 08:00 market-report cron" — there was no such cron in vercel.json, and
// market-report generation is now deleted outright. See lib/discord.ts.)
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await postDiscordDaily();
  return NextResponse.json(result);
}
