import { NextResponse } from "next/server";
import { runWatchRecap, sendWatchRecapTest } from "@/lib/watch-recap";
import { ownerEmail } from "@/lib/ops/owner";
import { liveRoute } from "@/lib/public-data/live-route";

// The dormant-account watchlist recap (lib/watch-recap.ts), run by watch-recap-send.yml.
// CRON_SECRET only, fails closed. A dry run unless ?dry=0. ?test=owner sends one real recap to
// the owner's address (chosen here on the server, never taken from the request).
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const p = new URL(req.url).searchParams;
  if (p.get("test") === "owner") {
    const r = await sendWatchRecapTest(ownerEmail());
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  }
  const dryRun = p.get("dry") !== "0";
  const limitRaw = Number(p.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 300) : undefined;
  const result = await runWatchRecap({ dryRun, limit });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

export const POST = liveRoute(handle);
