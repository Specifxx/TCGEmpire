/**
 * Premium offer email — LOCAL entry point.
 *
 * The real send normally runs on Vercel via /api/cron/premium-offer (triggered by
 * .github/workflows/premium-offer-email.yml), because the mail keys are Vercel
 * env vars. This script runs the same lib/premium-offer.ts logic by hand from an
 * environment that has BOTH the database and a mail key — or, with DRY_RUN=1,
 * just reports the audience against whatever database it can reach.
 *
 * Also handy for previewing the email itself: PREVIEW=1 writes both wordings
 * (trial available / trial already used) to ./artifacts/premium-offer-*.html
 * and touches nothing else — no database, no mail.
 *
 * SAFETY: refuses to run without PREMIUM_OFFER_SEND=1; DRY_RUN=1 reports and
 * sends nothing; idempotent per account (User.premiumOfferSentAt), so a partial
 * run is safe to repeat.
 *
 * Usage:
 *   PREVIEW=1 npx tsx scripts/send-premium-offer.ts
 *   PREMIUM_OFFER_SEND=1 DRY_RUN=1 OFFER_ENDS=2026-09-30 npx tsx scripts/send-premium-offer.ts
 *   PREMIUM_OFFER_SEND=1 OFFER_ENDS=2026-09-30 VIA=brevo npx tsx scripts/send-premium-offer.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { buildPremiumOfferEmail } from "../src/lib/email";
import { premiumFromLine } from "../src/lib/site";
import { PREMIUM_TRIAL_DAYS } from "../src/lib/premium";
import { PREMIUM_OFFER_DAYS, formatOfferEnds, parseOfferEnds, runPremiumOfferBlast } from "../src/lib/premium-offer";

async function main() {
  if (process.env.PREVIEW === "1") {
    const ends = parseOfferEnds(process.env.OFFER_ENDS) ?? new Date(Date.now() + 21 * 86_400_000);
    mkdirSync("artifacts", { recursive: true });
    for (const [tag, trialDays] of [
      ["trial", PREMIUM_TRIAL_DAYS],
      ["no-trial", 0],
    ] as const) {
      const { subject, html } = buildPremiumOfferEmail(
        {
          displayName: "Sample Collector",
          trialDays,
          offerDays: PREMIUM_OFFER_DAYS,
          offerEnds: formatOfferEnds(ends),
          unsubUrl: "https://riftcompare.com/announcements/unsubscribe?token=preview",
        },
        premiumFromLine(),
      );
      const file = `artifacts/premium-offer-${tag}.html`;
      writeFileSync(file, html);
      console.log(`${file}\n  subject: ${subject}`);
    }
    return;
  }

  if (process.env.PREMIUM_OFFER_SEND !== "1") {
    console.log("premium-offer: PREMIUM_OFFER_SEND!=1 — refusing to send. Set it to actually run (DRY_RUN=1 to only report).");
    return;
  }
  const res = await runPremiumOfferBlast({
    offerEnds: process.env.OFFER_ENDS ?? "",
    dryRun: process.env.DRY_RUN === "1",
    limit: Number(process.env.LIMIT) || undefined,
    via: process.env.VIA === "resend" ? "resend" : "brevo",
  });
  console.log("premium-offer:", JSON.stringify(res, null, 2));
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
