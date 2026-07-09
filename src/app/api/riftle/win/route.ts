import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { awardPoints } from "@/lib/points";

export const dynamic = "force-dynamic";

// Fired client-side when a signed-in player solves the DAILY Riftle. awardPoints
// daily-caps "riftle_daily" to once per day, so re-firing (or replaying the solved
// puzzle) never double-awards. No-ops for logged-out visitors (the result screen
// nudges them to sign up). Always 204 — it's a fire-and-forget beacon.
export async function POST() {
  const ok = new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  try {
    const user = await getCurrentUser();
    if (user) await awardPoints(user.id, "riftle_daily").catch(() => {});
  } catch {
    /* never fail a beacon */
  }
  return ok;
}
