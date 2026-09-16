# TCGEmpire

Australia's marketplace for **Riftbound** trading cards — a CSFloat-style MVP.
Browse, filter, buy and sell card singles in AUD.

> MVP demo. Card data is representative sample data for demonstration purposes
> and is not affiliated with or endorsed by Riot Games.

## Tech stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** — dark, CSFloat-inspired UI
- **Prisma** + **SQLite** — local database (`prisma/dev.db`)
- **jose** + **bcryptjs** — cookie session auth
- Self-contained **SVG card art** (no external image assets needed)

## Getting started

```bash
npm install          # install dependencies
npm run setup        # generate Prisma client, create DB, seed data
npm run dev          # start the dev server at http://localhost:3000
```

### Demo account

The seed creates a ready-to-use account:

- **Email:** `demo@tcgempire.au`

> Sign-in is **Google or Discord only** — the email/password flow was removed.
> The seeded accounts exist for their marketplace data (listings, orders, wallet);
> to sign in as one locally, sign in with an OAuth provider on the same address,
> or set `googleId`/`discordId` on the row by hand.
- Starts with **$500** in demo wallet credit (it's pre-filled on the sign-in page).

It is pre-loaded alongside 6 seller accounts, 54 cards (the "Origins" set) and
~190 active listings.

## Features

- **Browse marketplace** — responsive grid of listings with search and faceted
  filters (domain, rarity, card type, condition, price range) plus sorting.
  Deliberately NOT foil: finish is shown as a per-listing ✦ Foil badge, never
  as a filter — a foil ranks on price alongside everything else.
- **Card detail** — every active listing for a card, sorted by price, with a
  one-click buy (wallet-backed).
- **Sell** — list any card with condition, foil and price; live card preview.
- **Accounts + wallet** — register/login, AUD wallet with demo top-up, profile
  with your active listings, purchase history and sales history.

## Mobile app (iOS + Android)

A native Android + iOS app lives in [`mobile/`](mobile/). It's a
[Capacitor 8](https://capacitorjs.com) shell that loads the live site and layers
real native behaviour over it — **Google AdMob** ads, verified App Links,
launcher shortcuts, an offline screen bundled in the binary, a share sheet,
haptics, Custom Tabs for outbound links and hardware-back handling. It reuses
100% of this web app and stays in sync automatically: a website deploy updates
every installed app, with no store update.

See [`mobile/README.md`](mobile/README.md) for build and store-release steps,
and [`mobile/store/`](mobile/store) for the Play Console copy, signing guide and
generated graphics.

The website is app-aware through four files:

| File | Role |
| --- | --- |
| `src/lib/native-boot.ts` | The `<head>` boot script. Detects the app from the User-Agent before any bundle loads, and **pauses AdSense** — in-app ad inventory belongs to AdMob, not AdSense. |
| `src/components/NativeShell.tsx` | Splash, status bar, AdMob banner, back button, deep links, connectivity, keyboard. No-op on the web. |
| `src/lib/native.ts` | `isNative()`, `openExternal()`, `haptic()`, `shareUrl()`. |
| `src/lib/admob.ts` | AdMob ad-unit ids. |

> ⚠️ The Capacitor plugin versions in this `package.json` and in
> `mobile/package.json` **must stay on the same major**. The website imports the
> plugin JS; the shell provides the native half. A mismatch fails at runtime in
> the user's hands, not at build time.

## Useful scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run setup` | Generate client + create DB + seed (first-time setup) |
| `npm run db:seed` | Re-seed (resets all marketplace data) |
| `npm run db:reset` | Drop + recreate the schema, then seed |
| `npx tsx scripts/import-cards.ts <file.json>` | Import real card data (see file header for format) |

## Project structure

```
prisma/
  schema.prisma      # User, Card, Listing, Order models
  cards.ts           # sample Origins card dataset
  seed.ts            # seeds users, cards and listings
src/
  app/               # routes (browse, card/[id], sell, login, profile, api/*)
  components/        # CardArt, Navbar, ListingCard, Filters, forms…
  lib/               # db, auth, constants, listings query, formatting
scripts/
  import-cards.ts    # JSON importer for real card data
```

## Roadmap ideas (post-MVP)

- Real payment + payout integration (Stripe AU), escrow / shipping tracking
- Image uploads for actual card photos (condition verification)
- Watchlists, price history charts, sales analytics
- Seller ratings & reviews, dispute handling
- Real Riftbound card database import (set releases)
```

## Deploying

Production is **not** built on every push. `vercel.json`'s `ignoreCommand`
(`scripts/vercel-ignore-build.sh`) skips any commit whose message lacks the
marker `[deploy]`; the **Production deploy** workflow lands one such commit on
`main` every day at 08:00 UTC, after the morning price import. To release now,
either press *Run workflow* on that workflow or put `[deploy]` in your commit
message. Why: every Vercel build prerenders ~770 database-backed pages and
clears the ISR page cache, and at 10–30 pushes a day that alone was exhausting
a Neon transfer allowance every three days — see `DECISIONS.md`
("Network transfer: the deploy cadence was the burn", 2026-09-11).
