import { NextResponse } from "next/server";
import { runArbitrageAlerts } from "@/lib/arbitrage-alerts";

// Daily "Arbitrage Alerts" digest for Premium members — see lib/arbitrage-alerts.ts.
// Triggered by GitHub Actions rather than Vercel Cron — see
// .github/workflows/arbitrage-alerts.yml — because this project's Vercel cron
// slots are already spoken for (same reason marketplace-maintenance and
// premium-trial-reminders run via Actions).
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const sent = await runArbitrageAlerts();
    return NextResponse.json({ ok: true, sent });
  } catch (e) {
    const message = e instanceof Error ? e.message : "arbitrage alert run failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
