import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createGradedWatch, deleteGradedWatch, listGradedWatches } from "@/lib/graded-watch";

// GRADED WATCHES (Plus and Premium, 2026-10-09): one grade of one card in a
// market, checked by the paid alert run after each price import
// (lib/graded-watch.ts). Entitlement (403 without a paid tier), the per-member
// ceiling (409) and ownership live there; this is transport.
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const cardId = new URL(req.url).searchParams.get("cardId") ?? "";
  if (!cardId) return NextResponse.json({ watches: [] }, { headers: NO_STORE });
  return NextResponse.json({ watches: await listGradedWatches(user.id, cardId) }, { headers: NO_STORE });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const rl = rateLimit(`graded-watch:${user.id}`, 60, 3_600_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  const body = (await req.json().catch(() => ({}))) as { cardId?: unknown; market?: unknown; grade?: unknown };
  const res = await createGradedWatch(user, String(body.cardId ?? ""), String(body.market ?? ""), String(body.grade ?? ""));
  return NextResponse.json(res.body, { status: res.status, headers: NO_STORE });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const res = await deleteGradedWatch(user.id, id);
  return NextResponse.json(res.body, { status: res.status, headers: NO_STORE });
}
