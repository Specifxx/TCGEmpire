import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { awardCheckin, getPointsState } from "@/lib/points";

export const dynamic = "force-dynamic";

// Claim the daily check-in (once per UTC day). Returns the reward + fresh state.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const result = await awardCheckin(user.id);
  const state = await getPointsState(user.id);
  return NextResponse.json({ ...result, state });
}
