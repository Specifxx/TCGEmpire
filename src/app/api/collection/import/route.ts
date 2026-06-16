import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { parseDeckList } from "@/lib/deck";
import { normalizeSearch } from "@/lib/format";

export const dynamic = "force-dynamic";

// Bulk-add cards to the collection from a pasted list (TCGplayer mass-entry style,
// e.g. "3 Jinx, Loose Cannon"). Matches by name (cheapest printing), upserts each
// at NM/non-foil, incrementing quantity. Returns how many were added and any
// unmatched names so the user can fix them.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const text: string = typeof body?.text === "string" ? body.text : "";
  const lines = parseDeckList(text).slice(0, 300).filter((l) => l.name);
  if (!lines.length) return NextResponse.json({ error: "Paste a list like “3 Jinx, Loose Cannon”." }, { status: 400 });

  const nqs = [...new Set(lines.map((l) => normalizeSearch(l.name)))];
  const cards = await prisma.card.findMany({
    where: { nameNormalized: { in: nqs }, isPromo: false },
    select: { id: true, nameNormalized: true, variant: true },
  });
  // Prefer the base print (variant null) when a name has several printings.
  const byName = new Map<string, string>();
  for (const c of cards) {
    if (!byName.has(c.nameNormalized) || c.variant == null) byName.set(c.nameNormalized, c.id);
  }

  // Merge duplicate lines into a single quantity per card.
  const qtyByCard = new Map<string, number>();
  const unmatched: string[] = [];
  for (const l of lines) {
    const cardId = byName.get(normalizeSearch(l.name));
    if (!cardId) {
      unmatched.push(l.name);
      continue;
    }
    qtyByCard.set(cardId, (qtyByCard.get(cardId) ?? 0) + l.qty);
  }

  let added = 0;
  for (const [cardId, qty] of qtyByCard) {
    await prisma.collectionCard
      .upsert({
        where: { userId_cardId_condition_isFoil: { userId: user.id, cardId, condition: "NM", isFoil: false } },
        create: { userId: user.id, cardId, condition: "NM", isFoil: false, quantity: Math.min(999, qty) },
        update: { quantity: { increment: qty } },
      })
      .then(() => { added++; })
      .catch(() => {});
  }

  return NextResponse.json({ ok: true, added, matchedCards: qtyByCard.size, unmatched: [...new Set(unmatched)].slice(0, 30) });
}
