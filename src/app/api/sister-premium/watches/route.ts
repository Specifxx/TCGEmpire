import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { premiumCors, premiumSiteForOrigin, premiumStatusFor, verifyPremiumSession } from "@/lib/sister-premium";
import { isRestockTarget } from "@/lib/sister-alerts/evaluate";

export const dynamic = "force-dynamic";

// A member's own watches on one sister site: list them, stop one. Token-authenticated
// (lib/sister-premium.ts), scoped to the token's address and the calling site, and
// open to any signed-in account (a lapsed member can still see and stop what they set).
export function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: premiumSiteForOrigin(origin) ? 204 : 403, headers: premiumCors(origin) });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = { ...premiumCors(origin), "Cache-Control": "no-store" };
  const site = premiumSiteForOrigin(origin);
  if (!site) return NextResponse.json({ error: "Not allowed" }, { status: 403, headers });
  const rl = rateLimit(`sister-premium-w:${clientIp(req)}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers });
  const body = (await req.json().catch(() => null)) as { token?: unknown; remove?: unknown } | null;
  const email = await verifyPremiumSession(body?.token, site);
  if (!email) return NextResponse.json({ error: "Sign in again" }, { status: 401, headers });
  try {
    if (typeof body?.remove === "string" && /^[a-z0-9]{10,40}$/i.test(body.remove)) {
      await prisma.sisterAlert.deleteMany({ where: { id: body.remove, email, site: site.key } });
    }
    const status = await premiumStatusFor(email);
    if (!status) return NextResponse.json({ error: "Sign in again" }, { status: 401, headers });
    const rows = await prisma.sisterAlert.findMany({
      where: { email, site: site.key },
      select: { id: true, productId: true, region: true, targetCents: true, name: true, path: true, lastPriceCents: true, lastNotifiedAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    return NextResponse.json(
      {
        ok: true,
        premium: status.premium,
        watches: rows.map((r) => ({
          id: r.id,
          kind: isRestockTarget(r.targetCents) ? "restock" : "price",
          region: r.region,
          targetCents: isRestockTarget(r.targetCents) ? null : r.targetCents,
          name: r.name,
          path: r.path,
          priceCents: r.lastPriceCents,
          notifiedAt: r.lastNotifiedAt ? r.lastNotifiedAt.toISOString() : null,
        })),
      },
      { headers },
    );
  } catch (e) {
    console.warn("[sister-premium] watches failed:", e);
    return NextResponse.json({ error: "Couldn't load your watches. Try again." }, { status: 503, headers });
  }
}
