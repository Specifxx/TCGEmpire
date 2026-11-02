import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runHasSiteFailure, runSisterAlerts } from "@/lib/sister-alerts/run";
import { liveRoute } from "@/lib/public-data/live-route";

// The daily sister-site alert check (lib/sister-alerts/run.ts), called by
// .github/workflows/sister-alerts.yml with Authorization: Bearer <CRON_SECRET>.
// ?dry=1 decides and counts but sends and writes nothing. Answers 500 when a
// site that has alerts could not be checked (its feed failed or is stale), so
// the workflow fails and the ops monitor's job check sees it.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dryRun = new URL(req.url).searchParams.get("dry") === "1";
  try {
    const summary = await runSisterAlerts({ db: prisma, dryRun });
    const failed = runHasSiteFailure(summary);
    return NextResponse.json({ ok: !failed, ...summary }, { status: failed ? 500 : 200 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "sister alert run failed" }, { status: 500 });
  }
}

// Private tables only; liveRoute keeps any public read on Neon, like every cron.
export const GET = liveRoute(handle);
export const POST = liveRoute(handle);
