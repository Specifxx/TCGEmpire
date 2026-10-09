import { NextResponse } from "next/server";
import { runPremiumTrialReminders } from "@/lib/premium";
import { liveRoute } from "@/lib/public-data/live-route";

// Daily "your trial ends soon" email for Plus and Premium trialists (see
// runPremiumTrialReminders for why this runs on a schedule rather than reacting to
// Stripe's trial_will_end webhook). Triggered by GitHub Actions rather than Vercel
// Cron — see .github/workflows/premium-trial-reminders.yml — because this project's
// Vercel cron slots are already spoken for by refresh-prices/price-alerts/newsletter/
// user-digest/discord-daily (same reason marketplace-maintenance runs via Actions).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handleGET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const sent = await runPremiumTrialReminders();
    return NextResponse.json({ ok: true, sent });
  } catch (e) {
    const message = e instanceof Error ? e.message : "trial reminder run failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// Public reads ask Neon first: this cron needs the latest import, not the last release (lib/public-data/live-route.ts).
export const GET = liveRoute(handleGET);
