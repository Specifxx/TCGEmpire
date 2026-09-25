import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import type { Country } from "@/lib/country";
import { sendAlertConfirmationEmail } from "@/lib/email";
import { claimConfirmationSlot, confirmationCards } from "@/lib/alert-confirmations";
import { alertBaselineSeed, alertPairKey, computeAlertPrices, type AlertPrice } from "@/lib/alert-price";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  // The card ids to watch (the user's wishlist). Capped to keep one request cheap.
  cardIds: z.array(z.string().min(1)).min(1).max(500),
  market: z.enum(["AU", "US", "UK", "SG", "CA", "EU"]).default("AU"),
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

  // Attach ownership when this request happens to carry a session AND that
  // session's address matches the one being subscribed. Someone signed in who
  // reaches this older modal path gets an account-owned row, so it shows up on
  // /watchlist rather than becoming an invisible email-only watch.
  //
  // THE EMAIL COMPARISON IS THE SECURITY BOUNDARY. The address arrives in the
  // request body, so trusting it alone would let any signed-in user POST a
  // stranger's address and claim that person's watches. No session, or a
  // mismatched address, stays NULL — which is simply the anonymous flow,
  // unchanged.
  const me = await getCurrentUser();
  const userId = me && me.email === email ? me.id : null;

  // Only watch cards that actually exist.
  const cards = await prisma.card.findMany({
    where: { id: { in: Array.from(new Set(cardIds)) } },
    select: {
      id: true,
      // For the confirmation email's card list (new addresses only).
      name: true,
      slug: true,
      setCode: true,
      collectorNumber: true,
    },
  });
  if (cards.length === 0) {
    return NextResponse.json({ error: "No matching cards" }, { status: 400 });
  }

  // Reuse this email's existing unsubscribe token if it already has alerts, so a
  // single link can unsubscribe every card for the address. Also the "is this a
  // new address?" check the confirmation email below keys on.
  const existing = await prisma.priceAlert.findFirst({
    where: { email },
    select: { unsubToken: true },
  });
  const unsubToken = existing?.unsubToken ?? randomUUID();

  // THE BASELINE: today's ALERT PRICE (lib/alert-price.ts — cheapest in-stock
  // Near-Mint or unstated copy at a store, never eBay), the figure every
  // trigger compares, so we alert on FUTURE moves; null when no store has it,
  // so its first listing fires "now listed" (alertBaselineSeed). Read only for
  // cards this address does not already watch here — re-hearting a watched
  // card, the common case, costs one tiny id read — in ONE bounded query
  // (slim: no URLs). A failed read saves nothing: a guessed baseline is what
  // sent the eBay-priced "back in stock" emails.
  const already = existing
    ? await prisma.priceAlert.findMany({
        where: { email, market, cardId: { in: cards.map((c) => c.id) } },
        select: { cardId: true },
        take: 500,
      })
    : [];
  const watched = new Set(already.map((r) => r.cardId));
  const fresh = cards.filter((c) => !watched.has(c.id));
  let prices: Map<string, AlertPrice>;
  try {
    prices = fresh.length
      ? await computeAlertPrices(prisma, fresh.map((c) => ({ cardId: c.id, market })), new Date(), { slim: true })
      : new Map();
  } catch {
    return NextResponse.json({ error: "Couldn't read today's prices. Please try again." }, { status: 503 });
  }

  // createMany + skipDuplicates means re-subscribing an already-watched card is a
  // harmless no-op and never clobbers its tracked baseline. startPriceCents is
  // the "watching from" figure: written here, once — only by the cron's
  // one-time reset of a pre-alert-price baseline after that.
  const result = await prisma.priceAlert.createMany({
    data: fresh.map((c) => ({
      email,
      userId,
      cardId: c.id,
      market,
      unsubToken,
      ...alertBaselineSeed(prices.get(alertPairKey(market, c.id))),
    })),
    skipDuplicates: true,
  });

  // Total cards this email now watches in this market (for the confirmation copy).
  const total = await prisma.priceAlert.count({ where: { email, market } });

  // Confirmation email (no-ops gracefully if email isn't configured). Sent only
  // to an address with NO earlier PriceAlert row (`existing`, read above) —
  // a returning address already had its confirmation, and re-confirming on
  // every new card was one email per heart-click. And only while under a
  // GLOBAL daily cap on confirmations actually sent (lib/alert-confirmations.ts:
  // Resend's 100/day quota is shared, and this route has no double opt-in).
  // The slot is claimed last, so only a confirmation that is about to go out
  // is counted. A capped confirmation costs nothing but the courtesy email —
  // the watch itself is saved either way.
  if (result.count > 0 && !existing && (await claimConfirmationSlot(prisma))) {
    // Don't block the response on the price lookup or the network round-trip.
    // The confirmation lists the watched cards with today's alert price
    // (confirmationCards: one bounded query, at most 10 cards); a failed
    // lookup lists them without prices. The unsubToken addresses its manage,
    // pause and List-Unsubscribe links. `userId == null` means this watch has
    // no account behind it — those recipients (and only those) get the
    // create-a-free-account block in the confirmation.
    void confirmationCards(prisma, cards, market as Country, new Date(), prices)
      .then((list) => sendAlertConfirmationEmail(email, list, total, unsubToken, userId == null))
      .catch(() => false);
  }

  return NextResponse.json({ ok: true, added: result.count, watching: total });
}
