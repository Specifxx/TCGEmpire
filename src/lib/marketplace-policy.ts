// Pure, prisma-free marketplace policy: escrow timing, the platform fee, and the
// deadline-date math — split out of lib/marketplace.ts (which imports the Prisma
// client and so can't be imported from "use client" components). marketplace.ts
// re-exports everything here so there's still one source of truth.
//
// NOTE on env vars in client bundles: these aren't NEXT_PUBLIC_, so any client
// component importing the *_DAYS/_BPS constants gets the compiled-in defaults
// (5/14/500) regardless of a Vercel override. That's fine for static prose
// ("the 5% fee") — but every CONCRETE date shown to users must come from a
// server-computed API field built with shipByDate()/autoReleaseDate() below,
// never from client-side math, so an env override can never desync UI dates
// from what the cron actually enforces.

// Platform fee on a marketplace sale, in basis points (500 = 5%). Kept off the
// buyer's price; deducted from the seller's payout at release time (see
// lib/connect.ts's releaseFundsForOrder — the fee is simply never transferred).
export const MARKETPLACE_FEE_BPS = Number(process.env.MARKETPLACE_FEE_BPS ?? 500);

export function platformFeeCents(priceCents: number): number {
  return Math.round((priceCents * MARKETPLACE_FEE_BPS) / 10000);
}

// Escrow timing (D3 in the plan): a seller must add tracking within this many
// days of payment or the cron auto-refunds the buyer; once shipped, funds
// auto-release to the seller this many days later if the buyer never confirms.
// CALENDAR days, exactly as the cron measures them.
export const MARKETPLACE_SHIP_DEADLINE_DAYS = Number(process.env.MARKETPLACE_SHIP_DEADLINE_DAYS ?? 14);
export const MARKETPLACE_AUTO_RELEASE_DAYS = Number(process.env.MARKETPLACE_AUTO_RELEASE_DAYS ?? 14);

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
