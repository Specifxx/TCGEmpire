import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getPointsState } from "@/lib/points";

export const dynamic = "force-dynamic";

// Current user's Shard standing (balance, level, streak, owned rewards, history).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ signedIn: false }, { status: 200 });
  const state = await getPointsState(user.id);
  return NextResponse.json({ signedIn: true, ...state }, { headers: { "Cache-Control": "no-store" } });
}
