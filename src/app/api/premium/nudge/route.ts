import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isPremium, premiumCheckoutEnabled } from "@/lib/premium";
import { getCountry } from "@/lib/get-country";
import { getPremiumNudge, nudgeCopy } from "@/lib/premium-nudge";

export const dynamic = "force-dynamic";

// The personal Premium line for the signed-in slide-in (PremiumSlideIn.tsx) —
// "4 cards you watch are underpriced right now" — or 204 when there is nothing
// specific to say, or nobody to say it to (signed out, already paying, checkout
// off). Called at most once per session, and only at the moment the slide-in
// is about to appear. See lib/premium-nudge.ts for what it costs and reveals.
export async function GET() {
  const none = new NextResponse(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
  try {
    const user = await getCurrentUser();
    if (!user || isPremium(user) || !premiumCheckoutEnabled()) return none;
    const nudge = await getPremiumNudge(user.id, getCountry());
    const copy = nudge ? (nudgeCopy(nudge, "watched") ?? nudgeCopy(nudge, "owned")) : null;
    if (!copy) return none;
    return NextResponse.json(copy, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return none;
  }
}
