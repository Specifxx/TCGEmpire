import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { coinState, coinsEnabledFor } from "@/lib/coins-server";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

// GET — the signed-in member's coins (lib/coins-server.ts coinState): wallet,
// collection and today's tasks. Signed-out and non-Premium viewers get only
// whether they could play, so /coins can show the locked collection.
export async function GET() {
  const user = await getCurrentUser();
  const headers = { "Cache-Control": "no-store" };
  if (!user) return NextResponse.json({ signedIn: false, eligible: false }, { headers });
  if (!coinsEnabledFor(user)) return NextResponse.json({ signedIn: true, eligible: false }, { headers });
  // The invite link is the referral program's own (lib/referral.ts, /profile).
  const inviteUrl = `${SITE_URL}/?ref=${user.id}`;
  return NextResponse.json({ signedIn: true, eligible: true, inviteUrl, state: await coinState(user.id) }, { headers });
}
