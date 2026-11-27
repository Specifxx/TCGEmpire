import { NextResponse } from "next/server";
import { runGiftPassBatch } from "@/lib/premium-gift-pass-server";
import { liveRoute } from "@/lib/public-data/live-route";

// One batch of the 3-day Premium pass email for ONE site (lib/premium-gift-pass.ts; owner, 2026-11-27). Dispatched by
// .github/workflows/premium-gift-pass-send.yml. CRON_SECRET required (fails closed). DRY RUN IS THE DEFAULT: only
// ?dry=0 sends, and only with ?site=<key>. Idempotent per account (Counter gp3:<id>), capped at 300 a call, and closed
// for good after 1 Dec 2026, 12:00 UTC. Returns counts only, never an address.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const p = new URL(req.url).searchParams;
  const limit = Number(p.get("limit"));
  const result = await runGiftPassBatch({ dryRun: p.get("dry") !== "0", site: p.get("site"), limit: Number.isFinite(limit) ? limit : undefined });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

export const POST = liveRoute(handle);
