import { NextResponse } from "next/server";
import { runWatchDigest } from "@/lib/watch-digest";
import { liveRoute } from "@/lib/public-data/live-route";

// The weekly watched-cards email (lib/watch-digest.ts), called daily by refresh-prices.yml after the 07:00 free alert
// run. Idempotent per ISO week: each run sends only to subscribers still due, inside DIGEST_BATCH.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await runWatchDigest()) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "watch digest failed" }, { status: 500 });
  }
}

export const GET = liveRoute(handle);
export const POST = liveRoute(handle);
