import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { PUBLISHED_DECKS_TAG, checkPublishText, DECK_DAILY_LIMIT } from "@/lib/published-decks";
import { publishDeck } from "@/lib/published-decks-server";

export const dynamic = "force-dynamic";

// Publish a deck from /deck (2026-09-26). Signed-in accounts only — every
// published deck is attributed to someone. Spam protection, in order of how
// much it does: sign-in; a per-account cap of DECK_DAILY_LIMIT publishes per
// 24h counted in the database (global, unlike the in-memory limiter); a burst
// limit; a honeypot; no links in the title or description; the list must be a
// real deck (≥25 matched cards and a Legend). The only write is this explicit
// publish; the library pages are revalidated on demand so it appears at once.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to publish a deck." }, { status: 401 });

  const rl = rateLimit(`deck-publish:${user.id}`, 3, 10 * 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const body = await req.json().catch(() => null);
  if (typeof body?.website === "string" && body.website.trim()) return NextResponse.json({ ok: true, slug: null });

  const text = checkPublishText(body?.title, body?.description);
  if (!text.ok) return NextResponse.json({ error: text.error }, { status: 400 });
  const list = typeof body?.text === "string" ? body.text.slice(0, 20_000) : "";
  if (!list.trim()) return NextResponse.json({ error: "Paste and price your list first." }, { status: 400 });

  try {
    const recent = await prisma.publishedDeck.count({
      where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 86_400_000) } },
    });
    if (recent >= DECK_DAILY_LIMIT) {
      return NextResponse.json({ error: `You can publish up to ${DECK_DAILY_LIMIT} decks a day.` }, { status: 429 });
    }
    const res = await publishDeck({
      title: text.title,
      description: text.description,
      text: list,
      legendCardId: typeof body?.legendCardId === "string" ? body.legendCardId : null,
      userId: user.id,
      authorName: user.displayName || null,
      source: "user",
    });
    if (!res.ok) return NextResponse.json({ error: res.error, legends: res.legends }, { status: 400 });
    revalidatePath("/decks");
    revalidateTag(PUBLISHED_DECKS_TAG);
    revalidatePath(`/decks/legend/${res.legendSlug}`);
    revalidatePath("/deck");
    return NextResponse.json({ ok: true, slug: res.slug });
  } catch {
    return NextResponse.json({ error: "Couldn't publish right now — please try again." }, { status: 500 });
  }
}
