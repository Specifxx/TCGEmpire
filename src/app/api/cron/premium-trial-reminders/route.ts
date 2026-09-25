import { NextResponse } from "next/server";
import { runPremiumTrialReminders } from "@/lib/premium";
import { runRenewalReminders } from "@/lib/renewal-reminders";

// Daily "your free trial ends soon" email for Premium trialists (see
// runPremiumTrialReminders for why this runs on a schedule rather than reacting to
// Stripe's trial_will_end webhook). Triggered by GitHub Actions rather than Vercel
// Cron — see .github/workflows/premium-trial-reminders.yml — because this project's
// Vercel cron slots are already spoken for by refresh-prices/price-alerts/newsletter/
// user-digest/discord-daily (same reason marketplace-maintenance runs via Actions).
//
// Also, since 2026-09-25, the renewal reminder for PAID subscriptions whose
// auto-renew is off (runRenewalReminders) — same schedule, same 48h window,
// so it rides this route instead of claiming another workflow. The two runs
// are independent: one failing does not stop the other.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const errors: string[] = [];
  const failed = (label: string) => (e: unknown) => {
    errors.push(`${label}: ${e instanceof Error ? e.message : "run failed"}`);
    return 0;
  };
  const sent = await runPremiumTrialReminders().catch(failed("trial reminders"));
  const renewalSent = await runRenewalReminders().catch(failed("renewal reminders"));
  if (errors.length) {
    return NextResponse.json({ ok: false, sent, renewalSent, error: errors.join("; ") }, { status: 500 });
  }
  return NextResponse.json({ ok: true, sent, renewalSent });
}
