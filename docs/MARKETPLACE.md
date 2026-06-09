# RiftCompare Marketplace

A verified-seller marketplace built into RiftCompare. Sellers list cards; their
cheapest active listing per market appears in the normal price comparison as the
**"RiftCompare Marketplace"** source. Public page is **Coming Soon**; verified
sellers + a test buyer get functional (test-mode) access today.

## What's live now

| Piece | Status |
| --- | --- |
| `isVerifiedSeller` flag on accounts | ✅ (owner flagged on deploy via `scripts/marketplace-seed.ts`) |
| `/marketplace` — Coming-Soon page + live listings | ✅ (in the "More" nav) |
| `/marketplace/sell` — seller dashboard (shop + shipping + listings) | ✅ verified-seller only |
| Listing API (`/api/marketplace/listings*`, `/profile`) | ✅ |
| Listings shown in card price comparison (all regions) | ✅ via `importMarketplaceListings()` |
| Buy flow (`/api/marketplace/buy`) | ✅ **test mode** — settles the demo wallet, no real money |
| Real payments + payouts | ⛔ scaffolded only — see below |

**Accounts seeded on deploy:**
- Verified seller: `mastermisclick@gmail.com` / display name `Specifix`.
- Test buyer: `test@test.com` / password `testing1234` (with a $1,000 demo wallet).

## Data model

- `User.isVerifiedSeller` — gate for listing.
- `SellerProfile` — shop name, market (AU/NZ/US/UK), flat postage, free-over threshold, dispatch time, (later) `stripeAccountId` / `payoutsEnabled`.
- `MarketplaceListing` — sellerId, cardId, condition, isFoil, priceCents, quantity, currency, country, status (ACTIVE/SOLD_OUT/PAUSED/REMOVED).
- `Order` (existing) gains `kind="MARKETPLACE"` + `marketplaceListingId`.

## Shipping cost system

Each seller sets a **flat postage** + a **free-over threshold** + dispatch time on
their `SellerProfile`. On a sale, shipping = `itemTotal >= freeOver ? 0 : flat`. The
flat rate is also written onto the marketplace `RetailerPrice` row, so the card
comparison can show a delivered estimate (most stores can't, so this is a plus).

## Price-comparison integration

`importMarketplaceListings()` (in `src/lib/marketplace.ts`) rebuilds the marketplace
rows in `RetailerPrice`: for each `(card, market)` it writes the **cheapest active
listing** under a per-market retailer key (`marketplace`, `marketplace_nz`,
`marketplace_us`, `marketplace_uk` — mirroring eBay) so the unique key never
collides. It runs in the price importer **and** after every listing change, so the
comparison updates immediately. Marketplace prices feed the per-market "lowest"
recompute like any other source.

## Going live with real payments — Stripe Connect

The test-mode buy endpoint is the seam. To go live:

1. **Stripe Connect (Express).** Sellers onboard → `SellerProfile.stripeAccountId`, gate listing/payout on `payoutsEnabled` (from `account.updated` webhook).
2. **Checkout = "separate charges & transfers."** Buyer is charged to the platform balance (held); the seller is paid by a **transfer you create only after delivery is confirmed** (escrow). Keep the platform fee (`MARKETPLACE_FEE_BPS`, default 3%) as the application fee.
3. **Escrow state machine** on `Order`: `PENDING_PAYMENT → PAID_HELD → SHIPPED → DELIVERED → RELEASED / REFUNDED / DISPUTED` + tracking fields + a `Dispute` table.
4. **Webhooks** (`/api/stripe/webhook`): `payment_intent.succeeded`, `account.updated`, `charge.dispute.created`, signature-verified + idempotent.
5. **Legal:** the platform never custodies funds (Stripe does), so no AFSL/AUSTRAC of your own — confirm with a lawyer; GST applies to your fee. Don't ship to Production without ToS + a lawyer/accountant sign-off.

Env to add when ready:
```
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=...
MARKETPLACE_FEE_BPS=300   # 3% platform fee (optional override)
```

The full Stripe Connect escrow plan (state machine, exact API calls, chargeback
handling) was scoped earlier and applies directly here.

## Launch checklist

- [ ] Decide buyer-facing copy is final; flip the page from "Coming Soon".
- [ ] Stripe Connect onboarding for sellers + payouts gated on KYC.
- [ ] Escrow + dispute flow; tracked-shipping requirement.
- [ ] ToS / refund policy / GST handling.
- [ ] Replace the test-wallet buy with the Stripe checkout.
