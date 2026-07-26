// Pure, prisma-free marketplace policy: escrow timing, the platform fee, and the
// deadline-date math — split out of lib/marketplace.ts (which imports the Prisma
// client and so can't be imported from "use client" components). marketplace.ts
// re-exports everything here so there's still one source of truth.
//
// NOTE on env vars in client bundles: these aren't NEXT_PUBLIC_, so any client
// component importing the *_DAYS/_BPS constants gets the compiled-in defaults
// (3/1/14/300/100) regardless of a Vercel override. That's fine for static prose
// ("a 2% fee, 1% for Premium sellers") — but every CONCRETE date/fee shown for a
// REAL order must come from server-computed data (the stored Order.feeCents, or
// an API field built with shipByDate()/autoReleaseDate() below), never from
// client-side math, so an env override can never desync UI figures from what
// checkout/the cron actually charged/enforced.

// Platform fee on a marketplace sale, in basis points (200 = 2%). Kept off the
// buyer's price; deducted from the seller's payout at release time (see
// lib/connect.ts's releaseFundsForOrder — the fee is simply never transferred).
// Premium sellers pay the lower MARKETPLACE_PREMIUM_FEE_BPS instead — evaluated
// fresh at the moment of each sale (checkout time), not locked in at listing
// time, so a seller who upgrades mid-listing gets the discount on their very
// next sale.
export const MARKETPLACE_FEE_BPS = Number(process.env.MARKETPLACE_FEE_BPS ?? 200);
export const MARKETPLACE_PREMIUM_FEE_BPS = Number(process.env.MARKETPLACE_PREMIUM_FEE_BPS ?? 100);

export function marketplaceFeeBps(sellerIsPremium?: boolean): number {
  return sellerIsPremium ? MARKETPLACE_PREMIUM_FEE_BPS : MARKETPLACE_FEE_BPS;
}

export function platformFeeCents(priceCents: number, sellerIsPremium?: boolean): number {
  return Math.round((priceCents * marketplaceFeeBps(sellerIsPremium)) / 10000);
}

// Escrow timing (D3 in the plan): a seller must add tracking within this many
// days of payment or the cron auto-refunds the buyer; once shipped, funds
// auto-release to the seller this many days later if the buyer never confirms.
// CALENDAR days, exactly as the cron measures them.
export const MARKETPLACE_SHIP_DEADLINE_DAYS = Number(process.env.MARKETPLACE_SHIP_DEADLINE_DAYS ?? 14);
export const MARKETPLACE_AUTO_RELEASE_DAYS = Number(process.env.MARKETPLACE_AUTO_RELEASE_DAYS ?? 14);

// Max seller-uploaded photos per listing (the actual physical copy, not the
// catalogue art) — client components (the upload widget) need this to cap the
// file picker/preview the same way the server enforces it.
export const MARKETPLACE_LISTING_MAX_PHOTOS = 4;

// SHIPPED orders older than this land in the admin "needs attention" queue —
// most orders auto-release without any admin involvement, but a parcel this old
// with no buyer confirmation deserves a human glance before its release date.
export const MARKETPLACE_ADMIN_ATTENTION_DAYS = Number(process.env.MARKETPLACE_ADMIN_ATTENTION_DAYS ?? 10);

const DAY_MS = 86_400_000;

// The single source for every concrete deadline date shown anywhere (UI, emails,
// admin queue). Both mirror the cron's math in api/cron/marketplace-maintenance
// exactly — if these ever diverge from the cron's cutoffs, users see dates the
// system doesn't honor.
export function shipByDate(paidAt: Date): Date {
  return new Date(paidAt.getTime() + MARKETPLACE_SHIP_DEADLINE_DAYS * DAY_MS);
}

export function autoReleaseDate(shippedAt: Date): Date {
  return new Date(shippedAt.getTime() + MARKETPLACE_AUTO_RELEASE_DAYS * DAY_MS);
}
