import { NextResponse } from "next/server";
import { runReleaseDayBlast } from "@/lib/release-day";

// Release-day email blast, run ON VERCEL so it has RESEND_API_KEY — the same
// environment the weekly digest (/api/cron/newsletter), verification and
// price-alert emails already send from. A GitHub Actions runner has the database
// but not the mail key, so the blast has to happen here; CI's only role is to
// authenticate the trigger (same split refresh-prices.yml uses for /api/revalidate).
//
// SAFETY. This emails real subscribers, so:
//   • CRON_SECRET required (fails CLOSED when unset, like the other /api/cron/* routes).
//   • DRY RUN IS THE DEFAULT. You must pass ?dry=0 to actually send — a bare
//     authenticated GET can only ever report, never blast.
//   • Idempotent per campaign: each subscriber is stamped "release-<slug>" on
//     SUCCESS, so re-invoking resumes and never double-sends. That also makes the
//     batch cap safe — call it again to continue where it left off.
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
  const setSlug = p.get("set") ?? "vendetta";
  // Opt-IN to sending. Anything other than an explicit "0" stays a dry run.
  const dryRun = p.get("dry") !== "0";
  const limitRaw = Number(p.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined;

  const result = await runReleaseDayBlast({ setSlug, dryRun, limit });
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

export const GET = handle;
export const POST = handle;
