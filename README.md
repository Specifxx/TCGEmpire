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
- **Password:** `password123`
- Starts with **$500** in demo wallet credit (it's pre-filled on the sign-in page).

It is pre-loaded alongside 6 seller accounts, 54 cards (the "Origins" set) and
~190 active listings.

## Features

- **Browse marketplace** — responsive grid of listings with search and faceted
  filters (domain, rarity, card type, condition, price range, foil) plus sorting.
- **Card detail** — every active listing for a card, sorted by price, with a
  one-click buy (wallet-backed).
- **Sell** — list any card with condition, foil and price; live card preview.
- **Accounts + wallet** — register/login, AUD wallet with demo top-up, profile
  with your active listings, purchase history and sales history.

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
