import { NextResponse } from "next/server";
import { revalidateContent } from "@/lib/revalidate-content";

// On-demand ISR revalidation, called by the price-import job (GitHub Actions
// `refresh-prices.yml`, and the Vercel-cron route) once new prices land. This lets
// the public pages use a 24h revalidate fallback instead of a short timer, so
// Postgres is read ~twice a day (per import) rather than continuously — the fix for
// the Neon public-transfer allowance.
//
// AUTH: reuses CRON_SECRET (the same token that guards /api/cron/refresh-prices), so
// there is no NEW secret to create — just expose the existing one to the caller.
// Fails CLOSED when the secret is unset: an open endpoint would let anyone force
// mass regenerations, which would INCREASE DB reads (the opposite of the goal).
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  // Also accept ?token= for schedulers that can't set headers (kept out of any
  // indexable surface; this route is under the robots-disallowed /api).
  return new URL(req.url).searchParams.get("token") === secret;
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const revalidated = revalidateContent();
  return NextResponse.json({ ok: true, revalidated, at: new Date().toISOString() });
}

export const GET = handle;
export const POST = handle;
