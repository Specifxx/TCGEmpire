import { prisma } from "@/lib/db";
import { contributionPoints } from "@/lib/contributions-server";
import {
  APP_POINTS_CAP,
  assignTickets,
  checkinDay,
  entryPoints,
  giveawayState,
  publicName,
  REFERRAL_POINTS,
  STAR_FRIEND_CHECKINS,
  STAR_REFERRAL_POINTS,
  type EntryReason,
  type Giveaway,
  type Points,
} from "@/lib/giveaway";

// Server-side half of the giveaways (lib/giveaway.ts is pure). Per request, uncached, select-limited, called only from
// /api/giveaway, /api/sister-giveaway, /api/giveaway/leaderboard, /api/admin/giveaway, /admin/giveaway and the draw:
// never from a public page.

export interface LiveWeight extends Points {
  /** Points: kept as `weight` so the draw, CSV and leaderboard read one number. */
  weight: number;
  /** Confirmed friends who joined through this account's invite link while the giveaway was open (before the cap). */
  referrals: number;
  /** Price alerts (by account or email) and sealed watches the account holds now. */
  watches: number;
  checkins: number;
  /** Admins run the site, and the rules exclude them from the draw. */
  admin: boolean;
}

type WeightUser = { id: string; email: string; isAdmin: boolean; premiumUntil: Date | null };
type WindowGiveaway = Pick<Giveaway, "key" | "opensAt" | "closesAt">;

/** Each account's points right now (lib/giveaway.ts entryPoints). */
export async function liveWeights(
  g: WindowGiveaway,
  users: WeightUser[],
  isAdminEmail: (e: string) => boolean,
): Promise<Map<string, LiveWeight>> {
  const out = new Map<string, LiveWeight>();
  if (users.length === 0) return out;
  const ids = users.map((u) => u.id);
  const emails = users.map((u) => u.email.toLowerCase());
  const window = { gte: new Date(g.opensAt), lte: new Date(g.closesAt) };
  const [byUser, byEmail, sealed, refs, checkins, claims, contrib, apps] = await Promise.all([
    prisma.priceAlert.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _count: { _all: true } }).catch(() => []),
    prisma.priceAlert.groupBy({ by: ["email"], where: { email: { in: emails } }, _count: { _all: true } }).catch(() => []),
    prisma.sealedWatch.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _count: { _all: true } }).catch(() => []),
    prisma.giveawayReferral
      .findMany({ where: { giveaway: g.key, referrerId: { in: ids } }, select: { referrerId: true, referredId: true }, take: 20_000 })
      .catch(() => []),
    prisma.giveawayCheckin
      .groupBy({ by: ["userId"], where: { giveaway: g.key, userId: { in: ids }, createdAt: window }, _count: { _all: true } })
      .catch(() => []),
    prisma.giveawayEntry
      .findMany({ where: { giveaway: g.key, userId: { in: ids }, bonusClaimedAt: { not: null } }, select: { userId: true } })
      .catch(() => []),
    contributionPoints(ids, window).catch(() => new Map<string, number>()),
    prisma.giveawayEntry
      .findMany({ where: { giveaway: g.key, userId: { in: ids }, appClaimedAt: window }, select: { userId: true } })
      .catch(() => []),
  ]);
  // A referral counts once the friend's account has a confirmed email, and never for the inviter's own account. A star friend
  // (lib/giveaway.ts STAR_REFERRAL_POINTS) also has Premium now, or STAR_FRIEND_CHECKINS check-ins in this giveaway.
  const friendIds = [...new Set(refs.map((r) => r.referredId))];
  const [friends, friendCheckins] = await Promise.all([
    prisma.user
      .findMany({ where: { id: { in: friendIds }, emailVerified: { not: null } }, select: { id: true, premiumUntil: true } })
      .catch(() => []),
    friendIds.length
      ? prisma.giveawayCheckin
          .groupBy({ by: ["userId"], where: { giveaway: g.key, userId: { in: friendIds }, createdAt: window }, _count: { _all: true } })
          .catch(() => [])
      : Promise.resolve([]),
  ]);
  const confirmed = new Set(friends.map((u) => u.id));
  const friendActive = new Map(friendCheckins.map((r) => [r.userId, r._count._all] as const));
  const nowMs = Date.now();
  const star = new Set(
    friends
      .filter((u) => (u.premiumUntil && u.premiumUntil.getTime() > nowMs) || (friendActive.get(u.id) ?? 0) >= STAR_FRIEND_CHECKINS)
      .map((u) => u.id),
  );
  const refCount = new Map<string, number>();
  const starCount = new Map<string, number>();
  for (const r of refs) {
    if (r.referrerId === r.referredId || !confirmed.has(r.referredId)) continue;
    refCount.set(r.referrerId, (refCount.get(r.referrerId) ?? 0) + 1);
    if (star.has(r.referredId)) starCount.set(r.referrerId, (starCount.get(r.referrerId) ?? 0) + 1);
  }
  const watches = new Map<string, number>();
  const add = (k: string | null, n: number) => k && watches.set(k, (watches.get(k) ?? 0) + n);
  for (const r of byUser) add(r.userId, r._count._all);
  for (const r of sealed) add(r.userId, r._count._all);
  const emailCount = new Map(byEmail.map((r) => [r.email, r._count._all] as const));
  const checkinCount = new Map(checkins.map((r) => [r.userId, r._count._all] as const));
  const claimed = new Set(claims.map((c) => c.userId));
  const appOpened = new Set(apps.map((a) => a.userId));
  const now = Date.now();
  for (const u of users) {
    const premium = !!u.premiumUntil && u.premiumUntil.getTime() > now;
    const referrals = refCount.get(u.id) ?? 0;
    const held = (watches.get(u.id) ?? 0) + (emailCount.get(u.email.toLowerCase()) ?? 0);
    const c = checkinCount.get(u.id) ?? 0;
    const p = entryPoints({ premium, watches: held, bonusClaimed: claimed.has(u.id), checkins: c, referrals, starReferrals: starCount.get(u.id) ?? 0, contributions: contrib.get(u.id) ?? 0, app: appOpened.has(u.id) });
    out.set(u.id, { ...p, weight: p.points, referrals, watches: held, checkins: c, admin: u.isAdmin || isAdminEmail(u.email) });
  }
  return out;
}

export interface Entrant {
  userId: string;
  name: string;
  email: string;
  country: string | null;
  enteredAt: Date;
  /** Points (tickets). */
  weight: number;
  reason: EntryReason;
  referrals: number;
  checkins: number;
  showName: boolean;
  admin: boolean;
  site: string | null;
  // Conversion (lib/giveaway.ts giveawayFunnel).
  newAccount: boolean;
  fromGiveawayPage: boolean;
  watches: number;
  lastActiveAt: Date | null;
}

/** Every entry of one giveaway made inside its window, with its account and its points. */
export async function giveawayEntrants(g: WindowGiveaway, isAdminEmail: (e: string) => boolean): Promise<Entrant[]> {
  const entries = await prisma.giveawayEntry.findMany({
    where: { giveaway: g.key, createdAt: { gte: new Date(g.opensAt), lte: new Date(g.closesAt) } },
    select: { userId: true, createdAt: true, showName: true, site: true },
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
  const live = await liveWeights(g, users, isAdminEmail);
  const out: Entrant[] = [];
  for (const e of entries) {
    const u = byId.get(e.userId);
    if (!u?.email) continue;
    const l = live.get(u.id);
    out.push({
      userId: u.id,
      name: u.displayName,
      email: u.email,
      country: u.preferredCountry,
      enteredAt: e.createdAt,
      weight: l?.weight ?? 10,
      reason: l?.reason ?? "base",
      referrals: l?.referrals ?? 0,
      checkins: l?.checkins ?? 0,
      showName: e.showName,
      admin: l?.admin ?? false,
      site: e.site,
      newAccount: u.createdAt >= new Date(g.opensAt),
      fromGiveawayPage: u.signupSource === "giveaway",
      watches: l?.watches ?? 0,
      lastActiveAt: u.lastActiveAt,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// One account's view and actions, the same for RiftCompare's session and a sister's token.

export interface MyGiveaway {
  state: "upcoming" | "open" | "closed";
  signedIn: true;
  emailVerified: boolean;
  entered: boolean;
  points: number;
  breakdown: { entry: number; bonus: number; bonusVia: string | null; checkin: number; referral: number; contribution: number; app: number; referralsCounted: number; starCounted: number };
  /** TCG Prices' launch draw: whether this entrant has the home-screen points, and how many of the APP_POINTS_CAP are left. */
  app: { claimed: boolean; left: number } | null;
  checkins: number;
  checkedInToday: boolean;
  /** Consecutive Sydney days checked in, ending today or yesterday. */
  streak: number;
  premium: boolean;
  showName: boolean;
  tickets: { from: number; to: number; total: number } | null;
  inviteUrl: string;
  referralPoints: number;
  starReferralPoints: number;
  starFriendCheckins: number;
}

export type Account = { id: string; email: string; isAdmin: boolean; premiumUntil: Date | null; emailVerified: Date | boolean | null };

export async function accountByEmail(email: string): Promise<Account | null> {
  return prisma.user
    .findUnique({ where: { email }, select: { id: true, email: true, isAdmin: true, premiumUntil: true, emailVerified: true } })
    .catch(() => null);
}

function streakOf(days: string[], today: string): number {
  const set = new Set(days);
  const d = new Date(`${today}T12:00:00Z`);
  // Today not yet checked in: the streak still stands from yesterday.
  if (!set.has(today)) d.setUTCDate(d.getUTCDate() - 1);
  let n = 0;
  while (set.has(d.toISOString().slice(0, 10))) {
    n++;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return n;
}

export async function myGiveaway(g: Giveaway, user: Account, isAdminEmail: (e: string) => boolean, inviteBase: string): Promise<MyGiveaway> {
  const now = new Date();
  const [entry, w, days] = await Promise.all([
    prisma.giveawayEntry.findUnique({ where: { giveaway_userId: { giveaway: g.key, userId: user.id } }, select: { showName: true } }),
    liveWeights(g, [user], isAdminEmail).then((m) => m.get(user.id)),
    prisma.giveawayCheckin.findMany({ where: { giveaway: g.key, userId: user.id }, select: { day: true }, orderBy: { day: "desc" }, take: 120 }),
  ]);
  const today = checkinDay(now);
  const dayList = days.map((d) => d.day);
  let tickets: MyGiveaway["tickets"] = null;
  if (entry && giveawayState(g, now) === "closed") {
    const all = (await giveawayEntrants(g, isAdminEmail)).filter((e) => !e.admin);
    const { runs, total } = assignTickets(all);
    const mine = runs.find((r) => r.userId === user.id);
    if (mine) tickets = { from: mine.from, to: mine.to, total };
  }
  const p = w ?? entryPoints({ premium: false, watches: 0, bonusClaimed: false, checkins: 0, referrals: 0 });
  return {
    state: giveawayState(g, now),
    signedIn: true,
    emailVerified: !!user.emailVerified,
    entered: !!entry,
    points: entry ? p.points : 0,
    breakdown: { entry: p.entry, bonus: p.bonus, bonusVia: p.bonusVia, checkin: p.checkin, referral: p.referral, contribution: p.contribution, app: p.app, referralsCounted: p.referralsCounted, starCounted: p.starCounted },
    app: g.site === "tcgprices" ? { claimed: p.app > 0, left: await appPointsLeft(g) } : null,
    checkins: w?.checkins ?? 0,
    checkedInToday: dayList.includes(today),
    streak: streakOf(dayList, today),
    premium: !!user.premiumUntil && user.premiumUntil.getTime() > now.getTime(),
    showName: entry?.showName ?? true,
    tickets,
    inviteUrl: `${inviteBase}/giveaway?ref=${encodeURIComponent(user.id)}`,
    referralPoints: REFERRAL_POINTS,
    starReferralPoints: STAR_REFERRAL_POINTS,
    starFriendCheckins: STAR_FRIEND_CHECKINS,
  };
}

export type ActionResult = { ok: true } | { ok: false; status: number; error: string };

/** enter | checkin | claim-bonus | show-name. Entering also checks in for today. */
export async function giveawayAction(
  g: Giveaway,
  user: Account,
  action: unknown,
  opts: { showName?: unknown; site?: string | null; ref?: unknown } = {},
): Promise<ActionResult & { first?: boolean }> {
  const state = giveawayState(g, new Date());
  if (state !== "open") return { ok: false, status: 409, error: state === "upcoming" ? "Entries aren't open yet." : "Entries have closed." };
  if (!user.emailVerified) return { ok: false, status: 403, error: "Confirm your email address first, so we can reach you if you win." };
  const key = { giveaway_userId: { giveaway: g.key, userId: user.id } };
  const existing = await prisma.giveawayEntry.findUnique({ where: key, select: { id: true } });
  if (action === "enter") {
    let first = false;
    if (!existing) {
      try {
        await prisma.giveawayEntry.create({
          data: { giveaway: g.key, userId: user.id, weight: 10, showName: typeof opts.showName === "boolean" ? opts.showName : true, site: opts.site ?? null },
          select: { id: true },
        });
        first = true;
      } catch (e) {
        if ((e as { code?: string })?.code !== "P2002") throw e;
      }
      if (first && typeof opts.ref === "string") await creditReferral(g, opts.ref, user.id);
    }
    await checkIn(g, user.id);
    return { ok: true, first };
  }
  if (!existing) return { ok: false, status: 409, error: "Enter the giveaway first." };
  if (action === "checkin") {
    await checkIn(g, user.id);
    return { ok: true };
  }
  if (action === "claim-bonus") {
    await prisma.giveawayEntry.update({ where: key, data: { bonusClaimedAt: new Date() }, select: { id: true } });
    return { ok: true };
  }
  // TCG Prices' launch: opened from the home screen. Once per entrant, for the first APP_POINTS_CAP of the draw.
  if (action === "app" && g.site === "tcgprices") {
    const had = await prisma.giveawayEntry.findUnique({ where: key, select: { appClaimedAt: true } });
    if (had?.appClaimedAt) return { ok: true };
    if ((await appPointsLeft(g)) <= 0) return { ok: false, status: 409, error: "The home-screen points have all gone." };
    await prisma.giveawayEntry.update({ where: key, data: { appClaimedAt: new Date() }, select: { id: true } });
    return { ok: true };
  }
  if (action === "show-name" && typeof opts.showName === "boolean") {
    await prisma.giveawayEntry.update({ where: key, data: { showName: opts.showName }, select: { id: true } });
    return { ok: true };
  }
  return { ok: false, status: 400, error: "Unknown action." };
}

/** How many of APP_POINTS_CAP are left in this draw. */
export async function appPointsLeft(g: Giveaway): Promise<number> {
  const n = await prisma.giveawayEntry.count({ where: { giveaway: g.key, appClaimedAt: { not: null } } }).catch(() => APP_POINTS_CAP);
  return Math.max(0, APP_POINTS_CAP - n);
}

async function checkIn(g: Giveaway, userId: string): Promise<void> {
  await prisma.giveawayCheckin
    .create({ data: { giveaway: g.key, userId, day: checkinDay(new Date()) }, select: { id: true } })
    .catch((e: unknown) => {
      if ((e as { code?: string })?.code !== "P2002") throw e;
    });
}

/**
 * A sister-site invite (`?ref=<RiftCompare account id>` on its /giveaway): credited when the friend's account is new (created in
 * the last day) and entering this giveaway for the first time, never to themselves. RiftCompare's own invites go through
 * lib/referral.ts at sign-up.
 */
async function creditReferral(g: Giveaway, ref: string, newUserId: string): Promise<void> {
  if (ref === newUserId || ref.length > 40) return;
  const [referrer, friend] = await Promise.all([
    prisma.user.findUnique({ where: { id: ref }, select: { id: true } }).catch(() => null),
    prisma.user.findUnique({ where: { id: newUserId }, select: { createdAt: true } }).catch(() => null),
  ]);
  if (!referrer || !friend || Date.now() - friend.createdAt.getTime() > 86_400_000) return;
  await prisma.giveawayReferral.create({ data: { giveaway: g.key, referrerId: referrer.id, referredId: newUserId }, select: { id: true } }).catch(() => {});
}

// ---------------------------------------------------------------------------------------------------------------
// The public view: counts, the top 100, and the winner once drawn. No email, no id.

export interface PublicWinner {
  name: string;
  country: string | null;
  ticket: number;
  totalTickets: number;
  entrants: number;
  drandRound: number;
  randomness: string;
  attempt: number;
  status: string;
  drawnAt: string;
}

export async function latestWinner(giveaway: string): Promise<PublicWinner | null> {
  const draws = await prisma.giveawayDraw
    .findMany({ where: { giveaway }, orderBy: { attempt: "desc" }, take: 1 })
    .catch(() => []);
  const d = draws[0];
  if (!d) return null;
  return {
    name: d.publicName,
    country: d.country,
    ticket: d.ticket,
    totalTickets: d.totalTickets,
    entrants: d.entrants,
    drandRound: d.drandRound,
    randomness: d.randomness,
    attempt: d.attempt,
    status: d.status,
    drawnAt: d.drawnAt.toISOString(),
  };
}

export async function publicBoard(g: Giveaway, isAdminEmail: (e: string) => boolean) {
  const all = (await giveawayEntrants(g, isAdminEmail)).filter((e) => !e.admin);
  const points = all.reduce((s, e) => s + e.weight, 0);
  const top = [...all]
    .sort((a, b) => b.weight - a.weight || a.enteredAt.getTime() - b.enteredAt.getTime())
    .slice(0, 100)
    .map((e) => ({ name: publicName(e.name, e.showName), points: e.weight }));
  return { entrants: all.length, points, top };
}
