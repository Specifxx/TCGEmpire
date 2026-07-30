/**
 * One-off release-day email blast for a new set (e.g. Vendetta, 31 Jul 2026).
 * Emails every newsletter subscriber: the set is out, the card database + prices
 * are live, and sealed is priced too.
 *
 * SAFETY — this sends to REAL subscribers, so it is deliberately hard to fire by
 * accident and hard to double-send:
 *   1. Does nothing unless RELEASE_DAY_SEND=1.
 *   2. DRY_RUN=1 resolves the audience + live stats and sends NOTHING. Do this first.
 *   3. IDEMPOTENT per campaign: each subscriber's lastEditionKey is stamped with
 *      "release-<setSlug>" once they're emailed, and anyone already stamped is
 *      skipped. A crash/timeout mid-run is safe to re-run — it resumes rather than
 *      re-emailing everyone. (The previous version had NO marker and its own header
 *      warned "run it ONCE": a partial failure meant either double-emailing the
 *      first N people or abandoning the rest.)
 *
 * NOTE ON lastEditionKey: it is shared with the weekly digest, which writes ISO
 * week keys like "2026-W31". The distinct "release-<slug>" namespace means a blast
 * marks a subscriber done for THIS campaign only; the next weekly digest uses its
 * own week key and is unaffected.
 *
 * Every figure in the email is queried live here and passed in — no store/market/
 * card count is hardcoded in the template (see lib/email.ts).
 *
 * Usage:
 *   # 1. Dry run — prints the audience and the live stats, sends nothing.
 *   RELEASE_DAY_SEND=1 DRY_RUN=1 SET_NAME="Vendetta" SET_SLUG="vendetta" npx tsx scripts/send-release-day.ts
 *   # 2. For real.
 *   RELEASE_DAY_SEND=1 SET_NAME="Vendetta" SET_SLUG="vendetta" npx tsx scripts/send-release-day.ts
 */
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/db";
import { sendReleaseDayEmail, isEmailEnabled, type ReleaseDayStats } from "../src/lib/email";
import { SITE_URL } from "../src/lib/site";
import { setBySlug } from "../src/lib/constants";
import { RETAILER_LIST } from "../src/lib/retailers";
import { COUNTRY_LIST, DEFAULT_COUNTRY, priceField } from "../src/lib/country";
import { getSealedGroups } from "../src/lib/sealed-import";

async function main() {
  if (process.env.RELEASE_DAY_SEND !== "1") {
    console.log("release-day: RELEASE_DAY_SEND!=1 — refusing to send. Set it to actually blast.");
    return;
  }
  const dryRun = process.env.DRY_RUN === "1";
  const setSlug = process.env.SET_SLUG ?? "vendetta";
  const campaign = `release-${setSlug}`;

  const set = setBySlug(setSlug);
  if (!set) {
    console.error(`release-day: unknown set slug "${setSlug}" — refusing to email about a set we don't track.`);
    process.exitCode = 1;
    return;
  }
  // Guard against blasting "it's out!" for a set that isn't. `comingSoon` is the
  // codebase's own source of truth for release status (lib/constants.ts).
  if (set.comingSoon) {
    console.error(`release-day: ${set.name} is still flagged comingSoon — refusing to announce it as released.`);
    process.exitCode = 1;
    return;
  }
  if (!dryRun && !isEmailEnabled()) {
    console.error("release-day: email is not configured (no provider key) — nothing would send. Aborting.");
    process.exitCode = 1;
    return;
  }

  // ── Live stats. Each degrades to null (claim omitted from the email) rather than
  // guessing, so a failed query can never put a wrong number in front of a reader.
  const cardCount = await prisma.card.count({ where: { setCode: set.code } }).catch(() => null);
  const pricedCount = await prisma.card
    .count({ where: { setCode: set.code, [priceField(DEFAULT_COUNTRY)]: { not: null } } })
    .catch(() => null);
  // Sealed: only claim it if this set actually has sealed groups in the live feed.
  const sealedAvailable = await getSealedGroups(DEFAULT_COUNTRY)
    .then((groups) => groups.some((g) => g.setCode === set.code))
    .catch(() => false);

  const stats: ReleaseDayStats = {
    cardCount,
    pricedCount,
    storeCount: RETAILER_LIST.length,
    marketCount: COUNTRY_LIST.length,
    sealedAvailable,
  };

  console.log(
    `release-day: set=${set.name} (${set.code}) cards=${cardCount ?? "?"} priced=${pricedCount ?? "?"} ` +
      `stores=${stats.storeCount} markets=${stats.marketCount} sealed=${sealedAvailable}`
  );
  if (cardCount === 0) {
    console.error("release-day: ZERO cards tracked for this set — refusing to announce a database that's empty.");
    process.exitCode = 1;
    return;
  }

  // Audience: everyone not already emailed for THIS campaign.
  const subs = await prisma.newsletterSubscriber.findMany({
    where: { NOT: { lastEditionKey: campaign } },
    select: { email: true, unsubToken: true, id: true },
  });
  const total = await prisma.newsletterSubscriber.count();
  console.log(
    `release-day: ${subs.length} to send (of ${total} subscribers; ${total - subs.length} already sent this campaign).`
  );

  if (dryRun) {
    console.log("release-day: DRY_RUN=1 — sending nothing.");
    return;
  }

  let sent = 0;
  let failed = 0;
  for (const s of subs) {
    let token = s.unsubToken;
    if (!token) {
      token = randomUUID();
      await prisma.newsletterSubscriber.update({ where: { id: s.id }, data: { unsubToken: token } }).catch(() => {});
    }
    const unsubUrl = `${SITE_URL}/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
    const ok = await sendReleaseDayEmail(s.email, set.name, setSlug, unsubUrl, stats);
    if (ok) {
      sent++;
      // Stamp ONLY on success, so a failed send is retried by the next run rather
      // than silently skipped forever.
      await prisma.newsletterSubscriber
        .update({ where: { id: s.id }, data: { lastEditionKey: campaign } })
        .catch(() => {});
    } else {
      failed++;
    }
    await new Promise((r) => setTimeout(r, 600)); // Resend ~2 req/s
  }
  console.log(
    `release-day: done — ${sent} sent, ${failed} failed (re-run to retry failures; already-sent are skipped).`
  );
}

main()
  .catch((e) => {
    console.error("send-release-day failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
