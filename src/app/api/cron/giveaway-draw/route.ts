import { NextResponse } from "next/server";
import { runGiveawayDraws } from "@/lib/giveaway-run";
import { liveRoute } from "@/lib/public-data/live-route";

// The giveaway draws (lib/giveaway-run.ts), called every six hours by .github/workflows/giveaway-draw.yml with
// Authorization: Bearer <CRON_SECRET>. ?dry=1 decides and answers but writes and sends nothing.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dryRun = new URL(req.url).searchParams.get("dry") === "1";
  try {
    const lines = await runGiveawayDraws({ dryRun });
    return NextResponse.json({ ok: true, dryRun, lines });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "draw failed" }, { status: 500 });
  }
}

export const GET = liveRoute(handle);
export const POST = liveRoute(handle);
