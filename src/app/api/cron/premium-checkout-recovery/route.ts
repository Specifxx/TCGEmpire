import { NextResponse } from "next/server";
import { runCheckoutRecovery } from "@/lib/premium";

// Daily "your free trial is still waiting" email for accounts that started
// Stripe checkout for Premium but never completed it (see runCheckoutRecovery
// in lib/premium.ts). Triggered by GitHub Actions rather than Vercel Cron —
// see .github/workflows/premium-checkout-recovery.yml — for the same reason
// premium-trial-reminders.yml is: this project's Vercel cron slots are already
// spoken for.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Same CRON_SECRET as the other /api/cron/* routes. Fails CLOSED when unset —
// an open endpoint would let anyone trigger a mass email send on demand (see
// api/cron/store-health/route.ts's authorized(), copied here rather than the
// fail-OPEN pattern premium-trial-reminders/route.ts used to ship with).
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  return new URL(req.url).searchParams.get("token") === secret;
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const sent = await runCheckoutRecovery();
    return NextResponse.json({ ok: true, sent });
  } catch (e) {
    const message = e instanceof Error ? e.message : "checkout recovery run failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
