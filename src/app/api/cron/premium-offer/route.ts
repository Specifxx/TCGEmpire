import { NextResponse } from "next/server";
import { runPremiumOfferBlast, type PremiumOfferProvider } from "@/lib/premium-offer";

// The one-off PRICE-DROP announcement (2026-09-27) to every account not
// currently paying — see lib/premium-offer.ts. The path keeps its old name
// (it carried the "month on us" offer before) so the workflow and any saved
// links stay valid. Runs ON VERCEL so it has the mail keys — the same split
// /api/cron/release-day-email uses, for the same reason (a GitHub runner has
// the database, not the keys).
//
// SAFETY. This emails real accounts, so:
//   • CRON_SECRET required (fails CLOSED when unset, like the other /api/cron/* routes).
//   • DRY RUN IS THE DEFAULT. You must pass ?dry=0 to actually send — a bare
//     authenticated call can only ever report, never blast.
//   • Idempotent per account (User.priceDropEmailSentAt, stamped on success),
//     so re-invoking resumes and never double-sends. That also makes the batch
//     cap safe — call it again (next day) to continue where it left off.
//   • No deadline parameter: the announcement states the prices, it makes no
//     time-limited offer.
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
  // Never more than a day of Brevo's free tier in one call.
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 300) : undefined;
  const via: PremiumOfferProvider = p.get("via") === "resend" ? "resend" : "brevo";

  const result = await runPremiumOfferBlast({ dryRun, limit, via });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

export const GET = handle;
export const POST = handle;
