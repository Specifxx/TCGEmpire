import { NextResponse } from "next/server";
import { runUserDigest } from "@/lib/user-digest";

// Weekly Index-summary digest to registered accounts that never opted into the
// newsletter, sent via Brevo (see lib/email.ts) instead of Resend. Triggered
// DAILY by Vercel Cron (see vercel.json) — not weekly like /api/cron/newsletter
// — because Brevo's free tier caps at 300 sends/day, so one weekly edition can
// take several days to fully clear a growing user base. Idempotent per ISO
// week and per email: each run only sends to accounts still due for the
// current edition.
export const dynamic = "force-dynamic";
export const maxDuration = 120; // seconds

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runUserDigest();
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : "user digest run failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
