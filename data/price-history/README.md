# RiftCompare price history

The public price history behind the charts, movers, records and the RiftCompare
Index on [riftcompare.com](https://riftcompare.com). One file per Sydney calendar
day; the site reads these files directly (`src/lib/price-history-store.ts`).

## `cards/YYYY-MM-DD.json`

```json
{
  "day": "2026-10-03",
  "currency": "USD",
  "basis": "Cheapest in-stock price for the card across the AU, US, UK and SG markets on this Sydney calendar day, converted to US cents.",
  "prices": { "<card id>": 3000 }
}
```

`prices` maps a card's id to its cheapest in-stock price that day, in US cents.
Daily from 2026-10-03; earlier days are whatever the database held when it was
exported (daily until late August 2026, then about weekly).

## `sealed/YYYY-MM-DD.json`

```json
{
  "day": "2026-10-03",
  "basis": "Cheapest in-stock price for the sealed product group in each market on this Sydney calendar day, in that market's own currency (cents).",
  "prices": { "<product group>": { "AU": 29900, "US": 14999 } }
}
```

Files are written by the price import (`.github/workflows/refresh-prices.yml`)
and only ever rewritten by a later run on the same day.
