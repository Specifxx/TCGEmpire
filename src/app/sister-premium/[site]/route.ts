import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { premiumSite, signPremiumSession } from "@/lib/sister-premium";

export const dynamic = "force-dynamic";

// "Sign in with RiftCompare" for a sister site's Premium (lib/sister-premium.ts).
// Signed out: the ordinary /login, which returns here. Signed in: sign a
// premium-session token for the signed-in address and send the browser back to
// the SISTER's /premium/return, with the token in the URL FRAGMENT (never sent to
// any server or logged). The destination is fixed per site, never a parameter.
export async function GET(req: Request, { params }: { params: { site: string } }) {
  const site = premiumSite(params.site);
  if (!site) return new NextResponse("Not found", { status: 404 });
  const user = await getCurrentUser();
  if (!user) {
    const origin = new URL(req.url).origin;
    return NextResponse.redirect(`${origin}/login?next=${encodeURIComponent(`/sister-premium/${site.key}`)}`, 303);
  }
  const token = await signPremiumSession(site, user.email.toLowerCase());
  return NextResponse.redirect(`${site.url}/premium/return#t=${token}`, { status: 303, headers: { "Cache-Control": "no-store" } });
}
