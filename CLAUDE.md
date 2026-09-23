# Working in this repo

## Deploys are gated — do not add `[deploy]` to commit messages

Production does **not** build on every push. `vercel.json`'s `ignoreCommand`
(`scripts/vercel-ignore-build.sh`) skips any commit whose SUBJECT LINE lacks
the literal marker `[deploy]`, and `.github/workflows/production-deploy.yml`
lands one such commit a day at 08:00 UTC. The subject only: a body that
mentions the marker in prose must not deploy, and once did.

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
  daily 08:00 UTC release — it does NOT by itself mean "deploy this exact
  commit right now".** Add `[deploy]` only when the user says the release is
  urgent (can't wait for the next scheduled build), and say so explicitly in
  the summary. If it's ambiguous whether a request means "get it live" or
  "get it live immediately", ask rather than defaulting to `[deploy]`.
- Do not add `generateStaticParams` prewarming back to database-backed dynamic
  routes, and do not lower a page's `export const revalidate` — see the egress
  rules at the top of `src/lib/db.ts` before adding any query.
- Never wrap a loader that already caches itself (`getPriceMovers`,
  `getUndervalued`, `getCachedRisingCards`, `getSealedGroups`, `getMarketIndex`,
  the arbitrage loaders…) in another `unstable_cache`, and never call one from
  inside an `unstable_cache` callback: Next.js bypasses the inner cache there and
  the loader recomputes on every outer miss (`tests/nested-cache.test.ts`).

## Databases

Two Neon projects: operational and history. The live names rotate (RM3 and
`HISTORY_DATABASE_URL_3` as of 2026-09-22) — `OPERATIONAL_VARS` / the history
chain in `src/lib/db-chains.ts` are the source of truth, not this file. Both resolve
through `src/lib/db-chains.ts`; never hand-roll a connection chain in a script
(`tests/db-chain.test.ts` fails if you do). Free-tier transfer is 5 GB/month
per project; `.github/workflows/egress-audit.yml` measures where it goes.

## Checks

```
npm run typecheck
npm run lint
npm test            # node --test over tests/*.test.ts; needs `npx prisma generate` first
```

Record non-obvious decisions in `DECISIONS.md` (newest at the bottom), in the
same style as the entries already there.
