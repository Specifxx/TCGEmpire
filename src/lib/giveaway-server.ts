import { prisma } from "@/lib/db";
import { entryWeight, type EntryReason } from "@/lib/giveaway";

// Server-side half of the giveaway (lib/giveaway.ts is pure). Per request, uncached, select-limited, called only
// from /api/giveaway, /api/admin/giveaway and /admin/giveaway: never from a public page.

export interface LiveWeight {
  weight: number;
  reason: EntryReason;
  /** Confirmed friends who joined through this account's invite link while the giveaway was open (before the cap). */
  referrals: number;
  referralEntries: number;
  /** Price alerts (by account or email) and sealed watches the account holds now. */
  watches: number;
  /** Admins run the site, and the rules exclude them from the draw. */
  admin: boolean;
}

type WeightUser = { id: string; email: string; isAdmin: boolean; premiumUntil: Date | null };

/** Each account's entries right now (lib/giveaway.ts entryWeight). */
export async function liveWeights(
  giveaway: string,
  users: WeightUser[],
  isAdminEmail: (e: string) => boolean,
): Promise<Map<string, LiveWeight>> {
  const out = new Map<string, LiveWeight>();
  if (users.length === 0) return out;
  const ids = users.map((u) => u.id);
  const emails = users.map((u) => u.email.toLowerCase());
  const [byUser, byEmail, sealed, refs] = await Promise.all([
    prisma.priceAlert.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _count: { _all: true } }).catch(() => []),
    prisma.priceAlert.groupBy({ by: ["email"], where: { email: { in: emails } }, _count: { _all: true } }).catch(() => []),
    prisma.sealedWatch.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _count: { _all: true } }).catch(() => []),
    prisma.giveawayReferral
      .findMany({ where: { giveaway, referrerId: { in: ids } }, select: { referrerId: true, referredId: true }, take: 20_000 })
      .catch(() => []),
  ]);
  // A referral counts once the friend's account has a confirmed email, and never for the inviter's own account.
  const confirmed = new Set(
    (
      await prisma.user
        .findMany({ where: { id: { in: refs.map((r) => r.referredId) }, emailVerified: { not: null } }, select: { id: true } })
        .catch(() => [])
    ).map((u) => u.id),
  );
  const refCount = new Map<string, number>();
  for (const r of refs) {
    if (r.referrerId === r.referredId || !confirmed.has(r.referredId)) continue;
    refCount.set(r.referrerId, (refCount.get(r.referrerId) ?? 0) + 1);
  }
  const watches = new Map<string, number>();
  const add = (k: string | null, n: number) => k && watches.set(k, (watches.get(k) ?? 0) + n);
  for (const r of byUser) add(r.userId, r._count._all);
  for (const r of sealed) add(r.userId, r._count._all);
  const emailCount = new Map(byEmail.map((r) => [r.email, r._count._all] as const));
  const now = Date.now();
  for (const u of users) {
    const premium = !!u.premiumUntil && u.premiumUntil.getTime() > now;
    const referrals = refCount.get(u.id) ?? 0;
    const held = (watches.get(u.id) ?? 0) + (emailCount.get(u.email.toLowerCase()) ?? 0);
    const w = entryWeight({ premium, watches: held, referrals });
    out.set(u.id, { ...w, referrals, watches: held, admin: u.isAdmin || isAdminEmail(u.email) });
  }
  return out;
}

export interface Entrant {
  userId: string;
  name: string;
  email: string;
  country: string | null;
  enteredAt: Date;
  weight: number;
  reason: EntryReason;
  referrals: number;
  showName: boolean;
  admin: boolean;
  // Conversion (lib/giveaway.ts giveawayFunnel).
  newAccount: boolean;
  fromGiveawayPage: boolean;
  watches: number;
  lastActiveAt: Date | null;
}

/** Every entry of one giveaway made inside its window, with its account and its entries (the higher of stored and live). */
export async function giveawayEntrants(
  g: { key: string; opensAt: string; closesAt: string },
  isAdminEmail: (e: string) => boolean,
): Promise<Entrant[]> {
  const entries = await prisma.giveawayEntry.findMany({
    where: { giveaway: g.key, createdAt: { gte: new Date(g.opensAt), lte: new Date(g.closesAt) } },
    select: { userId: true, createdAt: true, weight: true, showName: true },
    orderBy: { createdAt: "asc" },
    take: 50_000,
  });
  const users = await prisma.user.findMany({
    where: { id: { in: entries.map((e) => e.userId) } },
    select: {
      id: true,
      email: true,
      displayName: true,
      preferredCountry: true,
      isAdmin: true,
      premiumUntil: true,
      createdAt: true,
      signupSource: true,
      lastActiveAt: true,
    },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  const live = await liveWeights(g.key, users, isAdminEmail);
  const out: Entrant[] = [];
  for (const e of entries) {
    const u = byId.get(e.userId);
    if (!u?.email) continue;
    const l = live.get(u.id);
    const weight = Math.max(e.weight ?? 1, l?.weight ?? 1);
    out.push({
      userId: u.id,
      name: u.displayName,
      email: u.email,
      country: u.preferredCountry,
      enteredAt: e.createdAt,
      weight,
      reason: l && l.weight >= weight ? l.reason : weight > 1 ? "premium" : "base",
      referrals: l?.referrals ?? 0,
      showName: e.showName,
      admin: l?.admin ?? false,
      newAccount: u.createdAt >= new Date(g.opensAt),
      fromGiveawayPage: u.signupSource === "giveaway",
      watches: l?.watches ?? 0,
      lastActiveAt: u.lastActiveAt,
    });
  }
  return out;
}
