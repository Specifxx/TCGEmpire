/**
 * THE database resolution chains, in one place, as ordered variable NAMES.
 *
 * WHY THIS FILE EXISTS. These chains were copy-pasted into roughly a dozen
 * places — src/lib/db.ts, src/lib/db-history.ts, scripts/build-db-push.sh, four
 * GitHub Actions workflows, and seven standalone scripts that each resolve a
 * database themselves. Every rotation had to update all of them, and it never
 * did. The drift is not theoretical; each of these was found in production:
 *
 *   • build-db-push.sh's history chain named the two OLDEST projects, reversed,
 *     so deploys pushed schema to a project the app never read.
 *   • db-history.ts's copy of the operational chain stopped at RM3 while db.ts
 *     had moved to RM5, so ensureHistoryCards() silently no-opped.
 *   • probe-history-dbs.ts still led with RM6 after the RM7 cutover, so the
 *     "how many cards resolve?" survey answered against RETIRED RM5 — the one
 *     number that script exists to produce.
 *   • migrate-history.ts's MAIN_URL still led with RM6, and that list feeds
 *     copyCards(); resolving it to an old project seeds the target's Card table
 *     from a stale catalogue, after which the FK filter silently drops every
 *     history row for any newer card.
 *
 * Each one was silent by construction. Anything that runs in Node imports from
 * here now. The two places that CANNOT import — build-db-push.sh (bash, runs
 * pre-build) and the workflow `env:` blocks (YAML) — are pinned to this file by
 * tests/db-chain.test.ts instead.
 *
 * ── ONLY LIVE PROJECTS BELONG IN A RUNTIME CHAIN ────────────────────────────
 * A retired Neon project is eventually DECOMMISSIONED, but its variable often
 * lingers in Vercel and GitHub. Because these chains fall through on an UNSET
 * variable — never on an unreachable one — a lingering dead name is not a
 * safety net, it is a trap: the app selects it, connects to nothing, and fails
 * in a way that looks like an outage rather than a misconfiguration. Keeping
 * the list short is therefore a correctness property, not tidiness.
 *
 * Old projects still need to be DRAINED before they are switched off, but that
 * is a migration concern: those tasks name their source explicitly (see the
 * migrate-* steps in .github/workflows/maintenance.yml and the `sourceUrls`
 * inventory in scripts/migrate-history.ts). Draining does not require, and must
 * not depend on, the runtime chain.
 */

/**
 * Operational database (Card, RetailerPrice, users, marketplace), CURRENT-first.
 *
 *   RM8            — in service since 2026-08-22, restored from RM6.
 *   RM7            — served 2026-08-20..22. Demoted, NOT removed: it still holds
 *                    the writes from that window, so it is worth draining forward
 *                    once its allowance resets. It cannot serve today.
 *   DATABASE_URL   — last, and kept for two reasons that are not "it is a good
 *                    fallback": prisma/schema.prisma reads env("DATABASE_URL")
 *                    literally, and local development sets only that name in
 *                    .env.local. In production it should be treated as dead.
 *
 * ── THE 2026-08-22 OUTAGE, because the shape will recur ─────────────────────
 * The site showed NO IN-STOCK LISTINGS. Nothing was broken in the query layer:
 * RM7 had gone over its Neon transfer allowance two days after cutover, and
 * resolveVar() below selects the first variable that is merely SET — precedence,
 * never health — so an exhausted RM7 stayed selected. The reads failed, and ~84
 * `.catch(() => [])` sites across src/ turned those failures into empty arrays.
 *
 * AN EXHAUSTED DATABASE PRESENTS AS MISSING DATA HERE, NOT AS AN ERROR PAGE.
 * If data disappears site-wide, suspect this chain before suspecting the code
 * that reads it, and run the probe-databases maintenance task first.
 *
 * The rollback was also a fiction: RM8 was in this chain as "the designated
 * rollback" the whole time, but the migrate-main-db-to-rm8 task that fills it had
 * never been run, so the 2026-08-22 probe found it REACHABLE AND COMPLETELY EMPTY
 * — no schema at all. A named fallback is not a fallback until something has
 * copied data into it. It was restored from RM6 before this reorder shipped.
 *
 * ── WHY THE ORDER CHANGED RATHER THAN RM7 BEING UNSET IN VERCEL ─────────────
 * Both promote RM8, but only one moves the WRITERS too. The GitHub Actions
 * chains — notably refresh-prices.yml, the price importer — resolve
 * `secrets.RM7 || vars.RM7 || secrets.RM8 || ...`, the same precedence as the
 * app. Unsetting RM7 in Vercel alone would have moved the app to RM8 while the
 * importer kept writing to a dead RM7: stock would never have refreshed and the
 * cutover would have looked like it failed. Flipping the ORDER here and in every
 * YAML chain in lockstep moves readers and writers together in one deploy, and
 * needs no environment change at all.
 *
 * RM3/RM4/RM5/RM6/DATABASE_URL_2 stay out of the runtime chain — retired, and
 * available to the migration tasks by explicit name.
 */
export const OPERATIONAL_VARS = ["RM8", "RM7", "DATABASE_URL"] as const;

/**
 * History database (PriceHistory, ClickEvent), CURRENT-first.
 *
 *   HISTORY_DATABASE_URL_4 — in service since 2026-08-21. A RECYCLED project
 *                            name: the 2026-08-21 probe found it still holding
 *                            195,574 orphaned rows (0% card-id match) from its
 *                            earlier term, same as when it was first removed
 *                            from this chain — the migrate-history-db-to-hdu4
 *                            task TRUNCATED it before restoring a fresh,
 *                            row-count-verified copy of _3 (Card 1,434/1,434,
 *                            ClickEvent 698/698, PriceHistory 293,094/293,094).
 *   HISTORY_DATABASE_URL_3 — the rollback: served from 2026-08-19 until this
 *                            cutover, so it holds every row written in that
 *                            window and is reachable.
 *   DATABASE_URL           — the terminal case, meaning "no separate history
 *                            project is configured; history shares the
 *                            operational database". db-history.ts's
 *                            historyIsSplit depends on this staying last.
 *
 * HISTORY_DATABASE_URL (bare) drops out of this cutover — it was the
 * PREVIOUS rollback (byte-identical to _2/_3's 2026-08-04..09 window and 100%
 * joinable per the 2026-08-21 probe), but that role now belongs to _3, and a
 * chain only needs one rollback. It is still reachable, just no longer read.
 * HISTORY_DATABASE_URL_2 was removed on 2026-08-20 (its allowance is spent).
 * RH5/RH7 were removed as orphaned — every survey to date, including
 * 2026-08-21, found 0% of their card ids resolve against the live catalogue,
 * so they cannot render a chart even when they answer. RH6 still holds the
 * deep 2026-06-06..08-04 history and IS joinable, but it is a migration
 * source to be drained forward, not something the app should ever read from
 * directly.
 */
export const HISTORY_VARS = ["HISTORY_DATABASE_URL_4", "HISTORY_DATABASE_URL_3", "DATABASE_URL"] as const;

/** First variable in `vars` that is actually set, by NAME — never its value. */
export function resolveVar(vars: readonly string[]): string | null {
  for (const name of vars) if (process.env[name]) return name;
  return null;
}

/** First variable in `vars` that is actually set, as its URL. */
export function resolveUrl(vars: readonly string[]): string | undefined {
  const name = resolveVar(vars);
  return name ? process.env[name] : undefined;
}
