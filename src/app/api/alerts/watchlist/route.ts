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
//
// ?ids=1 — card ids only. lib/use-watchlist.ts calls this on EVERY signed-in
// page view (the header's watch control and every tile's heart), and all it
// builds is a Set of card ids; the full shape below carries a card tile plus a
// per-card RetailerPrice _count subquery for each of up to 500 rows. Only the
// watchlist itself (Watchlist.tsx: /watching and the drawer) needs that.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  if (new URL(req.url).searchParams.get("ids") === "1") {
    const ids = await prisma.priceAlert
      .findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 500,
        select: { cardId: true },
      })
      .catch(() => []);
    return NextResponse.json({ items: ids }, { headers: { "Cache-Control": "no-store" } });
  }

  // ?targets=1 — how many of this account's watches carry a target price, and
  // nothing else: the "N of 25 used" count for a target field rendered away
  // from the watchlist (PriceAlertModal), which has no rows to count. One
  // indexed count, no rows returned. null on a failed count: the field then
  // shows no count rather than a wrong one.
  if (new URL(req.url).searchParams.get("targets") === "1") {
    const used = await prisma.priceAlert
      .count({ where: { userId: user.id, targetCents: { not: null } } })
      .catch(() => null);
    return NextResponse.json({ used }, { headers: { "Cache-Control": "no-store" } });
  }

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
        // "Watching from": the price at creation (null on rows older than the
        // column — the client falls back to lastPriceCents).
        startPriceCents: true,
        // The member's "notify me at" price, for the row's target field and
        // the "N of 25 used" count.
        targetCents: true,
        createdAt: true,
        card: { select: cardTileSelect(country) },
      },
    })
    .catch(() => []);

  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}

const schema = z.object({
  cardId: z.string().min(1).max(64),
  market: z.enum(["AU", "US", "UK", "SG", "CA", "EU"]).default("AU"),
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
      lowestPriceCentsEu: true,
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
  // startPriceCents is written in the create branch ONLY — it is "the price
  // when you started watching", so adopting an older anonymous row keeps that
  // row's own start.
  const price = pickPrice(card, market as Country);
  const item = await prisma.priceAlert.upsert({
    where: { email_cardId_market: { email: user.email, cardId: card.id, market } },
    update: { userId: user.id },
    create: {
      email: user.email,
      userId: user.id,
      cardId: card.id,
      market,
      unsubToken: existing?.unsubToken ?? randomUUID(),
      lastPriceCents: price,
      startPriceCents: price,
    },
  });

  return NextResponse.json({ ok: true, id: item.id });
}
