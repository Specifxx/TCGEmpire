/**
 * Price-drop announcement email (2026-09-27) — LOCAL entry point.
 *
 * The real send normally runs on Vercel — from the admin console at
 * /admin/premium-offer, or via /api/cron/premium-offer triggered by
 * .github/workflows/premium-offer-email.yml — because the mail keys are Vercel
 * env vars. This script runs the same lib/premium-offer.ts logic by hand from
 * an environment that has BOTH the database and a mail key — or, with
 * DRY_RUN=1, just reports the audience against whatever database it can reach.
 *
 * Also handy for previewing the email itself: PREVIEW=1 writes the HTML and the
 * plain-text part to ./artifacts/price-drop-email.{html,txt} and touches
 * nothing else — no database, no mail.
 *
 * SAFETY: refuses to run without PREMIUM_OFFER_SEND=1; DRY_RUN=1 reports and
 * sends nothing; idempotent per account (User.priceDropEmailSentAt), so a
 * partial run is safe to repeat. Each run sends at most one batch (LIMIT, or
 * the default of 90 — under Brevo's 300/day free cap); run again the next day
 * until `remaining` is 0.
 *
 * Usage:
 *   PREVIEW=1 npx tsx scripts/send-premium-offer.ts
 *   PREMIUM_OFFER_SEND=1 DRY_RUN=1 npx tsx scripts/send-premium-offer.ts
 *   PREMIUM_OFFER_SEND=1 VIA=brevo npx tsx scripts/send-premium-offer.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { buildPremiumOfferEmail } from "../src/lib/email";
import { runPremiumOfferBlast } from "../src/lib/premium-offer";

async function main() {
  if (process.env.PREVIEW === "1") {
    const { subject, html, text } = buildPremiumOfferEmail({
      displayName: "Sample Collector",
      unsubUrl: "https://riftcompare.com/announcements/unsubscribe?token=preview",
      oneClickUrl: "https://riftcompare.com/api/announcements/unsubscribe?token=preview",
    });
    mkdirSync("artifacts", { recursive: true });
    writeFileSync("artifacts/price-drop-email.html", html);
    writeFileSync("artifacts/price-drop-email.txt", text);
    console.log(`artifacts/price-drop-email.html (+ .txt)\n  subject: ${subject}`);
    return;
  }

  if (process.env.PREMIUM_OFFER_SEND !== "1") {
    console.log("price-drop email: PREMIUM_OFFER_SEND!=1 — refusing to send. Set it to actually run (DRY_RUN=1 to only report).");
    return;
  }
  const res = await runPremiumOfferBlast({
    dryRun: process.env.DRY_RUN === "1",
    limit: Number(process.env.LIMIT) || undefined,
    via: process.env.VIA === "resend" ? "resend" : "brevo",
  });
  console.log("price-drop email:", JSON.stringify(res, null, 2));
  if (!res.ok) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("send-premium-offer failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (process.env.PREVIEW !== "1") {
      const { prisma } = await import("../src/lib/db");
      await prisma.$disconnect();
    }
  });
