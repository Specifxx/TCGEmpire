import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { runStripeReconcile } from "@/lib/stripe-reconcile";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // seconds

// Admin-triggered "sync Stripe subscriptions now" — the same sweep the daily
// cron runs (lib/stripe-reconcile.ts), reachable from the admin panel.
//
// WHY THIS EXISTS SEPARATELY FROM THE CRON ROUTE. During the Naron incident
// (Aug 2026) the remediation for a stranded paying customer required a shell
// and the CRON_SECRET, which meant the person who could SEE the problem in the
// admin panel could not FIX it from there. Same logic, different gate: a
// logged-in admin (or ADMIN_TOKEN, for the key-link flow) can heal billing
// state with one click, immediately, instead of waiting for the next daily run.
//
// The sweep is extend-only and idempotent, so an impatient double-click is
// harmless. `notify: false` — the caller sees the full result on screen, so the
// alert email would be redundant noise; the cron keeps its alerting.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && body?.key === token;
  const me = await getCurrentUser();
  if (!(keyOk || me?.isAdmin)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 404 });
  }

  const summary = await runStripeReconcile({ notify: false });
  console.log(
    `admin stripe-reconcile by ${me?.email ?? "ADMIN_TOKEN"}: checked ${summary.checked}, extended ${summary.extended.length}, unmatched ${summary.unmatched.length}`
  );
  return NextResponse.json(summary, { status: summary.ok ? 200 : 500 });
}
