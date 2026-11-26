import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { stripe } from "@/lib/stripe";
import { premiumCheckoutEnabled } from "@/lib/premium";
import { premiumCors, premiumSiteForOrigin, verifyPremiumSession } from "@/lib/sister-premium";
import { billedByLine, brandFromSurface } from "@/lib/premium-brand";
import { parsePassKind } from "@/lib/premium-pass";
import { PASS_USER_SELECT, passOffersForUser, passSessionParams } from "@/lib/premium-pass-server";

export const dynamic = "force-dynamic";

// A Week Pass or Founder Lifetime bought ON a sister site's /premium page (the price ladder test, lib/premium-pass.ts,
// 7-21 Dec 2026). The sister's browser sends its premium-session token and the pass; we open a one-off Stripe Checkout
// only when the account is offered that pass right now (arm, window, not already paying, Founder seats and account age),
// and return { url }. Entitlement is written by the webhook, never here.
export function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: premiumSiteForOrigin(origin) ? 204 : 403, headers: premiumCors(origin) });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = { ...premiumCors(origin), "Cache-Control": "no-store" };
  const site = premiumSiteForOrigin(origin);
  if (!site) return NextResponse.json({ error: "Not allowed" }, { status: 403, headers });
  if (!rateLimit(`sister-premium-pass:${clientIp(req)}`, 10, 10 * 60_000).ok) return NextResponse.json({ error: "Too many tries." }, { status: 429, headers });
  if (!premiumCheckoutEnabled()) return NextResponse.json({ error: "Checkout isn't available right now." }, { status: 503, headers });
  const body = (await req.json().catch(() => null)) as { token?: unknown; pass?: unknown } | null;
  const kind = parsePassKind(body?.pass);
  if (!kind) return NextResponse.json({ error: "Pick a pass." }, { status: 400, headers });
  const email = await verifyPremiumSession(body?.token, site);
  if (!email) return NextResponse.json({ error: "Sign in again" }, { status: 401, headers });
  try {
    const user = await prisma.user.findUnique({ where: { email }, select: PASS_USER_SELECT });
    if (!user) return NextResponse.json({ error: "Sign in again" }, { status: 401, headers });
    const offers = await passOffersForUser(user);
    if (!offers.some((o) => o.kind === kind)) {
      return NextResponse.json({ error: kind === "founder" ? "Founder places aren't open to this account." : "This pass isn't available right now." }, { status: 409, headers });
    }
    const brand = brandFromSurface(`sister-${site.key}`);
    prisma.premiumClick.create({ data: { userId: user.id, source: "checkout", surface: `sister-${site.key}:pass-${kind}`, tier: "premium" } }).catch(() => {});
    const session = await stripe().checkout.sessions.create(
      passSessionParams({
        kind,
        userId: user.id,
        email: user.email,
        siteKey: site.key,
        billedBy: billedByLine(brand),
        successUrl: `${site.url}/premium?welcome=1`,
        cancelUrl: `${site.url}/premium`,
      }),
    );
    if (!session.url) throw new Error("no checkout url");
    return NextResponse.json({ ok: true, url: session.url }, { headers });
  } catch (e) {
    console.error("[sister-premium] pass checkout failed:", e);
    return NextResponse.json({ error: "Couldn't open checkout. Try again." }, { status: 502, headers });
  }
}
