# /sealed product image fixes — 2026-08-10

Audit of the Sealed Products grid reported four tiles with wrong, broken or
placeholder images. All four traced to **two code defects**, not to bad data that
could be edited in place.

## Where these URLs actually live

There is no data file or CMS entry for sealed images. `SealedListing.imageUrl`
rows are written by `importTcgplayerSealed()` / the store scrapers, and
`getSealedGroups()` resolves a tile's image in this order:

1. the canonical TCGplayer photo for the group (`getCanonicalSealedImages()`),
2. otherwise a store/eBay listing photo (unless the type is in `DISTRUST_STORE_IMAGE`),
3. otherwise the on-brand type-correct graphic in `public/sealed/`.

So the fix is at the point the URLs are *produced*, and it takes effect on the
next `import-sealed` run. Nothing about names, prices or set codes was touched.

## Root cause 1 — a groupKey collision put a deck photo on a booster box

`classifySealed()` ended with a bare `\bdisplay\b` catch-all returning
`"Booster Box"`. `"Vendetta - Showdown Decks: Zed vs Shen Display"` matched it,
so it shared `groupKey = VEN|Booster Box` with the real `"Vendetta - Booster
Display"`. `getCanonicalSealedImages()` keeps the FIRST tcgplayer row per
groupKey, and the Showdown Decks row won.

Fixed by classifying Showdown Decks ahead of the catch-all, as its own type
(`Showdown Decks` / `Showdown Decks Display`), with type-correct fallback
graphics and a sort rank beside Champion Decks.

## Root cause 2 — fabricated CDN URLs for products with no photo

`tcgImageUrl(productId)` builds `…/product/<id>_in_1000x1000.jpg` for *every*
product, whether or not TCGplayer hosts an asset. For products it doesn't, the
CDN answers `403 AccessDenied` (an XML body, not an image). That URL is non-null,
so it beat the on-brand fallback and rendered a broken tile.

The importer now HEAD-probes each image once and stores `null` when there is no
real asset, letting the existing fallback do its job.

## Image changes

Verified against the TCGplayer catalogue API (`mp-search-api`, productLine
`riftbound-league-of-legends-trading-card-game`) on 2026-08-10. Status is the
live HTTP response at time of writing.

| # | Product | Old | New | Verified |
| - | ------- | --- | --- | -------- |
| 1 | Vendetta Booster Box (`VEN\|Booster Box`) | `tcgplayer-cdn…/product/706237_in_1000x1000.jpg` — product **706237 = "Vendetta - Showdown Decks: Zed vs Shen Display"** | `tcgplayer-cdn…/product/693380_in_1000x1000.jpg` — product **693380 = "Vendetta - Booster Display"** | **HTTP 200**, `image/jpeg`, 1000×1000, 113 KB. Visually confirmed as the booster display. |
| 2 | Proving Grounds Case (`OGS\|Proving Grounds Case`) | `…/product/663920_in_1000x1000.jpg` | `null` → `/sealed/sealed-case.png` | Old URL **403 AccessDenied** on every CDN path tried (`_in_1000x1000`, `_in_437x437`, `product-images.tcgplayer.com/{id}`, `fit-in/437x437`). TCGplayer has no asset for 663920. |
| 3 | Unleashed Nexus Night Pack (`UNL\|Nexus Night Pack`) | `…/product/695122_in_1000x1000.jpg` | `null` → `/sealed/sealed-pack.png` | Old URL **403** on every path. No asset for 695122. |
| 4 | Riftbound Bulk Runes Case (`Bulk Runes Case`) | `/sealed/sealed-case.png` (placeholder) | unchanged — `/sealed/sealed-case.png` | Product **678131** exists on TCGplayer but its image **403s** on every path. **Still a placeholder — flagged.** |

### Why no substitute image for 2, 3 and 4

Their sibling SKUs *do* have photos — `678130` (Bulk Runes, non-case), `635460`
(Origins Proving Grounds Box Set, non-case), `675404` / `680454` (Origins /
Spiritforged Nexus Night packs, all HTTP 200). Using one of those would show a
different product: a case is not the single box, and an Origins pack is not an
Unleashed one.

That is precisely the error `DISTRUST_STORE_IMAGE` already exists to prevent —
"stores frequently reuse the BOOSTER BOX photo on their booster-PACK listings, so
the cheapest listing's image is often wrong". Deliberately reproducing it would
trade a visibly-broken tile for a plausibly-wrong one, which is worse. The
on-brand type-correct graphic is honest about being a stand-in.

**Open item:** items 2, 3 and 4 will keep their placeholder until TCGplayer
publishes an asset (the importer now picks one up automatically the first time
the HEAD probe succeeds) or a first-party render is sourced from the publisher.

## Verification

- `npx tsx --test tests/sealed-images.test.ts` — 8 tests. Confirmed to FAIL
  (2 failures) when the classifier fix is reverted, so it pins the real defect.
- `npm test` — full suite.
- `npm run images:check` — build-time image guard.
- `npx tsc --noEmit`, `npm run lint`.

## Dry-run of what the importer will write

Produced by running the real `classifySealed()` and the real `imageExists()`
probe over the live TCGplayer catalogue — no database, no writes:

```
groupKey                     product                                          image the importer will store
------------------------------------------------------------------------------------------------------------
OGN|Booster Box              Origins - Booster Display                        …/product/635368_in_1000x1000.jpg
OGS|Proving Grounds Case     Origins - Proving Grounds Box Set Case           NULL → on-brand fallback
SFD|Booster Box              Spiritforged - Booster Display                   …/product/661934_in_1000x1000.jpg
SFD|Bulk Runes Case          Riftbound: Bulk Runes Case                       NULL → on-brand fallback
UNL|Booster Box              Unleashed - Booster Display                      …/product/678150_in_1000x1000.jpg
UNL|Nexus Night Pack         Unleashed - Nexus Night Promo Pack               NULL → on-brand fallback
VEN|Booster Box              Vendetta - Booster Display                       …/product/693380_in_1000x1000.jpg
VEN|Showdown Decks           Vendetta - Showdown Decks: Zed vs Shen           …/product/697971_in_1000x1000.jpg
VEN|Showdown Decks Display   Vendetta - Showdown Decks: Zed vs Shen Display   …/product/706237_in_1000x1000.jpg

groupKey collisions among watched products: NONE ✓
```

`VEN|Booster Box` now resolves to 693380 (the real booster display) and the
Showdown Decks display has its own group, so 706237 can never win that tile again.

## IMPORTANT — a preview deploy alone will NOT show these fixes

Sealed images are database rows, not files in this repo. A preview build reads
the same `SealedListing` rows as production, so **the tiles will look unchanged
until `import-sealed` runs and rewrites them**.

To actually review the fix:

1. Merge/deploy this branch so the new classifier and probe are live.
2. Run **Actions → Maintenance → `import-sealed`**. That is what rewrites
   `SealedListing`, and only then do the tiles change.
3. Check `/sealed` and confirm the four tiles, then promote to production.

Step 2 writes to the production database. It is the ordinary daily import path,
not a schema change, and it is idempotent — but it is a production data write, so
it is deliberately left for a human to trigger.
