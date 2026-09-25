import { z } from "zod";
import type { prisma } from "./db";
import { isPremium, premiumTierOf, type EntitlementUser } from "./premium";
import { targetAlertLimit } from "./alert-limits";
import { MAX_TARGET_CENTS, MIN_TARGET_CENTS } from "./target-price";

// SET OR CLEAR THE TARGET PRICE ON ONE WATCH ("Notify me at $X", Plus and
// Premium; 2026-09-25 premium lineup). The body of
// PATCH /api/alerts/watchlist/[cardId], here rather than in the route file
// because a route may export only its handlers — and this is the part worth
// testing against a stub client (tests/target-alert-route.test.ts). The route
// keeps the session read (401) and the rate limit (429).
//
// One watch = one (card, market) row, so the market is required: a card
// watched in AU and US can carry a different target in each currency.
//
//   403 not a paying member · 400 bad body · 409 at the tier's limit
//   (lib/alert-limits.ts — Plus 25, Premium unlimited) · 404 not a watch of
//   this account · 200 { ok, targetCents, used, limit }.
//
// Scoping every read and write by userId is the ownership check, as in DELETE.
// The limit counts this account's OTHER watches that carry a target, so
// editing an existing target never trips it. A changed target re-arms only the
// target's own watermark (targetEmailedCents), never the shared one. The cron honours a target only
// while the account is entitled (lib/price-alerts.ts), so a lapsed member's
// stored targets are inert, not deleted.

export const targetBodySchema = z.object({
  market: z.enum(["AU", "US", "UK", "SG", "CA", "EU"]),
  targetCents: z.number().int().min(MIN_TARGET_CENTS).max(MAX_TARGET_CENTS).nullable(),
});

export type TargetDb = {
  priceAlert: Pick<typeof prisma.priceAlert, "count" | "findFirst" | "updateMany">;
};

export interface TargetResult {
  status: number;
  body: Record<string, unknown>;
}

export async function applyTargetPrice(
  db: TargetDb,
  user: EntitlementUser & { id: string },
  cardId: string,
  rawBody: unknown,
): Promise<TargetResult> {
  if (!isPremium(user)) {
    return { status: 403, body: { error: "Target prices are part of Plus." } };
  }

  const parsed = targetBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return {
      status: 400,
      body: { error: "Send { market, targetCents }: whole cents from 1 to 10,000,000, or null to clear." },
    };
  }
  const { market, targetCents } = parsed.data;

  const limit = targetAlertLimit(premiumTierOf(user));
  const others = await db.priceAlert.count({
    where: { userId: user.id, targetCents: { not: null }, NOT: { cardId, market } },
  });
  if (targetCents != null && others >= limit) {
    return {
      status: 409,
      body: {
        error: `Plus covers target prices on ${limit} cards, and all ${limit} are in use. Clear one to set this, or move to Premium for unlimited targets.`,
        used: others,
        limit,
      },
    };
  }

  // The watch as it stands, for the re-arm below. One row in practice (the
  // unique key is email + card + market, and the email is the account's own).
  const current = await db.priceAlert.findFirst({
    where: { userId: user.id, cardId, market },
    select: { targetCents: true },
  });
  if (!current) return { status: 404, body: { error: "Not found" } };

  // RE-ARM. The target keeps its OWN watermark (PriceAlert.targetEmailedCents:
  // the lowest price emailed under this target) and fires only below it
  // (lib/price-alerts.ts shouldEmailTarget). A CHANGED target resets it, so the
  // next run compares against the target alone and the first email re-seeds
  // it: a card that listed at $3 and is $40 now is not silenced for two months
  // when a $30 target is set. Saving the same target again re-arms nothing
  // (no repeat email).
  //
  // lowestEmailedCents is deliberately NOT touched. It is the free drop rule's
  // and the below-market trigger's "lowest price we've ever emailed you";
  // clearing it here made the next ordinary drop ($40 → $38) go out as a "new
  // low" above a price already sent, and outlived a lapse into free rules.
  const changed = targetCents !== current.targetCents;
  const res = await db.priceAlert.updateMany({
    where: { userId: user.id, cardId, market },
    data: changed ? { targetCents, targetEmailedCents: null } : { targetCents },
  });
  if (res.count === 0) return { status: 404, body: { error: "Not found" } };

  return {
    status: 200,
    body: {
      ok: true,
      targetCents,
      used: others + (targetCents != null ? 1 : 0),
      // null = unlimited (Premium, admin) — Infinity isn't JSON.
      limit: Number.isFinite(limit) ? limit : null,
    },
  };
}
