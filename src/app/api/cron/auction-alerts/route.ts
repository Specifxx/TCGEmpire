import { NextResponse } from "next/server";
import { runAuctionAlerts } from "@/lib/auction-alerts";
import { liveRoute } from "@/lib/public-data/live-route";

// PREMIUM AUCTION ALERTS (2026-10-09, lib/auction-alerts.ts), called by
// refresh-auctions.yml after each sweep. Fails CLOSED without CRON_SECRET, like
// the sealed route, because it sends real email. Until the release that adds it,
// this path 404s and the workflow's curl tolerates that.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function handleGET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const auctions = await runAuctionAlerts()
    .then((s) => ({ ok: true as const, ...s }))
    .catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "run failed" }));
  return NextResponse.json({ ok: auctions.ok, scope: "auctions", auctions }, { status: auctions.ok ? 200 : 500 });
}

// Reads Neon first: the run needs the sweep it follows, not the last release.
export const GET = liveRoute(handleGET);
