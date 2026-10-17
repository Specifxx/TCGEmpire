import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { coinsEnabledFor, equipBadge } from "@/lib/coins-server";

export const dynamic = "force-dynamic";

// POST { badge: "<id>" | null } — show a badge you've won on your profile, or
// none. Only a badge the member owns can be shown (lib/coins-server.ts equipBadge).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !coinsEnabledFor(user)) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  const rl = rateLimit(`coins:badge:${user.id}`, 20, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const body = await req.json().catch(() => null);
  const badge = body?.badge === null ? null : typeof body?.badge === "string" ? body.badge : undefined;
  if (badge === undefined) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  if (!(await equipBadge(user.id, badge))) return NextResponse.json({ error: "You haven't won that badge" }, { status: 409 });
  return NextResponse.json({ ok: true, badge }, { headers: { "Cache-Control": "no-store" } });
}
