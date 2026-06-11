import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getLeaderboard } from "@/lib/games";

export const dynamic = "force-dynamic";

// Top scores for a game + the signed-in player's own rank (if any).
export async function GET(req: Request) {
  const game = new URL(req.url).searchParams.get("game") ?? "";
  const user = await getCurrentUser();
  const board = await getLeaderboard(game, user?.id ?? null, 10);
  if (!board) return NextResponse.json({ error: "Unknown game" }, { status: 404 });
  return NextResponse.json(
    { ...board, signedIn: !!user },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
