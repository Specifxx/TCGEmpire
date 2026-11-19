import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { notifyOwnerBounded } from "@/lib/ops/notify-owner";
import { SITE_URL } from "@/lib/site";
import { isAdminEmail } from "@/lib/admin-emails";
import { CURRENT_GIVEAWAY, giveawayByKey, giveawayState, notifyOnCount, type Giveaway } from "@/lib/giveaway";
import { liveWeights } from "@/lib/giveaway-server";

export const dynamic = "force-dynamic";

// The giveaway entry (lib/giveaway.ts). Per user, uncached, select-limited: the
// static /giveaway page asks this after mount, so the page itself never reads a
// cookie. GET says whether the signed-in account has entered; POST enters it.
const noStore = { "Cache-Control": "no-store" };

type Me = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** The signed-in account's entries now, with what earned them. */
async function mine(g: Giveaway, user: Me) {
  const w = (
    await liveWeights(g.key, [{ id: user.id, email: user.email, isAdmin: user.isAdmin, premiumUntil: user.premiumUntil }], isAdminEmail)
  ).get(user.id);
  return w ?? { weight: 1, reason: "base" as const, referrals: 0, referralEntries: 0, admin: false };
}

export async function GET() {
  const g = CURRENT_GIVEAWAY;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ state: giveawayState(g, new Date()), signedIn: false }, { headers: noStore });
  const entry = await prisma.giveawayEntry
    .findUnique({ where: { giveaway_userId: { giveaway: g.key, userId: user.id } }, select: { weight: true, showName: true } })
    .catch(() => null);
  const w = await mine(g, user).catch(() => null);
  return NextResponse.json(
    {
      state: giveawayState(g, new Date()),
      signedIn: true,
      emailVerified: !!user.emailVerified,
      entered: !!entry,
      entries: entry ? Math.max(entry.weight, w?.weight ?? 1) : (w?.weight ?? 1),
      reason: w?.reason ?? "base",
      referrals: w?.referrals ?? 0,
      showName: entry?.showName ?? true,
      inviteUrl: `${SITE_URL}/giveaway?ref=${encodeURIComponent(user.id)}`,
    },
    { headers: noStore },
  );
}

export async function POST(req: Request) {
  // Same-origin only: an entry is made from our own page.
  const origin = req.headers.get("origin");
  if (origin && origin !== SITE_URL && !origin.endsWith("://localhost:3000")) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403, headers: noStore });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to enter." }, { status: 401, headers: noStore });
  const rl = rateLimit(`giveaway:${user.id}`, 10, 60 * 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  if (!user.emailVerified) {
    return NextResponse.json({ error: "Confirm your email address first, so we can reach you if you win." }, { status: 403, headers: noStore });
  }
  const body = (await req.json().catch(() => null)) as { giveaway?: unknown; showName?: unknown } | null;
  const g = typeof body?.giveaway === "string" ? giveawayByKey(body.giveaway) : CURRENT_GIVEAWAY;
  if (!g) return NextResponse.json({ error: "No such giveaway." }, { status: 404, headers: noStore });
  const state = giveawayState(g, new Date());
  if (state !== "open") {
    return NextResponse.json({ error: state === "upcoming" ? "Entries aren't open yet." : "Entries have closed." }, { status: 409, headers: noStore });
  }
  const w = await mine(g, user).catch(() => null);
  const weight = w?.weight ?? 1;
  const showName = typeof body?.showName === "boolean" ? body.showName : undefined;
  try {
    const existing = await prisma.giveawayEntry.findUnique({
      where: { giveaway_userId: { giveaway: g.key, userId: user.id } },
      select: { id: true, weight: true },
    });
    if (existing) {
      // Pressing again (or changing the name setting) raises the entry's count to what it has earned now; never lowers it.
      const updated = await prisma.giveawayEntry.update({
        where: { id: existing.id },
        data: { weight: Math.max(existing.weight, weight), ...(showName === undefined ? {} : { showName }) },
        select: { weight: true, showName: true },
      });
      return NextResponse.json({ ok: true, entered: true, already: true, entries: updated.weight, showName: updated.showName }, { headers: noStore });
    }
    await prisma.giveawayEntry.create({ data: { giveaway: g.key, userId: user.id, weight, showName: showName ?? true }, select: { id: true } });
  } catch (e) {
    // A double click races the unique key: already entered = success.
    if ((e as { code?: string })?.code === "P2002") return NextResponse.json({ ok: true, entered: true, already: true }, { headers: noStore });
    console.error("[giveaway] entry failed:", e);
    return NextResponse.json({ error: "Couldn't save your entry. Please try again." }, { status: 503, headers: noStore });
  }
  const count = await prisma.giveawayEntry.count({ where: { giveaway: g.key } }).catch(() => 0);
  if (notifyOnCount(count)) {
    await notifyOwnerBounded({
      kind: "giveaway",
      headline: `${g.title}: ${count} ${count === 1 ? "entry" : "entries"}`,
      fields: [
        ["Giveaway", g.key],
        ["Closes", g.closesAt],
        ["Draw", `${SITE_URL}/admin/giveaway`],
      ],
    });
  }
  return NextResponse.json({ ok: true, entered: true, entries: weight, showName: showName ?? true }, { headers: noStore });
}
