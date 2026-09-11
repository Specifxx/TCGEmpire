import { NextResponse } from "next/server";
import { runUserDigest, type UserDigestProvider } from "@/lib/user-digest";

// Weekly Index-summary digest to registered accounts that never opted into the
// newsletter, sent via Brevo by DEFAULT (see lib/email.ts) instead of Resend.
// Triggered DAILY by Vercel Cron (see vercel.json) — not weekly like
// /api/cron/newsletter — because Brevo's free tier caps at 300 sends/day, so
// one weekly edition can take several days to fully clear a growing user base.
// Idempotent per ISO week and per email: each run only sends to accounts still
// due for the current edition.
//
// ?via=resend overrides the provider for a manual invocation, same escape
// hatch as /api/cron/premium-offer's — reach for it if the run's own
// `errors` field names a Brevo failure (see lib/email.ts's header on
// sendUserDigestEmail for the 2026-09-10 Authorised-IPs outage this exists
// because of). The Vercel Cron trigger itself always uses the default.
export const dynamic = "force-dynamic";
export const maxDuration = 120; // seconds

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  return new URL(req.url).searchParams.get("token") === secret;
}

async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const p = new URL(req.url).searchParams;
  const via: UserDigestProvider = p.get("via") === "resend" ? "resend" : "brevo";
  const limitRaw = Number(p.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined;
  try {
    const summary = await runUserDigest({ via, limit });
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : "user digest run failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
