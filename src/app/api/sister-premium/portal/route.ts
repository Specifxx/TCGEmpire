import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { stripe, stripeEnabled } from "@/lib/stripe";
import { premiumCors, premiumSiteForOrigin, verifyPremiumSession } from "@/lib/sister-premium";

export const dynamic = "force-dynamic";

// Stripe's billing portal for a member signed in on the sister site (card, invoices, cancel), returning to that site's /premium.
export function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: premiumSiteForOrigin(origin) ? 204 : 403, headers: premiumCors(origin) });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = { ...premiumCors(origin), "Cache-Control": "no-store" };
  const site = premiumSiteForOrigin(origin);
  if (!site) return NextResponse.json({ error: "Not allowed" }, { status: 403, headers });
  if (!rateLimit(`sister-premium-portal:${clientIp(req)}`, 10, 10 * 60_000).ok) return NextResponse.json({ error: "Too many tries." }, { status: 429, headers });
  if (!stripeEnabled()) return NextResponse.json({ error: "Billing isn't available right now." }, { status: 503, headers });
  const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
  const email = await verifyPremiumSession(body?.token, site);
  if (!email) return NextResponse.json({ error: "Sign in again" }, { status: 401, headers });
  const user = await prisma.user.findUnique({ where: { email }, select: { stripeCustomerId: true } });
  if (!user?.stripeCustomerId) return NextResponse.json({ error: "No subscription on this account." }, { status: 400, headers });
  try {
    const s = await stripe().billingPortal.sessions.create({ customer: user.stripeCustomerId, return_url: `${site.url}/premium` });
    return NextResponse.json({ ok: true, url: s.url }, { headers });
  } catch (e) {
    console.error("[sister-premium] portal failed:", e);
    return NextResponse.json({ error: "Couldn't open billing. Try again." }, { status: 502, headers });
  }
}
