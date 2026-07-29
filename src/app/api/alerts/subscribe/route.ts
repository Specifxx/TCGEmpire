import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { pickPrice, type Country } from "@/lib/country";
import { sendAlertConfirmationEmail } from "@/lib/email";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  // The card ids to watch (the user's wishlist). Capped to keep one request cheap.
  cardIds: z.array(z.string().min(1)).min(1).max(500),
  market: z.enum(["AU", "NZ", "US", "UK", "SG", "CA"]).default("AU"),
});

// Subscribe an email to price-drop alerts for a set of wishlisted cards. No account
// required — this powers the wishlist pop-up. Idempotent: re-subscribing the same
// card is a no-op (we never reset an existing baseline), so repeat hearts are safe.
export async function POST(req: Request) {
  // Limit how fast a single IP can create subscriptions (anti email-bombing).
  const rl = rateLimit(`alerts:sub:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { email, cardIds, market } = parsed.data;

  // Only watch cards that actually exist; capture today's lowest price as the
  // baseline so we alert on FUTURE drops, not on the price they're already at.
  const cards = await prisma.card.findMany({
    where: { id: { in: Array.from(new Set(cardIds)) } },
    select: {
      id: true,
      lowestPriceCents: true,
      lowestPriceCentsNz: true,
      lowestPriceCentsUs: true,
      lowestPriceCentsUk: true,
      lowestPriceCentsSg: true,
      lowestPriceCentsCa: true,
    },
  });
  if (cards.length === 0) {
    return NextResponse.json({ error: "No matching cards" }, { status: 400 });
  }

  // Reuse this email's existing unsubscribe token if it already has alerts, so a
  // single link can unsubscribe every card for the address.
  const existing = await prisma.priceAlert.findFirst({
    where: { email },
    select: { unsubToken: true },
  });
  const unsubToken = existing?.unsubToken ?? randomUUID();

  // createMany + skipDuplicates means re-subscribing an already-watched card is a
  // harmless no-op and never clobbers its tracked baseline.
  const result = await prisma.priceAlert.createMany({
    data: cards.map((c) => ({
      email,
      cardId: c.id,
      market,
      unsubToken,
      lastPriceCents: pickPrice(c, market as Country),
    })),
    skipDuplicates: true,
  });

  // Total cards this email now watches in this market (for the confirmation copy).
  const total = await prisma.priceAlert.count({ where: { email, market } });

  // Confirmation email (no-ops gracefully if email isn't configured). Only send
  // when this request actually added a new watch, to avoid re-confirming on every
  // repeat heart-click.
  if (result.count > 0) {
    const unsubUrl = `${SITE_URL}/unsubscribe?token=${encodeURIComponent(unsubToken)}`;
    // Don't block the response on the network round-trip.
    void sendAlertConfirmationEmail(email, total, unsubUrl);
  }

  return NextResponse.json({ ok: true, added: result.count, watching: total });
}
