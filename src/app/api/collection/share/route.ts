import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  enableCollectionShare,
  rotateCollectionShare,
  disableCollectionShare,
  shareUrlForCollection,
} from "@/lib/share";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Current share state for the signed-in user. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { collectionShareId: true } });
  const token = row?.collectionShareId ?? null;
  return NextResponse.json({ shared: token != null, url: token ? shareUrlForCollection(token) : null });
}

/**
 * Turn sharing on (`action: "enable"`, the default) or mint a fresh token
 * (`action: "rotate"`).
 *
 * Rate-limited despite being cheap, because rotation is the revocation
 * mechanism: someone hammering it would churn tokens and could invalidate a
 * link mid-share. Twenty an hour is far more than any real use and low enough
 * to be harmless.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  const rl = rateLimit(`coll-share:${clientIp(req)}:${user.id}`, 20, 3600_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const body = (await req.json().catch(() => null)) as { action?: string } | null;
  const rotate = body?.action === "rotate";
  const token = rotate ? await rotateCollectionShare(user.id) : await enableCollectionShare(user.id);
  return NextResponse.json({ shared: true, url: shareUrlForCollection(token), rotated: rotate });
}

/** Turn sharing off. The public page 404s from the next request onwards. */
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  await disableCollectionShare(user.id);
  return NextResponse.json({ shared: false, url: null });
}
