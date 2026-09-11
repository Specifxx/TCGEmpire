# Working in this repo

## Deploys are gated — do not add `[deploy]` to commit messages

Production does **not** build on every push. `vercel.json`'s `ignoreCommand`
(`scripts/vercel-ignore-build.sh`) skips any commit whose message lacks the
literal marker `[deploy]`, and `.github/workflows/production-deploy.yml` lands
one such commit a day at 08:00 UTC. Every unnecessary build prerenders ~770
database-backed pages and clears the ISR page cache; at 10–30 pushes a day that
alone exhausted a Neon transfer allowance every three days (DECISIONS.md,
"Network transfer: the deploy cadence was the burn", 2026-09-11).

So, for automated sessions:

- **Never** put `[deploy]` (any casing) in a commit or merge message on your
  own initiative. Ordinary work waits for the daily release; that is the point.
- Add it **only** when the user explicitly asks for an immediate release, and
  say so in the summary.
- Do not add `generateStaticParams` prewarming back to database-backed dynamic
  routes, and do not lower a page's `export const revalidate` — see the egress
  rules at the top of `src/lib/db.ts` before adding any query.
- Never wrap a loader that already caches itself (`getPriceMovers`,
  `getUndervalued`, `getCachedRisingCards`, `getSealedGroups`, `getMarketIndex`,
  the arbitrage loaders…) in another `unstable_cache`, and never call one from
  inside an `unstable_cache` callback: Next.js bypasses the inner cache there and
  the loader recomputes on every outer miss (`tests/nested-cache.test.ts`).

## Databases

Two Neon projects: operational (`RM9`) and history (`RH10`). Both resolve
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
