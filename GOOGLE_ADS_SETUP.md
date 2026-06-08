# Promoting RiftCompare on Google Search (paid)

This is the playbook for paying to appear at the top of Google Search. It covers
the **business setup** (the part only you can do, in your Google Ads account) and
the **code** that's already wired up here to make those campaigns measurable.

> TL;DR — "paying to be on Google" means **Google Ads Search campaigns**. You bid
> on what people type ("riftbound singles", "riftbound origins price"), pay only
> when someone clicks, and Google needs a *conversion* to optimise toward. The
> conversion for RiftCompare is the **outbound "Buy / View deal" click** that
> earns affiliate revenue — and the code now reports exactly that.

---

## Part 1 — The code (already done)

A standard Google tag (`gtag.js`) is loaded site-wide, **web only**, and is a
no-op until you set ids in env. When configured:

- Every outbound retailer click (`OutboundLink`) fires a Google Ads **conversion**,
  so campaigns can bid toward the action that makes money — not just raw traffic.
- Auto-tagging + remarketing audiences start collecting immediately.
- Optionally also loads **GA4** for richer reporting.

Wiring lives in `src/lib/google-ads.ts`, `src/components/GoogleTag.tsx`
(rendered in `src/app/layout.tsx`), and the conversion call in
`src/components/OutboundLink.tsx`.

### Env vars to set (then redeploy)

| Var | Example | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_GOOGLE_ADS_ID` | `AW-1234567890` | Your Conversion ID (loads the tag) |
| `NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_OUTBOUND` | `AW-1234567890/AbCdEfG` | The conversion `send_to` (ID/label) |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | `G-XXXXXXXXXX` | *(optional)* GA4 measurement id |

On Vercel: **Project → Settings → Environment Variables** → add → redeploy.

---

## Part 2 — Google Ads account setup (do this once)

1. **Create the account** at [ads.google.com](https://ads.google.com). Skip the
   "Smart campaign" express setup — switch to **Expert mode** so you get real
   keyword Search campaigns and conversion tracking.
2. **Add billing** (your card / AUD).
3. **Create the conversion action** — Tools → **Conversions** → New →
   **Website**. Set it up manually:
   - Category: **Other / "View deal click"** (an engagement/lead-style action).
   - Pick "Use the same value for each conversion" with a small value (e.g. the
     average affiliate commission per click) so Google can optimise for value.
   - Choose **"Install the tag yourself → Google tag"**. Copy the **Conversion ID**
     (`AW-…`) and the **Conversion label**. Combine as `AW-…/label` → that's
     `NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_OUTBOUND`.
4. Set the two env vars (Part 1), redeploy, then use Google's **Tag Assistant**
   to confirm the tag fires on the site and the conversion fires on an outbound
   click.

---

## Part 3 — Your first Search campaign

- **Campaign type:** Search. **Goal:** Sales/Leads (the conversion above).
- **Networks:** turn OFF "Search partners" and "Display network" to start — pure
  Google Search keeps spend clean and intent-rich.
- **Locations:** target **Australia** (and NZ/US only if you want to test them —
  RiftCompare's price data covers all three). Use *"Presence: people in your
  targeted locations"*, not "interest".
- **Budget:** start small — **AUD $10–20/day**. You're buying data, not scale.
- **Bidding:** begin on **Maximise clicks** with a max CPC cap (~$0.50–1.00)
  until you've logged ~15–30 conversions, then switch to **Maximise conversions /
  Target CPA** so Google optimises on the outbound clicks the code reports.

### Keywords (high-intent, low-waste)

Group tight ad groups around buyer intent, mostly **phrase/exact match**:

```
"riftbound singles"            "riftbound origins price"
"buy riftbound cards"          "riftbound card prices"
"riftbound tcg singles australia"   [riftbound proving grounds price]
"cheapest riftbound cards"     "riftbound <champion> card"   (per popular card)
```

Add **negative keywords** day one to stop wasted spend:
`free, reddit, decklist, how to play, rules, ebay, app, wiki, value (if you don't sell)`.

### Ads (Responsive Search Ad)

- **Headlines** (mix these): `Compare Riftbound Prices`, `Find the Cheapest
  Riftbound Singles`, `Live Prices · AU, NZ & US`, `Every Riftbound Card, One
  Search`.
- **Descriptions:** lead with the value prop — *"Compare live Riftbound singles
  prices across stores and find the cheapest place to buy. Updated daily."*
- **Final URL:** send to the most relevant page, not just the homepage — e.g.
  `/browse?q=…`, a `/sets/origins` set page, or a specific `/card/<slug>` page.
- Add **sitelink, callout and structured-snippet** assets (Browse, Sealed, Decks,
  Guides) — they lift CTR for free.

---

## Part 4 — Make the paid traffic convert better (and cheaper)

- **Landing-page match matters most.** A keyword for a specific card should land
  on that card's page. Higher relevance → higher Quality Score → lower CPC.
- **Link GA4 ↔ Google Ads** (Ads → Tools → Linked accounts) to build remarketing
  audiences and re-engage visitors cheaply.
- **Add the free Merchant-style organic wins too** — the site already has a
  sitemap, structured data and Search Console verification, so submit the sitemap
  in Search Console; paid + organic compound.

---

## Costs & expectations

- You pay **per click** (CPC), not per impression. AU TCG/hobby terms are
  typically cheap (often well under $1/click).
- Expect the first 1–2 weeks to be **learning** — don't judge on day 1. Let it
  gather ~30 conversions before tightening bids/budget.
- Watch the **Search terms report** weekly and keep mining negative keywords —
  it's the single biggest lever on wasted spend.
