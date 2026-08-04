/**
 * Release-day email blast — LOCAL/CI entry point.
 *
 * The real send normally runs on Vercel via /api/cron/release-day-email, because
 * RESEND_API_KEY is a Vercel env var (a GitHub Actions runner has the database but
 * not the mail key, so a blast from CI delivers nothing). This script exists for
 * running the same logic by hand from an environment that DOES have both.
 *
 * Both paths share lib/release-day.ts, so behaviour can't drift between them.
 *
 * SAFETY: refuses to run without RELEASE_DAY_SEND=1; DRY_RUN=1 reports and sends
 * nothing; idempotent per campaign (each subscriber stamped on success), so a
 * partial run is safe to repeat.
 *
 * Usage:
 *   RELEASE_DAY_SEND=1 DRY_RUN=1 SET_SLUG=vendetta npx tsx scripts/send-release-day.ts
 *   RELEASE_DAY_SEND=1 SET_SLUG=vendetta npx tsx scripts/send-release-day.ts
 */
import { prisma } from "../src/lib/db";
import { runReleaseDayBlast } from "../src/lib/release-day";

async function main() {
  if (process.env.RELEASE_DAY_SEND !== "1") {
    console.log("release-day: RELEASE_DAY_SEND!=1 — refusing to send. Set it to actually blast.");
    return;
  }
  const res = await runReleaseDayBlast({
    setSlug: process.env.SET_SLUG ?? "vendetta",
    dryRun: process.env.DRY_RUN === "1",
    limit: Number(process.env.LIMIT) || undefined,
  });
  console.log("release-day:", JSON.stringify(res, null, 2));
  if (!res.ok) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("send-release-day failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
