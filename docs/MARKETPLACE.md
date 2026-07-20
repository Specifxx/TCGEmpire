# RiftCompare Marketplace

> **Publicly launched** (`NEXT_PUBLIC_MARKETPLACE_PUBLIC=1` in production). Any
> signed-in, verified-email user can list and sell; real Stripe Connect (Express)
> escrow handles payouts; funds release system-driven — see
> `src/lib/order-actions.ts`, `src/lib/connect.ts`,
> `src/app/api/cron/marketplace-maintenance/route.ts`. The "Research" section
> and most of the tables further down describe the pre-launch plan and are kept
> for history; the code is the source of truth for current behavior.

## Phase 2 (deferred)

Recorded here rather than built now, in priority order:

- **Carrier-tracking API adapter** (env-gated, e.g. `TRACKING_API_PROVIDER`) —
  today delivery ETAs are computed estimates (`src/lib/delivery-estimate.ts`),
  not real carrier scans. A real integration would add `deliveredAt`/
  `trackingStatus` columns to `Order` and plug into `estimateDeliveryWindow()`
  as a "real data wins over the estimate" branch, plus trigger the delivery
  nudge/auto-release cron off an actual delivery scan instead of an estimated
  window — no call sites need to change, `estimateDeliveryWindow()` is the
  single seam.
- **Bulk/CSV listing upload** — `AddListing` in `SellerDashboard.tsx` is one
  card at a time; painful for sellers with large inventories (also interacts
  with the new-seller listing cap in `lib/marketplace.ts`).
- **Shipping-label generation** — sellers currently hand-type a carrier +
  tracking number after buying postage elsewhere.
- Seller slug URLs for storefronts (`/marketplace/seller/[id]` is userId-keyed today).
- GST/tax handling and buyer receipts/invoices — none exist yet.

---

A self-serve P2P marketplace built into RiftCompare. Any signed-in user with a
verified email can open a shop and list cards; sellers' cheapest active listing
per market appears in the normal price comparison as the **"RiftCompare
Marketplace"** source, and (once public — see below) as `Offer` entries in each
card page's Product structured data. Buyers pay through real Stripe Checkout;
funds are held in RiftCompare's platform Stripe balance and only transferred to
the seller's connected account after delivery is confirmed (by the buyer) or
auto-released 14 days after shipping.

## What's live now

| Piece | Status |
| --- | --- |
| Marketplace visibility | ✅ **public** — `NEXT_PUBLIC_MARKETPLACE_PUBLIC=1`; `canViewMarketplaceListings()` opens to everyone |
| `isVerifiedSeller` | ✅ self-serve — any signed-in user with a verified email (`src/lib/auth.ts`), no manual admin approval |
| `/marketplace` — live grid, checkout, cart | ✅ indexable (nav chip + homepage banner promote it) |
| `/marketplace/sell` — seller dashboard (shop + shipping + listings), gated on an explicit seller-terms agreement checkbox | ✅ |
| Listing API (`/api/marketplace/listings*`, `/profile`) | ✅ |
| Listings shown in card price comparison (all regions) | ✅ via `importMarketplaceListings()` |
| Real Stripe Checkout + escrow (`/api/marketplace/stripe/checkout` + webhook, `src/lib/connect.ts`) | ✅ live — "separate charges and transfers": buyer's full payment lands in the platform's own Stripe balance; seller is paid `total − 5% fee` via a Transfer only after delivery |
| Stripe Connect (Express) seller onboarding + payouts | ✅ `SellerProfile.stripeAccountId` / `payoutsEnabled`, gated on the `account.updated` webhook |
| Per-seller shipping (flat rate + free-over threshold + dispatch days) | ✅ `SellerProfile` |
| System-driven fund release (no admin review bottleneck) | ✅ auto-release 14d after shipping unless disputed; admin `/admin/marketplace` handles only early-release requests + stale/disputed exceptions |
| In-app notification center (bell + unread badge) | ✅ `src/lib/notifications.ts`, `NotificationBell.tsx` |
| Admin GMV / 5% fee-revenue reporting | ✅ `/admin/marketplace` |
| Google Search (Product JSON-LD offers, indexable pages, sitemap) | ✅ automatic now that the flag is on |
| Google Shopping feed (`/merchant-feed.xml`) | ✅ code live — still needs the one-time Merchant Center registration (see repo chat history / commit messages for the checklist) |
| Beta labeling + one-click bug reports | ✅ `MarketplaceBetaBadge` on every marketplace surface, deep-links into `/support` |

## Holding funds until delivery (real Connect escrow)

Real platform-held escrow via Stripe's "separate charges and transfers" pattern
(`src/lib/connect.ts`) — not the single-seller manual-payout workaround this
section used to describe. A buyer's full payment lands in **RiftCompare's own**
Stripe balance (no `application_fee_amount`/destination charge at checkout);
the seller's cut (`total − feeCents`, the 5% platform fee) is only sent to
their connected Express account via a `Transfer` once `releaseFundsForOrder()`
runs — triggered by the buyer confirming delivery, or the 14-day auto-release
cron if they don't. The platform's own fee revenue simply stays in the
platform Stripe balance and pays out to the owner's bank on that account's own
normal payout schedule (separate from any seller's Connect payout schedule).

Every marketplace order tracks `PENDING → PAID → SHIPPED → COMPLETED` (or
`CANCELLED`); the Sales/Purchases tabs in My Orders show a 🔒 Held / 🔓
Released badge and the exact scheduled release date per order.

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

## Going live with real payments — Stripe Connect (✅ done)

This section originally scoped the Connect migration as future work; it's now
built and live (`src/lib/connect.ts`, `src/app/api/marketplace/stripe/*`,
`src/app/api/marketplace/connect-webhook/route.ts`). Kept below for the
original reasoning/links, not as a to-do list.

```
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
STRIPE_CONNECT_WEBHOOK_SECRET=...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=...
MARKETPLACE_FEE_BPS=500   # 5% platform fee (current default)
```

Note: no ongoing GST/tax handling or buyer invoices exist yet — see Phase 2.

## Launch checklist (✅ shipped)

- [x] Public copy finalized; marketplace flipped on (`NEXT_PUBLIC_MARKETPLACE_PUBLIC=1`).
- [x] Stripe Connect onboarding for sellers + payouts gated on `payoutsEnabled`.
- [x] Escrow (system-driven release) + dispute flow; admin exception queue.
- [x] Explicit seller-terms agreement checkbox at shop setup.
- [x] Real Stripe Checkout replaces the old test-mode/demo-wallet buy flow (demo wallet subsystem deleted).
- [ ] Formal ToS/refund-policy legal review and GST handling — not yet done, flagged here as outstanding.

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
  `stripePaymentIntent`, `reservedUntil`. Wallet orders default to `PAID` so
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
