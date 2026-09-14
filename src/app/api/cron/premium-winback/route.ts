import { NextResponse } from "next/server";
import { runPremiumWinbackBlast, type PremiumWinbackProvider } from "@/lib/premium-winback";

// One-off "N days of Premium, free, no card" win-back email to recently-
// registered free accounts, run ON VERCEL so it has the mail keys — same
// split as /api/cron/premium-offer, for the same reason (a GitHub runner has
// the database, not the keys).
//
// SAFETY. This emails real accounts and its link grants real product access
// with no checkout involved, so:
//   • CRON_SECRET required (fails CLOSED when unset, like the other
//     /api/cron/* routes).
//   • DRY RUN IS THE DEFAULT. You must pass ?dry=0 to actually send.
//   • registeredAfter (?since=YYYY-MM-DD) is REQUIRED — see
//     lib/premium-winback.ts for why this is pinned explicitly rather than
//     an implicit "now minus 30 days" recomputed on every call.
//   • Idempotent per account (a PremiumWinbackTrial row, created only on a
//     successful send), so re-invoking resumes and never double-sends.
export const dynamic = "force-dynamic";
export const maxDuration = 300; // seconds; the run is batched + resumable regardless

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  return new URL(req.url).searchParams.get("token") === secret;
}

async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const p = new URL(req.url).searchParams;
  // Opt-IN to sending. Anything other than an explicit "0" stays a dry run.
  const dryRun = p.get("dry") !== "0";
  const limitRaw = Number(p.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined;
  const via: PremiumWinbackProvider = p.get("via") === "resend" ? "resend" : "brevo";
  const registeredAfter = p.get("since") ?? "";

  const result = await runPremiumWinbackBlast({ registeredAfter, dryRun, limit, via });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

export const GET = handle;
export const POST = handle;
