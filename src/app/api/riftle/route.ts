import { NextResponse } from "next/server";
import { z } from "zod";
import { riftleDay, getDailyCard, resolveGuess, compareGuess, getPoolNames, getDailyHints, RIFTLE_ATTEMPTS } from "@/lib/riftle";

export const dynamic = "force-dynamic";

// GET → today's puzzle meta + autocomplete names. `?reveal=1` returns the answer
// (used after the player runs out of guesses — honor system, it's a casual game).
// `?hints=1` returns the progressive hint list (loaded lazily when first requested).
export async function GET(req: Request) {
  const day = riftleDay();
  const url = new URL(req.url);
  if (url.searchParams.get("reveal") === "1") {
    const card = await getDailyCard(day);
    return NextResponse.json({ day, card });
  }
  if (url.searchParams.get("hints") === "1") {
    const hints = await getDailyHints(day);
    return NextResponse.json(
      { day, hints },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } }
    );
  }
  const names = await getPoolNames();
  return NextResponse.json(
    { day, attempts: RIFTLE_ATTEMPTS, names },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } }
  );
}

const schema = z.object({ name: z.string().min(1).max(80) });

// POST a guess → per-attribute feedback (and the card itself when correct).
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid guess" }, { status: 400 });

  const guess = await resolveGuess(parsed.data.name);
  if (!guess) return NextResponse.json({ error: "Card not found — pick a name from the suggestions." }, { status: 404 });

  const answer = await getDailyCard();
  if (!answer) return NextResponse.json({ error: "No puzzle today" }, { status: 503 });

  const feedback = compareGuess(guess, answer);
  return NextResponse.json({
    day: riftleDay(),
    feedback,
    ...(feedback.correct ? { card: answer } : {}),
  });
}
