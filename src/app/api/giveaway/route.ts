import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { entryMilestone as milestone } from "@/lib/giveaway-run";
import { SITE_URL } from "@/lib/site";
import { isGiveawayTeamEmail } from "@/lib/admin-emails";
import { CURRENT_GIVEAWAY, giveawayByKey, giveawayState, type Giveaway } from "@/lib/giveaway";
import { giveawayAction, myGiveaway, type Account } from "@/lib/giveaway-server";

export const dynamic = "force-dynamic";

// RiftCompare's own giveaway entry box (lib/giveaway.ts, lib/giveaway-server.ts). Per user, uncached, select-limited: the static
// /giveaway page asks this after mount, so the page itself never reads a cookie. GET is the account's points; POST
// { action: enter | checkin | claim-bonus | show-name } acts and answers the same. Sister sites use /api/sister-giveaway.
const noStore = { "Cache-Control": "no-store" };

function pick(key: string | null | undefined): Giveaway | null {
  const g = key ? giveawayByKey(key) : CURRENT_GIVEAWAY;
  return g && g.site === "rift" ? g : null;
}

function account(u: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>): Account {
  return { id: u.id, email: u.email, isAdmin: u.isAdmin, premiumUntil: u.premiumUntil, emailVerified: u.emailVerified };
}

export async function GET(req: Request) {
  const g = pick(new URL(req.url).searchParams.get("giveaway"));
  if (!g) return NextResponse.json({ error: "No such giveaway." }, { status: 404, headers: noStore });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ state: giveawayState(g, new Date()), signedIn: false }, { headers: noStore });
  try {
    return NextResponse.json(await myGiveaway(g, account(user), isGiveawayTeamEmail, SITE_URL), { headers: noStore });
  } catch (e) {
    console.error("[giveaway] status failed:", e);
    return NextResponse.json({ error: "Couldn't load your entry. Try again." }, { status: 503, headers: noStore });
  }
}

export async function POST(req: Request) {
  // Same-origin only: an entry is made from our own page.
  const origin = req.headers.get("origin");
  if (origin && origin !== SITE_URL && !origin.endsWith("://localhost:3000")) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403, headers: noStore });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to enter." }, { status: 401, headers: noStore });
  const rl = rateLimit(`giveaway:${user.id}`, 30, 60 * 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  const body = (await req.json().catch(() => null)) as { giveaway?: unknown; action?: unknown; showName?: unknown } | null;
  const g = pick(typeof body?.giveaway === "string" ? body.giveaway : null);
  if (!g) return NextResponse.json({ error: "No such giveaway." }, { status: 404, headers: noStore });
  // Older pages posted no action: that was an entry.
  const action = body?.action ?? (typeof body?.showName === "boolean" ? "show-name" : "enter");
  try {
    const r = await giveawayAction(g, account(user), action, { showName: body?.showName, site: null });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status, headers: noStore });
    if (r.first) await milestone(g);
    return NextResponse.json({ ok: true, ...(await myGiveaway(g, account(user), isGiveawayTeamEmail, SITE_URL)) }, { headers: noStore });
  } catch (e) {
    console.error("[giveaway] action failed:", e);
    return NextResponse.json({ error: "Couldn't save that. Please try again." }, { status: 503, headers: noStore });
  }
}
