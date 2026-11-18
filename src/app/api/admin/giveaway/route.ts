import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { SITE_URL } from "@/lib/site";
import { CURRENT_GIVEAWAY, giveawayByKey, giveawayState } from "@/lib/giveaway";

export const dynamic = "force-dynamic";

// Draw the giveaway winner (admin only, POST, same origin). Picks uniformly among the
// entries made while it was open (lib/giveaway.ts) and returns the winner's account
// email so the owner can write to them. Nothing is stored or sent: running it twice
// is a fresh draw, so run it once, on the draw date, and note the result.
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== SITE_URL) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Not authorised" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { giveaway?: unknown; exclude?: unknown } | null;
  const g = typeof body?.giveaway === "string" ? giveawayByKey(body.giveaway) : CURRENT_GIVEAWAY;
  if (!g) return NextResponse.json({ error: "No such giveaway" }, { status: 404 });
  if (giveawayState(g, new Date()) !== "closed") return NextResponse.json({ error: "Draw only after entries close." }, { status: 409 });
  // A redraw (winner didn't claim) passes the earlier winner's email to leave out.
  const exclude = typeof body?.exclude === "string" ? body.exclude.toLowerCase().slice(0, 200) : null;
  const entries = await prisma.giveawayEntry.findMany({
    where: { giveaway: g.key, createdAt: { gte: new Date(g.opensAt), lte: new Date(g.closesAt) } },
    select: { userId: true },
    orderBy: { createdAt: "asc" },
  });
  const users = await prisma.user.findMany({ where: { id: { in: entries.map((e) => e.userId) } }, select: { id: true, email: true } });
  const pool = users.filter((u) => u.email && u.email.toLowerCase() !== exclude);
  if (pool.length === 0) return NextResponse.json({ error: "No valid entries." }, { status: 404 });
  const winner = pool[randomInt(pool.length)];
  console.info(`[giveaway] ${g.key} drawn by ${user.id} from ${pool.length} entries`);
  return NextResponse.json({ giveaway: g.key, entries: pool.length, winnerEmail: winner.email });
}
