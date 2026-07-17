# RiftCompare Marketplace

A verified-seller marketplace built into RiftCompare. Sellers list cards; their
cheapest active listing per market appears in the normal price comparison as the
**"RiftCompare Marketplace"** source. Public page is **Coming Soon**; verified
sellers + a test buyer get functional (test-mode) access today.

## What's live now

| Piece | Status |
| --- | --- |
| `isVerifiedSeller` — **admin-only** (session-computed; the raw per-user DB flag is ignored) | ✅ |
| Marketplace visibility — hidden from the public (`MARKETPLACE_PUBLIC` unset); admins can always view/manage it even while hidden | ✅ `canViewMarketplaceListings(email, isAdmin)` |
| `/marketplace` — Coming-Soon page + live listings | ✅ (in the "More" nav) |
| `/marketplace/sell` — seller dashboard (shop + shipping + listings) | ✅ admins only |
| Listing API (`/api/marketplace/listings*`, `/profile`) | ✅ |
| Listings shown in card price comparison (all regions) | ✅ via `importMarketplaceListings()` |
| Buy flow (`/api/marketplace/buy`) | ✅ **test mode** — settles the demo wallet, no real money |
| Real Stripe Checkout (`/api/marketplace/stripe/checkout` + webhook) | ✅ code live — activates automatically once `STRIPE_SECRET_KEY` is set (already set in prod for Premium) |
| Seller's own shipping: $10 AUD flat, Australia | ✅ interim — seeded via `scripts/marketplace-seed.ts` on the owner's `SellerProfile` |
| Fund holding until delivery confirmed | ✅ app-side signal (PAID → SHIPPED → COMPLETED, seller or buyer can confirm); real hold requires switching **Stripe Dashboard → Settings → Payouts → Manual** (see "Escrow" below) |
| Stripe Connect (multi-seller payouts) | ⛔ not needed — single-seller for now, see below |

**Accounts seeded on deploy:**
- Verified seller (admin-gated): `mastermisclick@gmail.com` / display name `Specifix`.
- Test buyer: `test@test.com` / password `testing1234` (with a $1,000 demo wallet).

## Holding funds until delivery (single-seller, no Connect)

Because this is a single-seller Stripe Checkout integration (not Connect), a real
sale's money lands directly in your own Stripe balance per Stripe's normal payout
schedule — the app has no way to intercept or delay a transfer that never happens
through it. The practical way to "hold funds until delivered" today:

1. **In the Stripe Dashboard** (you'll need to do this yourself): *Settings → Payouts
   → Payout schedule → Manual*. This stops Stripe from auto-depositing to your bank;
   money sits in your Stripe balance until you manually trigger a payout.
2. **In the app**: every marketplace order tracks `PAID → SHIPPED → COMPLETED`. Mark
   an order shipped with a tracking number, and either the buyer or you (the seller)
   can confirm delivery once tracking shows it arrived. The Sales tab shows a
   🔒 Held / 🔓 Released badge per order — once it says Released, it's safe to go
   trigger the manual Stripe payout for that money.

This isn't true platform-held escrow (Stripe already has your money either way) but
it gives you the same practical control: nothing gets paid out to your bank until
you've confirmed the buyer actually received the card.

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

---

# Research: payments & shipping options

## Option A — Stripe Connect (recommended for a custom marketplace)

Best fit because we own the UX (CSFloat/TCGplayer-style) and need multi-seller
payouts + escrow. Steps & resources:

1. **Create a Stripe account** → enable **Connect** (Platform). https://dashboard.stripe.com/connect
2. **Seller onboarding (Express):** create a connected account per seller, redirect them through Stripe-hosted KYC. Store `SellerProfile.stripeAccountId`; gate listing/payout on `payoutsEnabled` (from the `account.updated` webhook). Docs: https://stripe.com/docs/connect/express-accounts
3. **Checkout (separate charges & transfers):** a `PaymentIntent` charges the buyer to the *platform* balance (held). After delivery, create a **Transfer** to each seller (= escrow), keeping `MARKETPLACE_FEE_BPS` as the application fee. Docs: https://stripe.com/docs/connect/separate-charges-and-transfers
4. **Webhooks** (`/api/stripe/webhook`): `payment_intent.succeeded`, `account.updated`, `charge.dispute.created`; verify signature + dedupe. Docs: https://stripe.com/docs/webhooks
5. **Escrow + disputes**: the `Order` state machine + a `Dispute` table + tracked-shipping requirement (chargeback evidence).
6. **Legal**: Stripe is the regulated money-mover, so you avoid your own AFSL/AUSTRAC — confirm with a lawyer; GST on your fee.

Effort: ~1–2 weeks. Fees: ~1.7%+30¢ AU card + Connect payout fees, on top of your 3%.

### Stripe (single-seller) foundations — what's wired now

Because the marketplace is now **single-seller** (you, Specifix), we DON'T need Connect:
payment from a sale lands straight in your Stripe account. We use **plain Stripe
Checkout** (hosted) + a webhook, with **Skinport-style stock reservation**. All of it
is INERT until `STRIPE_SECRET_KEY` is set — the marketplace falls back to the demo
wallet, so nothing changes until you flip it on.

Scaffolded:

- **`src/lib/stripe.ts`** — lazy Stripe client, `stripeEnabled()`, and
  `releaseExpiredReservations()` (restores stock for abandoned holds; called
  opportunistically — no cron needed).
- **`POST /api/marketplace/stripe/checkout`** — validates the cart, **reserves stock**
  (decrements availability + opens `PENDING` orders with a `reservedUntil` hold),
  then creates a Checkout Session and returns its `url`. Rolls the reservation back if
  the session can't be created.
- **`POST /api/marketplace/stripe/webhook`** — `checkout.session.completed` /
  `async_payment_succeeded` → orders `PAID` (stock stays gone); `expired` /
  `async_payment_failed` → orders `CANCELLED` + stock restored.
- **`Order`** gained `status`, `shippingCents`, `feeCents`, `stripeSessionId`,
  `stripePaymentIntent`, `reservedUntil`. Wallet/forum orders default to `PAID` so
  existing flows are unaffected.
- **Client**: `MarketplaceClient` takes `stripeEnabled`; when on, "Buy"/cart redirect
  to Stripe and back to `/marketplace?purchase=success|cancelled`.
- **Env** (`.env.example`): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  optional `MARKETPLACE_RESERVE_MINUTES`.

**To switch it on:** add `STRIPE_SECRET_KEY` (Stripe → Developers → API keys) and a
webhook at `/api/marketplace/stripe/webhook` (events above) → put its signing secret in
`STRIPE_WEBHOOK_SECRET`, redeploy. Use `sk_test_…` + a test card first.

**Still rough / next refinements:** buyer shipping-address collection (Stripe Checkout
can collect it — wire `shipping_address_collection`), order-history UI for buyer &
seller, email receipts, refunds/disputes, and tax. Known to be iterative — built as a
foundation to harden.

## Option B — Shopify

Shopify is excellent for a **single-store** shopfront, less so for a **multi-seller
marketplace** out of the box:

- **Shopify (standard):** great if *you* are the only seller (your "official store").
  Shopify Payments handles cards, taxes and **carrier-calculated (dynamic) shipping**
  natively. But it's a separate storefront — it won't live inside RiftCompare's UI or
  show listings inside the price comparison without custom work (Storefront API).
- **Multi-seller on Shopify** needs an app like **Webkul Multi-Vendor Marketplace** or
  **Multivendor Marketplace by CedCommerce**, or **Shopify Collective** — workable but
  you inherit their UX and per-seller payout model, and embedding it in our site is
  awkward.
- **Hybrid worth considering:** run **your own official store on Shopify** (fast,
  compliant, dynamic shipping, payouts solved) and pull its inventory/prices into
  RiftCompare via the **Storefront API** as the "official" source — while other
  verified sellers use the Stripe-Connect marketplace. This matches "as the official
  store I go first": Shopify powers your store; Connect powers the rest.

### Shopify foundations — what's wired now

Since the marketplace is now **single-seller** (you, Specifix, are the only seller),
the Shopify "official store" path is the clean fit: Shopify owns payments, tax, fraud
and carrier-calculated shipping; we just surface the catalog and hand off checkout.

Scaffolded (inert until env is set):

- **`src/lib/shopify.ts`** — Storefront API client. `shopifyEnabled()`,
  `storefront()` (GraphQL fetch), `getShopifyProducts()` (normalised catalog with
  per-variant price/SKU/stock), `createCheckout(lines)` (→ Shopify hosted
  `checkoutUrl`), and a SKU convention (`card:<slug>`) to map a Shopify variant back
  to a RiftCompare card.
- **`GET /api/shopify/products`** — read-only catalog proxy. Returns
  `{ enabled:false, products:[] }` until configured.
- **`POST /api/shopify/cart`** — body `{ lines:[{ merchandiseId, quantity }] }` →
  `{ checkoutUrl }`. The client redirects the buyer to Shopify to pay.
- **Env** (`.env.example`): `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_STOREFRONT_TOKEN`,
  optional `SHOPIFY_API_VERSION`.

**Not yet wired (deliberate, needs your store + decisions):** rendering the Shopify
catalog inside `/marketplace`, swapping the test-wallet "Buy" for the Shopify
checkout redirect, and importing Shopify prices into the price comparison as the
official source. These are a small follow-up once the store exists and the catalog
is tagged with `card:<slug>` SKUs.

**What I need from you to switch it on:**
1. A Shopify store (any plan; Basic is fine) with your inventory.
2. A **Storefront API access token**: Shopify admin → *Settings → Apps and sales
   channels → Develop apps → Create an app → Storefront API → Install*, granting
   `unauthenticated_read_product_listings` + `unauthenticated_write_checkouts`.
3. Your `*.myshopify.com` domain.
4. Set `SHOPIFY_STORE_DOMAIN` + `SHOPIFY_STOREFRONT_TOKEN` in Vercel env and redeploy.
5. (For card-level matching in the comparison) set each variant's **SKU** to
   `card:<riftcompare-slug>` so we can link products to cards.

## Dynamic (location-based) shipping

Instead of a flat per-seller rate, calculate postage from **seller origin → buyer
address** at checkout. Options:

- **Shopify Shipping / carrier-calculated rates** — if the seller is on Shopify, this
  is built in (Australia Post, etc.). Best "it just works" if using Shopify.
- **EasyPost** (https://www.easypost.com) or **Shippo** (https://goshippo.com) — carrier
  rate APIs (Australia Post, USPS, Royal Mail, etc.). At checkout, POST {fromZip,
  toZip, weight, dimensions} → get live rates; pick the cheapest. Cleanest for a custom
  marketplace; needs each card's weight (cards are ~light, so a flat "letter vs parcel"
  band by quantity is usually enough).
- **Zone bands (cheap first step, no API):** seller sets a few bands — *same state /
  domestic / international* — and the buyer's selected country (we already have it) +
  state picks the band. Add `state` to the buyer flow; we already store seller `state`.

**Recommendation:** ship the marketplace beta with the seller's flat rate (done), then
add **EasyPost** (custom marketplace) or lean on **Shopify Shipping** for the official
store. To collect the buyer address needed for dynamic rates, add an address step to
checkout when real payments go in.
