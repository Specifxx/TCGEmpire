import { NextResponse } from "next/server";
import { runWelcomeEmails } from "@/lib/welcome-email";
import { liveRoute } from "@/lib/public-data/live-route";

// Hourly one-time welcome email to new accounts (see lib/welcome-email.ts).
// Triggered by GitHub Actions — .github/workflows/welcome-email.yml — rather
// than Vercel Cron, same reason as premium-checkout-recovery: this project's
// Vercel cron slots are spoken for.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Fails CLOSED when CRON_SECRET is unset, like the checkout-recovery route: an
// open endpoint would let anyone trigger email sends on demand.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  return new URL(req.url).searchParams.get("token") === secret;
}

async function handleGET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const summary = await runWelcomeEmails();
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : "welcome email run failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// Public reads ask Neon first: this cron needs the latest import, not the last release (lib/public-data/live-route.ts).
export const GET = liveRoute(handleGET);
