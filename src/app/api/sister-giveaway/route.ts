import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { isAdminEmail } from "@/lib/admin-emails";
import { premiumCors, premiumSiteForOrigin, verifyPremiumSession } from "@/lib/sister-premium";
import { giveawayFor, type GiveawaySite } from "@/lib/giveaway";
import { accountByEmail, giveawayAction, myGiveaway } from "@/lib/giveaway-server";
import { entryMilestone as milestone } from "@/lib/giveaway-run";

export const dynamic = "force-dynamic";

// A sister site's giveaway entry box (DexCompare, MTG Compare, YGO Compare; lib/giveaway.ts). Called from the sister's browser
// only (exact-origin CORS) with the premium-session token RiftCompare signed for that site (lib/sister-premium.ts). The site's
// giveaway is the one lib/giveaway.ts lists for it. { token } answers the account's points; with { action } it acts first.
const SITES: GiveawaySite[] = ["dex", "mtg", "ygo", "op"];

export function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: premiumSiteForOrigin(origin) ? 204 : 403, headers: premiumCors(origin) });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = { ...premiumCors(origin), "Cache-Control": "no-store" };
  const site = premiumSiteForOrigin(origin);
  const key = site && (SITES as string[]).includes(site.key) ? (site.key as GiveawaySite) : null;
  if (!site || !key) return NextResponse.json({ error: "Not allowed" }, { status: 403, headers });
  if (!rateLimit(`sister-giveaway:${clientIp(req)}`, 40, 60_000).ok) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers });
  const g = giveawayFor(key, new Date());
  if (!g) return NextResponse.json({ error: "No giveaway here yet." }, { status: 404, headers });
  const body = (await req.json().catch(() => null)) as { token?: unknown; action?: unknown; showName?: unknown; ref?: unknown } | null;
  const email = await verifyPremiumSession(body?.token, site);
  if (!email) return NextResponse.json({ error: "Sign in again" }, { status: 401, headers });
  try {
    const user = await accountByEmail(email);
    if (!user) return NextResponse.json({ error: "Sign in again" }, { status: 401, headers });
    if (body?.action !== undefined) {
      const r = await giveawayAction(g, user, body.action, { showName: body.showName, site: key, ref: body.ref });
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status, headers });
      if (r.first) await milestone(g);
    }
    return NextResponse.json({ ok: true, giveaway: g.key, ...(await myGiveaway(g, user, isAdminEmail, site.url)) }, { headers });
  } catch (e) {
    console.warn("[sister-giveaway] failed:", e);
    return NextResponse.json({ error: "Couldn't reach the giveaway. Try again." }, { status: 503, headers });
  }
}
