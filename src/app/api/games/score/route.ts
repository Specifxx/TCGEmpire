import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { submitScore, isGameKey } from "@/lib/games";

export const dynamic = "force-dynamic";

const schema = z.object({
  game: z.string().refine(isGameKey, "Unknown game"),
  score: z.number().finite(),
  seconds: z.number().int().min(0).max(86400).optional(),
});

// Record a finished game's score to the leaderboard. Auth required — a 401 is how
// the client knows to show the "sign in to save your score" prompt.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "signin" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid score" }, { status: 400 });

  const result = await submitScore(user.id, parsed.data.game, parsed.data.score, parsed.data.seconds);
  if (!result) return NextResponse.json({ error: "Invalid game" }, { status: 400 });
  return NextResponse.json({ ok: true, ...result });
}
