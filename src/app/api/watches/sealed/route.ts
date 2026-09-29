import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCountry } from "@/lib/get-country";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createSealedWatch, listSealedWatches } from "@/lib/sealed-watch";

// SEALED WATCHES (Plus and Premium, 2026-09-29): one sealed product in the
// viewer's market, checked by the paid alert run after each sealed import
// (lib/sealed-watch.ts). Entitlement (402 without a paid tier), the Plus cap
// (409, SEALED_WATCH_LIMIT_PLUS) and ownership live there; this is transport.
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const res = await listSealedWatches(prisma, user);
  return NextResponse.json(res.body, { status: res.status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const rl = rateLimit(`sealed-watch:${user.id}`, 60, 3_600_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  const body = await req.json().catch(() => null);
  const res = await createSealedWatch(prisma, user, body, getCountry());
  return NextResponse.json(res.body, { status: res.status, headers: { "Cache-Control": "no-store" } });
}
