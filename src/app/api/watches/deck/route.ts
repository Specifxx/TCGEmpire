import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCountry } from "@/lib/get-country";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createDeckWatch, listDeckWatches } from "@/lib/deck-watch";

// DECK PRICE WATCHES (Premium, 2026-09-29): the account's saved lists that the
// paid alert run prices after every import (lib/deck-watch.ts). The logic —
// entitlement (402 without Premium), DECK_WATCH_LIMIT (409), validation and
// ownership — is lib/deck-watch.ts; this is the transport. The market is the
// viewer's, fixed on the row at creation.
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const res = await listDeckWatches(prisma, user);
  return NextResponse.json(res.body, { status: res.status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const rl = rateLimit(`deck-watch:${user.id}`, 30, 3_600_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  const body = await req.json().catch(() => null);
  const res = await createDeckWatch(prisma, user, body, getCountry());
  return NextResponse.json(res.body, { status: res.status, headers: { "Cache-Control": "no-store" } });
}
