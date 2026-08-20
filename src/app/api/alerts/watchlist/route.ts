import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { cardTileSelect } from "@/lib/cards";
import { getCountry } from "@/lib/get-country";
import { pickPrice, type Country } from "@/lib/country";

// ─────────────────────────────────────────────────────────────────────────────
// The ACCOUNT-scoped half of price watches.
// ─────────────────────────────────────────────────────────────────────────────
// /api/alerts/subscribe is the anonymous half and stays exactly as it was: an
// email address, no session, no account. This route is what an account adds on
// top — the two things an email-only subscription structurally cannot do:
//   • list what you are watching (nothing links rows to a person);
//   • unwatch ONE card (the only removal was an unsubscribe-everything token).
//
// Rows are still written with `email` as well as `userId`. That is what keeps
// the drop cron (lib/price-alerts.ts) and the one-click unsubscribe working
// untouched — neither of them knows accounts exist.
//
// Session cookie ⇒ cookies() ⇒ never cacheable.
export const dynamic = "force-dynamic";

// GET — every card this account watches, newest first, in cardTileSelect() shape
// so the client can hand each row straight to <CardTile/>.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  const country = getCountry();
  const items = await prisma.priceAlert
    .findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      // Bounded on purpose: the subscribe route caps a single request at 500
      // cards, so this is the most one account can plausibly hold, and an
      // unbounded findMany over a growing table is how egress bills happen.
      take: 500,
      select: {
        id: true,
        cardId: true,
        market: true,
        lastPriceCents: true,
        createdAt: true,
        card: { select: cardTileSelect(country) },
      },
    })
    .catch(() => []);

  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}

const schema = z.object({
  cardId: z.string().min(1).max(64),
  market: z.enum(["AU", "US", "UK", "SG", "CA"]).default("AU"),
});

// POST — watch one card for the signed-in account.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  const rl = rateLimit(`alerts:watch:${user.id}`, 60, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { cardId, market } = parsed.data;

  // Capture today's lowest price as the baseline, so we alert on FUTURE drops
  // rather than on the price they are already looking at.
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    select: {
      id: true,
      lowestPriceCents: true,
      lowestPriceCentsUs: true,
      lowestPriceCentsUk: true,
      lowestPriceCentsSg: true,
      lowestPriceCentsCa: true,
    },
  });
  if (!card) return NextResponse.json({ error: "No matching card" }, { status: 400 });

  // Reuse this address's existing unsubscribe token, so one emailed link still
  // covers every row for the address — account-owned or not.
  const existing = await prisma.priceAlert.findFirst({
    where: { email: user.email },
    select: { unsubToken: true },
  });

  // upsert, NOT createMany: the update branch is what lets an account ADOPT a row
  // the same person created anonymously before signing in. It stamps ownership
  // and deliberately touches nothing else — rewriting lastPriceCents would reset
  // the baseline and swallow the very drop the watch exists to catch.
  const item = await prisma.priceAlert.upsert({
    where: { email_cardId_market: { email: user.email, cardId: card.id, market } },
    update: { userId: user.id },
    create: {
      email: user.email,
      userId: user.id,
      cardId: card.id,
      market,
      unsubToken: existing?.unsubToken ?? randomUUID(),
      lastPriceCents: pickPrice(card, market as Country),
    },
  });

  return NextResponse.json({ ok: true, id: item.id });
}
