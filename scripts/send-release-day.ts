/**
 * One-off release-day email blast (e.g. Vendetta, 31 Jul 2026). Emails every
 * newsletter subscriber the "the set is out — see every price" message.
 *
 * SAFETY: does nothing unless RELEASE_DAY_SEND=1 is set, so it can never fire by
 * accident. Backfills a per-subscriber unsub token if missing. Throttled to Resend's
 * rate limit. Re-running re-sends (no idempotency marker) — run it ONCE.
 *
 * Usage (on release day):
 *   RELEASE_DAY_SEND=1 SET_NAME="Vendetta" SET_SLUG="vendetta" npx tsx scripts/send-release-day.ts
 */
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/db";
import { sendReleaseDayEmail } from "../src/lib/email";
import { SITE_URL } from "../src/lib/site";

async function main() {
  if (process.env.RELEASE_DAY_SEND !== "1") {
    console.log("release-day: RELEASE_DAY_SEND!=1 — refusing to send. Set it to actually blast.");
    return;
  }
  const setName = process.env.SET_NAME ?? "Vendetta";
  const setSlug = process.env.SET_SLUG ?? "vendetta";

  const subs = await prisma.newsletterSubscriber.findMany({ select: { email: true, unsubToken: true, id: true } });
  console.log(`release-day: sending "${setName}" to ${subs.length} subscribers…`);

  let sent = 0;
  for (const s of subs) {
    let token = s.unsubToken;
    if (!token) {
      token = randomUUID();
      await prisma.newsletterSubscriber.update({ where: { id: s.id }, data: { unsubToken: token } }).catch(() => {});
    }
    const unsubUrl = `${SITE_URL}/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
    const ok = await sendReleaseDayEmail(s.email, setName, setSlug, unsubUrl);
    if (ok) sent++;
    await new Promise((r) => setTimeout(r, 600)); // Resend ~2 req/s
  }
  console.log(`release-day: done — ${sent}/${subs.length} sent.`);
}

main()
  .catch((e) => {
    console.error("send-release-day failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
