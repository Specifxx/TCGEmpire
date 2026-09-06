import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// DELETE — stop watching one card.
//
// The path segment is a CARD id, not a PriceAlert row id. Two reasons: the watch
// button knows the card it renders for and nothing else, and "unwatch this card"
// means every market — someone who watched it in AU and again in US wants both
// gone, not one of them left quietly emailing.
//
// Scoping the deleteMany by userId IS the authorisation check. A row belonging to
// somebody else simply is not matched, so there is no 403 branch that can be got
// wrong, and no way to probe whether another account watches a given card.
//
// Deliberately does NOT delete rows with userId = NULL that happen to share this
// account's email. Those are anonymous subscriptions; removing them here would
// silently unsubscribe an address the account never claimed. Signing in adopts
// them (see claimAlertsForUser) — after which they are ordinary owned rows and
// this route removes them like any other.
export async function DELETE(_req: Request, { params }: { params: { cardId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  const res = await prisma.priceAlert.deleteMany({
    where: { userId: user.id, cardId: params.cardId },
  });
  if (res.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true, removed: res.count });
}
