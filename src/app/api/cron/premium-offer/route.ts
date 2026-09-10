import { NextResponse } from "next/server";
import { runPremiumOfferBlast, type PremiumOfferProvider } from "@/lib/premium-offer";

// One-off "a full month of Premium, on us" email to free-tier accounts, run ON
// VERCEL so it has the mail keys — the same split /api/cron/release-day-email
// uses, for the same reason (a GitHub runner has the database, not the keys).
//
// SAFETY. This emails real accounts, so:
//   • CRON_SECRET required (fails CLOSED when unset, like the other /api/cron/* routes).
//   • DRY RUN IS THE DEFAULT. You must pass ?dry=0 to actually send — a bare
//     authenticated call can only ever report, never blast.
//   • A real deadline (?until=YYYY-MM-DD, in the future) is REQUIRED — the offer
//     is "subscribe before <date>", and lib/premium-offer.ts refuses to send
//     without one.
//   • Idempotent per account (User.premiumOfferSentAt, stamped on success), so
//     re-invoking resumes and never double-sends. That also makes the batch cap
//     safe — call it again to continue where it left off.
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
  const via: PremiumOfferProvider = p.get("via") === "resend" ? "resend" : "brevo";
  const offerEnds = p.get("until") ?? "";

  const result = await runPremiumOfferBlast({ offerEnds, dryRun, limit, via });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

export const GET = handle;
export const POST = handle;
