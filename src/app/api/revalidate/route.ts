import { NextResponse } from "next/server";
import { importPurgeIsNoop, revalidateContent } from "@/lib/revalidate-content";

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
  // Files mode: the pages serve the release's snapshot, so a purge would only
  // re-render them with the same data (lib/revalidate-content.ts). 202, not 200:
  // refresh-prices.yml reads anything but 200 as "not purged" and gives the paid
  // alert pass its own fresh read (?fresh=1), exactly as on a skipped morning run.
  if (importPurgeIsNoop() && new URL(req.url).searchParams.get("force") !== "1") {
    return NextResponse.json(
      { ok: true, skipped: "PUBLIC_DATA_MODE=files: pages change only with a release", at: new Date().toISOString() },
      { status: 202 },
    );
  }
  const revalidated = revalidateContent();
  return NextResponse.json({ ok: true, revalidated, at: new Date().toISOString() });
}

export const GET = handle;
export const POST = handle;
