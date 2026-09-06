import { NextResponse } from "next/server";
import { z } from "zod";
import {
  riftleDay,
  getDailyCard,
  getCardForSeed,
  resolveGuess,
  compareGuess,
  getPoolNames,
  getDailyHints,
  getHintsForSeed,
  RIFTLE_ATTEMPTS,
} from "@/lib/riftle";

export const dynamic = "force-dynamic";

// Unlimited-mode seeds come from the client. Namespace them server-side so a player
// can never craft a seed that resolves to a future daily puzzle (`riftle:<day>`).
const seedSchema = z.string().min(1).max(64);
function unlimitedSeed(raw: string): string {
  return `unlimited:${raw}`;
}

// GET → today's puzzle meta + autocomplete names.
//   ?reveal=1[&seed=…]  → the answer (after a player runs out of guesses; honor system)
//   ?hints=1[&seed=…]   → the progressive hint list (loaded lazily when first asked for)
// A `seed` selects an Unlimited-mode card; without one we use today's daily card.
export async function GET(req: Request) {
  const day = riftleDay();
  const url = new URL(req.url);
  const seedParam = url.searchParams.get("seed");
  const seed = seedParam && seedSchema.safeParse(seedParam).success ? seedParam : null;

  try {
    if (url.searchParams.get("reveal") === "1") {
      const card = seed ? await getCardForSeed(unlimitedSeed(seed)) : await getDailyCard(day);
      return NextResponse.json({ day, card });
    }
    if (url.searchParams.get("hints") === "1") {
      const hints = seed ? await getHintsForSeed(unlimitedSeed(seed)) : await getDailyHints(day);
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
  } catch {
    return NextResponse.json({ error: "Couldn't load today's puzzle — please try again." }, { status: 500 });
  }
}

const schema = z.object({ name: z.string().min(1).max(80), seed: seedSchema.optional() });

// POST a guess → per-attribute feedback (and the card itself when correct). A `seed`
// scores the guess against that Unlimited-mode card; otherwise against today's daily.
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid guess" }, { status: 400 });

  try {
    const guess = await resolveGuess(parsed.data.name);
    if (!guess) return NextResponse.json({ error: "Card not found — pick a name from the suggestions." }, { status: 404 });

    const answer = parsed.data.seed
      ? await getCardForSeed(unlimitedSeed(parsed.data.seed))
      : await getDailyCard();
    if (!answer) return NextResponse.json({ error: "No puzzle today" }, { status: 503 });

    const feedback = compareGuess(guess, answer);
    return NextResponse.json({
      day: riftleDay(),
      feedback,
      ...(feedback.correct ? { card: answer } : {}),
    });
  } catch {
    return NextResponse.json({ error: "Couldn't check that guess — please try again." }, { status: 500 });
  }
}
