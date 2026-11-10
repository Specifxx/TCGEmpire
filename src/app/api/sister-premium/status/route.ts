import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { maskEmail, premiumCors, premiumSiteForOrigin, premiumStatusFor, verifyPremiumSession } from "@/lib/sister-premium";

export const dynamic = "force-dynamic";

// Is this sister-site token a Premium member right now? (lib/sister-premium.ts)
// Called from the sister's browser only (exact origin). Returns the address
// masked, whether Premium is active and when it ends: nothing else.
export function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: premiumSiteForOrigin(origin) ? 204 : 403, headers: premiumCors(origin) });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = { ...premiumCors(origin), "Cache-Control": "no-store" };
  const site = premiumSiteForOrigin(origin);
  if (!site) return NextResponse.json({ error: "Not allowed" }, { status: 403, headers });
  const rl = rateLimit(`sister-premium:${clientIp(req)}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers });
  const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
  const email = await verifyPremiumSession(body?.token, site);
  if (!email) return NextResponse.json({ error: "Sign in again" }, { status: 401, headers });
  try {
    const s = await premiumStatusFor(email);
    if (!s) return NextResponse.json({ error: "Sign in again" }, { status: 401, headers });
    return NextResponse.json({ ok: true, premium: s.premium, until: s.until, who: maskEmail(email) }, { headers });
  } catch (e) {
    console.warn("[sister-premium] status failed:", e);
    return NextResponse.json({ error: "Couldn't check your membership. Try again." }, { status: 503, headers });
  }
}
