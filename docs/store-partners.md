# Store partners: who to ask, what to send, how to add one

The program: a store gives RiftCompare shoppers an exclusive discount code and,
optionally, a commission link from its affiliate app. We show the code beside its
prices and add the commission parameter to its links. It never changes the store's
place in any comparison. The public offer is `/stores/partners`; the decision is in
DECISIONS.md, "Store partner codes: the store links start earning" (2026-10-26).

## Who to ask first

`audit-clicks` cannot rank stores any more (`ClickEvent` is not written since
`/api/click` became a no-op). Until clicks are measured again, rank by the rows
that get clicked: how many cards a store is the **cheapest in-stock offer** for in
its market. Recompute from the public snapshot (`data/public/listings/*.json`):
group in-stock rows by market, skip eBay, TCGplayer, Cardmarket and Amazon, and
count each card's cheapest store.

On 2026-10-26 the top ten were:

| # | Store | Market | Cards where it is cheapest | In-stock listings |
|---|---|---|---|---|
| 1 | T-REX TCG | EU | 598 | 886 |
| 2 | TCG Club House | SG | 503 | 655 |
| 3 | Atomili Collectables | US | 478 | 785 |
| 4 | Obsession Gaming | AU | 289 | 750 |
| 5 | Troll Australia | AU | 255 | 627 |
| 6 | Action Point Games | SG | 254 | 992 |
| 7 | Yard's Games | UK | 252 | 925 |
| 8 | Evolution Trading Cards | UK | 235 | 538 |
| 9 | Red Sun Collectables | UK | 218 | 345 |
| 10 | Blacklist Cards | AU | 204 | 1,052 |

The owner sends the emails (never automated: it is outside contact). Each store
can check what we already send it, because every link carries
`utm_source=riftcompare`.

## The email

Subject: RiftCompare shoppers, and a code just for them

> Hi {store} team,
>
> I run RiftCompare (riftcompare.com), the Riftbound price comparison site. We
> track {listings} of your Riftbound singles, and on {cheapest} cards you are the
> cheapest in-stock store in {market}, so you are the store we send those
> shoppers to. You can see that traffic in your analytics under
> utm_source=riftcompare.
>
> We'd like to show an exclusive code beside your prices, something like RIFT5
> for 5% off singles, that only our visitors get. Your discount report then
> counts every order we send. If you use an affiliate app (Shopify Collabs,
> UpPromote, GoAffPro), we'd also add its referral link, and you pay the
> commission you choose only when someone buys. If you don't, a percentage of
> the orders that use the code works too.
>
> It never changes where you rank: we sort by price, the same for every store,
> and the price we show is yours before the code. No fee, no contract, and you
> can stop any time. The details are at riftcompare.com/stores/partners.
>
> Would you be up for it?
>
> Bill, RiftCompare

## Adding a partner

1. Test the code at the store's checkout on a real cart.
2. Add an entry to `STORE_PARTNER_DEALS` in `src/lib/store-partner-deals.ts`:
   `host` (bare, no www), `name`, `since`, `code`, `offer` (short, in the store's
   words), `checked` (today), `until` if it ends, and `ref` (the affiliate app's
   query parameter and our value) if it has one.
3. `npm test` (the list's shape is checked), land on `main`, ride the daily
   release.
4. Re-test every code at least monthly and move `checked`. The ops monitor's
   `stores:codes` warns a week before a code would hide itself.
