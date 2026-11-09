import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { stripeEnabled } from "@/lib/stripe";
import { allowedOrigin, corsHeaders } from "@/lib/sister-alerts/sites";
import { validateAd } from "@/lib/sister-ads/core";
import { createOrder } from "@/lib/sister-ads/server";

export const dynamic = "force-dynamic";

// THE SISTER SITES' "FEATURE YOUR LISTING" FORM (owner, 2026-11-09). Called
// cross-origin from a sister site's /advertise page (exact origins, no wildcard,
// like /api/sister-alerts). It validates the form, saves the order and returns a
// Stripe Checkout URL; nothing is shown anywhere until the owner approves it.
export function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: allowedOrigin(origin) ? 204 : 403, headers: corsHeaders(origin) });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = { ...corsHeaders(origin), "Cache-Control": "no-store" };
  const fromSite = allowedOrigin(origin);
  if (!fromSite) return NextResponse.json({ error: "Not allowed" }, { status: 403, headers });
  if (!stripeEnabled()) return NextResponse.json({ error: "Payments are not switched on yet. Please try again later." }, { status: 503, headers });
  const rl = rateLimit(`sister-ads:${clientIp(req)}`, 6, 10 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many tries. Please wait a few minutes." }, { status: 429, headers: { ...headers, "Retry-After": String(rl.retryAfter) } });
  const body = await req.json().catch(() => null);
  const v = validateAd(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400, headers });
  if (body?.terms !== true) return NextResponse.json({ error: "Please tick the box to agree to the listing rules." }, { status: 400, headers });
  try {
    const { url } = await createOrder(fromSite.key, v.ad);
    return NextResponse.json({ ok: true, url }, { headers });
  } catch (e) {
    console.warn("[sister-ads] order failed:", e);
    return NextResponse.json({ error: "Couldn't start checkout. Please try again." }, { status: 503, headers });
  }
}
