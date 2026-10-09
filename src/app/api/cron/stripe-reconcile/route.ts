import { NextResponse } from "next/server";
import { runStripeReconcile } from "@/lib/stripe-reconcile";
import { liveRoute } from "@/lib/public-data/live-route";

// Daily Stripe ↔ premiumUntil reconciliation — the safety net under the webhook.
// All the logic lives in lib/stripe-reconcile.ts so the identical sweep is also
// reachable from the admin panel (/api/admin/stripe-reconcile), which is what
// makes fixing a stranded customer a click rather than a shell and a secret.
//
// Triggered by Vercel Cron (see vercel.json) or manually with
// Authorization: Bearer <CRON_SECRET>, same as the other cron routes.
export const dynamic = "force-dynamic";
export const maxDuration = 120; // seconds

async function handleGET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const summary = await runStripeReconcile();
  return NextResponse.json(summary, { status: summary.ok ? 200 : 500 });
}

// Public reads ask Neon first: this cron needs the latest import, not the last release (lib/public-data/live-route.ts).
export const GET = liveRoute(handleGET);
