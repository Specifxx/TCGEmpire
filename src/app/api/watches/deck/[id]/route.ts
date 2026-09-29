import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { deleteDeckWatch, updateDeckWatch } from "@/lib/deck-watch";

// One deck price watch: PATCH (target, name, snooze) and DELETE (stop). Owner
// only; target and name edits are Premium's, stop and snooze are any owner's — lib/deck-watch.ts.
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const rl = rateLimit(`deck-watch:${user.id}`, 60, 3_600_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  const body = await req.json().catch(() => null);
  const res = await updateDeckWatch(prisma, user, params.id, body);
  return NextResponse.json(res.body, { status: res.status, headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const res = await deleteDeckWatch(prisma, user, params.id);
  return NextResponse.json(res.body, { status: res.status, headers: { "Cache-Control": "no-store" } });
}
