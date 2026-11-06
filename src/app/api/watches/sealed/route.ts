import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getCountry } from "@/lib/get-country";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createAnonymousSealedWatch, createSealedWatch, listSealedWatches, sealedOfferState } from "@/lib/sealed-watch";
import { claimConfirmationSlot } from "@/lib/alert-confirmations";
import { getPreorderGroups, getSealedGroups } from "@/lib/sealed-import";
import { watchActionLinks } from "@/lib/alert-actions";
import { affiliateUrl } from "@/lib/affiliate";
import { currencyOf, type Country } from "@/lib/country";
import { isPreorderSetCode } from "@/lib/constants";
import { msrpCents } from "@/lib/msrp";
import { sendSealedWatchConfirmationEmail } from "@/lib/watch-emails";

// SEALED WATCHES (Plus and Premium, 2026-09-29; one on a free account since
// 2026-10-23; one per ADDRESS with no account since 2026-11-06): one sealed
// product in the viewer's market, checked by the paid alert run after each
// sealed import (lib/sealed-watch.ts). The free limit (402 past the one), the
// Plus cap (409, SEALED_WATCH_LIMIT_PLUS) and ownership live there; this is
// transport.
//
// Signed out, the body carries the address (the sealed page's "Email me"
// form, DECISIONS.md "Sealed watches without an account"): the same door the
// card alerts have had since 2026-08 (api/alerts/subscribe). No double opt-in,
// so the new address gets ONE confirmation, under the shared daily cap
// (lib/alert-confirmations.ts), with today's cheapest store and its stop link;
// re-submitting a watched product sends nothing. Rate-limited by IP.
export const dynamic = "force-dynamic";

const anonymous = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  groupKey: z.string().min(1).max(80),
  targetCents: z.number().int().nonnegative().optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const res = await listSealedWatches(prisma, user);
  return NextResponse.json(res.body, { status: res.status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  const body = await req.json().catch(() => null);
  const market = getCountry();
  if (user) {
    const rl = rateLimit(`sealed-watch:${user.id}`, 60, 3_600_000);
    if (!rl.ok) return tooManyRequests(rl.retryAfter);
    const res = await createSealedWatch(prisma, user, body, market);
    return NextResponse.json(res.body, { status: res.status, headers: { "Cache-Control": "no-store" } });
  }
  const rl = rateLimit(`sealed-watch:anon:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  const parsed = anonymous.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter the email address to send the alert to." }, { status: 400 });
  const { email, groupKey, targetCents } = parsed.data;
  const res = await createAnonymousSealedWatch(prisma, email, { groupKey, ...(targetCents == null ? {} : { targetCents }) }, market);
  if (res.status === 201 && (await claimConfirmationSlot(prisma))) {
    const watch = res.body.watch as { id: string };
    // Not awaited: the confirmation is a courtesy, the watch is saved already.
    void confirm(email, watch.id, groupKey, market).catch(() => false);
  }
  return NextResponse.json(res.body, { status: res.status, headers: { "Cache-Control": "no-store" } });
}

// Today's cheapest open real-store listing for the product (the run's own
// rule, sealedOfferState), from the self-cached groups the sealed pages read.
async function confirm(email: string, watchId: string, groupKey: string, market: Country): Promise<boolean> {
  const now = new Date();
  let g = (await getSealedGroups(market)).find((x) => x.groupKey === groupKey);
  if (!g) g = (await getPreorderGroups(market)).find((x) => x.groupKey === groupKey);
  if (!g) return false;
  const state = sealedOfferState(g.listings, now);
  const preorder = isPreorderSetCode(g.setCode, now);
  let actions = null;
  try {
    actions = watchActionLinks({ kind: "sealed", id: watchId, now });
  } catch {
    actions = null;
  }
  const seen = state.open ? Date.parse(state.open.lastSeen) : NaN;
  return sendSealedWatchConfirmationEmail(email, {
    watchId,
    groupKey,
    name: g.name,
    productType: g.productType,
    market,
    currency: currencyOf(market),
    open: state.open
      ? {
          priceCents: state.open.priceCents,
          storeName: state.open.retailerName,
          url: affiliateUrl(state.open.url, state.open.retailer, "/email-alert-sealed-confirm"),
          storeCount: state.openStores,
          checkedAt: Number.isFinite(seen) ? new Date(seen) : now,
        }
      : null,
    rrpCents: preorder ? null : msrpCents(g.productType, market),
    actions,
  });
}
