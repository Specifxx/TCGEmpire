import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { awardPoints } from "@/lib/points";

export const dynamic = "force-dynamic";

// Fired client-side when a signed-in player solves the DAILY Riftle. Dedupes on the
// actual SYDNEY puzzle day (the puzzle rotates at Sydney midnight), computed
// server-side so it can't be gamed by the client — so re-firing or replaying the
// solved puzzle never double-awards, and a genuinely-new daily solve always awards
// (the old UTC dailyCap was ~10h out of phase and did neither reliably). No-ops for
// logged-out visitors. Always 204 — it's a fire-and-forget beacon.
function sydneyPuzzleDay(): string {
  // en-CA formats as YYYY-MM-DD; the Sydney timezone matches the puzzle's rotation.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date());
}

export async function POST() {
  const ok = new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  try {
    const user = await getCurrentUser();
    if (user) await awardPoints(user.id, "riftle_daily", { dedupeKey: `riftle:${sydneyPuzzleDay()}` }).catch(() => {});
  } catch {
    /* never fail a beacon */
  }
  return ok;
}
