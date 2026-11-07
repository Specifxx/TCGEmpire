import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isPremium } from "@/lib/premium";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { listMyFeatures, removeFeature, submitFeature } from "@/lib/featured/server";

// A PREMIUM MEMBER'S OWN FEATURED LISTINGS (owner, 2026-11-07; lib/featured/).
// Entitlement, the per-member limit and ownership live in the library; this is
// transport. Nothing a member sends is shown: the sweep reads eBay for that.
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ signedIn: false, premium: false, mine: [] }, { headers: NO_STORE });
  const premium = isPremium(user, "premium");
  return NextResponse.json({ signedIn: true, premium, mine: await listMyFeatures(user.id) }, { headers: NO_STORE });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const rl = rateLimit(`featured-listing:${user.id}`, 20, 3_600_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  const body = (await req.json().catch(() => ({}))) as { link?: unknown };
  const res = await submitFeature(user, String(body.link ?? ""));
  return NextResponse.json(res.body, { status: res.status, headers: NO_STORE });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const res = await removeFeature(user.id, id);
  return NextResponse.json(res.body, { status: res.status, headers: NO_STORE });
}
