# Working in this repo

## Deploys are gated — do not add `[deploy]` to commit messages

Production does **not** build on every push. `vercel.json`'s `ignoreCommand`
(`scripts/vercel-ignore-build.sh`) skips any commit whose SUBJECT LINE lacks
the literal marker `[deploy]`, and `.github/workflows/production-deploy.yml`
lands one such commit a day, dispatched by the morning price import right after
it publishes the public data snapshot (fallback: a 22:00 UTC cron that releases
only if nothing has in 20 hours). The subject only: a body that
mentions the marker in prose must not deploy, and once did.

**Preview and development builds are off** (owner, 2026-10-14). `claude/*`
branches get no deployment at all (`vercel.json`), and the same script skips a
preview of any other branch or pull request unless the commit SUBJECT carries
`[preview]` (any case). Add `[preview]` only when the owner asks for a preview
of that commit: it is a full build against the Preview environment's
databases (schema push, Singapore import, every prerendered page).

Every unnecessary build prerenders ~770 database-backed pages, clears the ISR
page cache and orphans much of the Data Cache (an `unstable_cache` key
contains the callback's minified source). At 10–30 pushes a day that alone
exhausted a Neon transfer allowance every three days — see DECISIONS.md,
"Network transfer: the deploy cadence was the burn", 2026-09-11.

Measured 2026-09-14 ("Find the fifth burn before RM10 dies", DECISIONS.md):
even with every session following this rule as written, `[deploy]` landed on
**16 commits in RM9's four-day life — ~4/day, not the ~1/day the gate assumes**.
About half were legitimate feature commits carrying the marker because "push
to prod" was read as "deploy this specific change right now". The arithmetic
alone explains a project dying on the old three-day schedule. The gate's
mechanism was never broken; its premise was.

So, for automated sessions:

- **Never** put `[deploy]` (any casing) in a commit or merge SUBJECT on your
  own initiative. Ordinary work waits for the daily release; that is the point.
  Explaining the gate in a commit BODY is fine and does not deploy.
- **"Push to prod" / "ship this" defaults to landing on `main` and riding the
  daily release — it does NOT by itself mean "deploy this exact
  commit right now".** Add `[deploy]` only when the user says the release is
  urgent (can't wait for the next scheduled build), and say so explicitly in
  the summary. If it's ambiguous whether a request means "get it live" or
  "get it live immediately", ask rather than defaulting to `[deploy]`.
- Do not add `generateStaticParams` prewarming back to database-backed dynamic
  routes, and do not lower a page's `export const revalidate` — see the egress
  rules at the top of `src/lib/db.ts` before adding any query. Since 2026-10-14
  (owner) no new page, layout or route handler goes under 21600 (six hours):
  21600 for pages buyers act on, 86400 for slow content. A loader cache under
  the page drags it down (rule 5), and a route handler that is a plain function
  on Vercel caches only through its CDN header (DECISIONS.md, "Cached pages
  refresh every 6 to 24 hours").
- Never wrap a loader that already caches itself (`getPriceMovers`,
  `getUndervalued`, `getCachedRisingCards`, `getSealedGroups`, `getMarketIndex`,
  the arbitrage loaders…) in another `unstable_cache`, and never call one from
  inside an `unstable_cache` callback: Next.js bypasses the inner cache there and
  the loader recomputes on every outer miss (`tests/nested-cache.test.ts`).

## Databases

Two Neon projects: operational and history. The live names rotate (RM9 and
`HISTORY_DATABASE_URL_4` as of 2026-10-17) — `OPERATIONAL_VARS` / the history
chain in `src/lib/db-chains.ts` are the source of truth, not this file. Both resolve
through `src/lib/db-chains.ts`; never hand-roll a connection chain in a script
(`tests/db-chain.test.ts` fails if you do). Free-tier transfer is 5 GB/month
per project; `.github/workflows/egress-audit.yml` measures where it goes.

Public price history (the card and sealed series) is NOT in Neon: since
2026-10-03 it is one JSON file per day in `data/price-history/`
(`src/lib/price-history-store.ts`), written by every import and committed to
`main` by `refresh-prices.yml`. The history project keeps only private history
(`ClickEvent`). That directory is published with the source, so never write
anything private to it.

The rest of the PUBLIC data (cards, store listings, sealed and eBay listings)
is also exported to `data/public/` every morning (`src/lib/public-data/`,
`scripts/export-public-data.ts`). `PUBLIC_DATA_MODE` (Vercel variable: `db`
default, `fallback`, `files`) decides whether the site reads it instead of
Neon; reads route through `lib/db.ts` automatically, so call sites need no
change. Never add a private model or column to `PUBLIC_MODELS` or the export,
and keep any cron or alert reader inside `liveRoute` / `withLiveData`.

## The site watches itself

`.github/workflows/ops-monitor.yml` runs `scripts/ops-monitor.ts` every three hours and
emails the owner when something needs a look (Neon transfer limits, eBay, price imports,
scheduled jobs, the live site, Stripe, email, the inbox); `/admin/health` shows the same.
It runs in GitHub Actions on purpose, so it works when the database or the deploy is what
broke. **When you add a scheduled job, an external API or anything with a limit, add a check
for it** in `src/lib/ops/checks.ts` (see `docs/ops-monitor.md`). Every new public form
must call `notifyOwnerBounded` after saving. The owner is not watching.

## Checks

```
npm run typecheck
npm run lint
npm test            # node --test over tests/*.test.ts; needs `npx prisma generate` first
```

Typecheck needs BOTH Prisma clients: `npm run db:generate` (the Riftbound one
and the Pokémon section's, `prisma/pokemon/schema.prisma`). The Pokémon section
is self-contained and removable — read `docs/pokemon/README.md` before touching
anything under `src/**/pokemon/`, and never point it at a Riftbound database.

Record non-obvious decisions in `DECISIONS.md` (newest at the bottom), in the
same style as the entries already there.

Read `docs/CURRENT-STATE.md` first. It lists the rules and decisions still in
force, each linked to its entry, so check it before proposing something an
entry already settled. If your entry changes or reverses one of its bullets,
update that bullet too. `docs/DECISIONS-INDEX.md` lists every entry by month.
Run `npm run decisions:index` after adding or editing an entry: it regenerates
the index and fails if a CURRENT-STATE link no longer lands on its entry.
