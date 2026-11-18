/**
 * Retention census — read-only, aggregate counts only (job logs are public:
 * no emails, names or ids). The baseline for the retention programme
 * (2026-11-18): accounts and how many come back, watches and alerts, email
 * subscribers, and the sister sites' members, alerts and weekly-drops sign-ups.
 *
 * Usage: npx tsx scripts/retention-census.ts
 */
import { prisma } from "../src/lib/db";
import { NOT_SEED_WHERE } from "../src/lib/premium";

const DAY = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * DAY);

async function safe<T>(label: string, f: () => Promise<T>): Promise<T | string> {
  try {
    return await f();
  } catch (e) {
    return `unreadable (${label}: ${(e as Error).message.split("\n")[0].slice(0, 80)})`;
  }
}

async function main() {
  const real = NOT_SEED_WHERE;
  const u = (extra: object) => prisma.user.count({ where: { AND: [real, extra] } });
  const out: Record<string, unknown> = {};

  out["accounts.total"] = await u({});
  out["accounts.new7d"] = await u({ createdAt: { gte: ago(7) } });
  out["accounts.new30d"] = await u({ createdAt: { gte: ago(30) } });
  out["accounts.active7d"] = await u({ lastActiveAt: { gte: ago(7) } });
  out["accounts.active30d"] = await u({ lastActiveAt: { gte: ago(30) } });
  out["accounts.activeDays>=2"] = await u({ activeDays: { gte: 2 } });
  out["accounts.activeDays>=5"] = await u({ activeDays: { gte: 5 } });
  // Of accounts created 8-37 days ago: how many were active again 7+ days after sign-up.
  const cohort = await prisma.user.findMany({
    where: { AND: [real, { createdAt: { gte: ago(37), lt: ago(8) } }] },
    select: { createdAt: true, lastActiveAt: true, activeDays: true },
  });
  out["cohort8to37d.size"] = cohort.length;
  out["cohort8to37d.backAfter7d"] = cohort.filter(
    (c) => c.lastActiveAt && c.lastActiveAt.getTime() - c.createdAt.getTime() >= 7 * DAY,
  ).length;
  out["cohort8to37d.activeDays>=2"] = cohort.filter((c) => c.activeDays >= 2).length;
  out["accounts.dormant30d(signed up >30d, not active 30d)"] = await u({
    createdAt: { lt: ago(30) },
    OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: ago(30) } }],
  });
  const bySource = await safe("signupSource", () =>
    prisma.user.groupBy({ by: ["signupSource"], where: { AND: [real, { createdAt: { gte: ago(30) } }] }, _count: true }),
  );
  out["accounts.new30d.bySource"] = Array.isArray(bySource)
    ? Object.fromEntries(bySource.map((r) => [r.signupSource ?? "unknown", r._count]))
    : bySource;

  out["watchlist.rows"] = await safe("pa", () => prisma.priceAlert.count({ where: { userId: { not: null } } }));
  out["watchlist.accountsWithAny"] = await safe("pa", async () =>
    (await prisma.priceAlert.groupBy({ by: ["userId"], where: { userId: { not: null } } })).length,
  );
  out["priceAlerts.emailOnlyRows"] = await safe("pa", () => prisma.priceAlert.count({ where: { userId: null } }));
  out["priceAlerts.distinctEmails"] = await safe("pa", async () => (await prisma.priceAlert.groupBy({ by: ["email"] })).length);
  out["priceAlerts.new7d"] = await safe("pa", () => prisma.priceAlert.count({ where: { createdAt: { gte: ago(7) } } }));
  out["priceAlerts.notified30d"] = await safe("pa", () => prisma.priceAlert.count({ where: { lastNotifiedAt: { gte: ago(30) } } }));
  out["sealedWatch.rows"] = await safe("sw", () => prisma.sealedWatch.count());
  out["deckWatch.rows"] = await safe("dw", () => prisma.deckWatch.count());
  out["gradedWatch.rows"] = await safe("gw", () => prisma.gradedWatch.count());
  out["setReleaseAlert.distinctEmails"] = await safe("sra", async () => (await prisma.setReleaseAlert.groupBy({ by: ["email"] })).length);
  out["collection.accountsWithCards"] = await safe("cc", async () => (await prisma.collectionCard.groupBy({ by: ["userId"] })).length);
  out["collection.rows"] = await safe("cc", () => prisma.collectionCard.count());
  out["newsletter.subscribers"] = await safe("ns", () => prisma.newsletterSubscriber.count());
  out["userDigest.optedOut"] = await safe("udo", () => prisma.userDigestOptOut.count({ where: { optedOutAt: { not: null } } }));

  out["sister.addresses.confirmed"] = await safe("saa", () => prisma.sisterAlertAddress.count({ where: { confirmedAt: { not: null } } }));
  out["sister.addresses.unconfirmed"] = await safe("saa", () => prisma.sisterAlertAddress.count({ where: { confirmedAt: null } }));
  const per = async (name: string, f: () => Promise<{ site: string; _count: number }[]>) => {
    const r = await safe(name, f);
    out[name] = Array.isArray(r) ? Object.fromEntries(r.map((x) => [x.site, x._count])) : r;
  };
  await per("sister.alerts.bySite", () => prisma.sisterAlert.groupBy({ by: ["site"], _count: true }) as never);
  await per("sister.alerts.new7d.bySite", () =>
    prisma.sisterAlert.groupBy({ by: ["site"], where: { createdAt: { gte: ago(7) } }, _count: true }) as never,
  );
  await per("sister.alerts.notified30d.bySite", () =>
    prisma.sisterAlert.groupBy({ by: ["site"], where: { lastNotifiedAt: { gte: ago(30) } }, _count: true }) as never,
  );
  const emailsBySite = await safe("sa-emails", () => prisma.sisterAlert.groupBy({ by: ["site", "email"] }));
  if (Array.isArray(emailsBySite)) {
    const m: Record<string, number> = {};
    for (const r of emailsBySite) m[r.site] = (m[r.site] ?? 0) + 1;
    out["sister.alerts.distinctEmails.bySite"] = m;
  }
  await per("sister.members.bySite", () => prisma.sisterMember.groupBy({ by: ["site"], _count: true }) as never);
  await per("sister.members.new7d.bySite", () =>
    prisma.sisterMember.groupBy({ by: ["site"], where: { firstLinkedAt: { gte: ago(7) } }, _count: true }) as never,
  );
  await per("sister.members.back7d.bySite", () =>
    prisma.sisterMember.groupBy({
      by: ["site"],
      where: { lastLinkedAt: { gte: ago(7) }, firstLinkedAt: { lt: ago(7) } },
      _count: true,
    }) as never,
  );
  await per("sister.weeklyDigest.bySite", () => prisma.sisterDigest.groupBy({ by: ["site"], _count: true }) as never);
  await per("sister.weeklyDigest.sent14d.bySite", () =>
    prisma.sisterDigest.groupBy({ by: ["site"], where: { lastSentAt: { gte: ago(14) } }, _count: true }) as never,
  );

  console.log("RETENTION CENSUS " + new Date().toISOString());
  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error("retention-census failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
