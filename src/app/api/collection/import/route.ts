import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { parseDeckList } from "@/lib/deck";
import { normalizeSearch } from "@/lib/format";
import { addCopies, collectionRowStore } from "@/lib/collection-add";

export const dynamic = "force-dynamic";

// Bulk-add cards to the collection from a pasted list (TCGplayer mass-entry style,
// e.g. "3 Jinx, Loose Cannon"). Matches by name (cheapest printing), adds each at
// NM/non-foil, incrementing quantity. Returns how many cards gained copies, the
// names already at the 999 cap (nothing added), and any unmatched names so the
// user can fix them.
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
  const nameByCard = new Map<string, string>(); // as the user typed it, for the "full" list
  const unmatched: string[] = [];
  for (const l of lines) {
    const cardId = byName.get(normalizeSearch(l.name));
    if (!cardId) {
      unmatched.push(l.name);
      continue;
    }
    qtyByCard.set(cardId, (qtyByCard.get(cardId) ?? 0) + l.qty);
    if (!nameByCard.has(cardId)) nameByCard.set(cardId, l.name);
  }

  // Rows this import lands on, read once: every line is NM/non-foil, so these
  // are the rows addCopies writes below. One capped query (≤ 300 ids), three
  // narrow columns, handed to addCopies as its first read — the same rule as
  // the single-card POST (lib/collection-add.ts): adding copies to a row that
  // records a TOTAL scales that total with the count instead of treating the new
  // copies as free, a row with no recorded cost stays unknown, the row never
  // passes the 999 cap, and each write is one guarded increment, so a POST that
  // lands mid-import is counted rather than overwritten.
  const ids = [...qtyByCard.keys()];
  // No `.catch(() => [])`: an empty answer here would silently take the old
  // "new copies are free" path. A failed read fails the import instead.
  const existingRows = ids.length
    ? await prisma.collectionCard.findMany({
        where: { userId: user.id, cardId: { in: ids }, condition: "NM", isFoil: false },
        select: { cardId: true, quantity: true, costBasisCents: true, costBasisIsTotal: true },
        take: ids.length,
      })
    : [];
  const existingBy = new Map(existingRows.map((r) => [r.cardId, r]));

  let added = 0;
  const full: string[] = [];
  for (const [cardId, qty] of qtyByCard) {
    const store = collectionRowStore(prisma, { userId: user.id, cardId, condition: "NM", isFoil: false });
    const res = await addCopies(store, { quantity: qty }, { existing: existingBy.get(cardId) ?? null }).catch(() => null);
    if (res?.status === "added") added++;
    // Already at the cap: nothing changed, so it is not counted as added.
    else if (res?.status === "full") full.push(nameByCard.get(cardId) ?? cardId);
  }

  return NextResponse.json({
    ok: true,
    added,
    matchedCards: qtyByCard.size,
    full: full.slice(0, 30),
    unmatched: [...new Set(unmatched)].slice(0, 30),
  });
}
