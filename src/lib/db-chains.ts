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
 * Operational database (Card, RetailerPrice, users, marketplace).
 *
 *   RM11 — the ONLY operational variable, in service since 2026-08-29 (RM10, its
 *         predecessor, neared its 5 GB monthly transfer allowance). Like RM10
 *         and RM9 before it, it is a SINGLE name, not a chain — a deliberate
 *         departure from the RM3 through RM8 era, when each was a FALLBACK CHAIN
 *         (CURRENT-first, falling through to older, often exhausted projects),
 *         and every real outage this database has had traced back to that
 *         shape, not to the database itself.
 *
 * ── WHY THIS IS ONE NAME NOW, NOT ANOTHER CHAIN ──────────────────────────────
 * resolveVar() below selects the first variable that is merely SET — precedence,
 * never health. With a multi-entry chain, an exhausted CURRENT project doesn't
 * error, it silently demotes every read to a stale or empty fallback, and ~84
 * `.catch(() => [])` sites across src/ turn that into missing data rather than
 * an error page (see the 2026-08-22 outage this comment used to describe in
 * detail — RM7 exhausted its transfer allowance, the "rollback" RM8 turned out
 * to be reachable and completely empty because the migration that fills a
 * fallback had never been run, and the site showed no in-stock listings for
 * hours before anyone thought to suspect the database). A single name can still
 * fail, but it fails LOUDLY — P1001, not silence — which is the trade this
 * project now makes deliberately: no emergency fallback lever, but no more
 * silently-serving-garbage incidents either.
 *
 * RM3 through RM10 and DATABASE_URL_2 are retired and stay out of this chain —
 * available to the migration tasks by explicit name (see
 * migrate-main-db-to-rm11 and its predecessors in .github/workflows/maintenance.yml).
 * DATABASE_URL is ALSO not in this chain anymore: it is read directly by
 * prisma/schema.prisma's env("DATABASE_URL") for local dev and by the Prisma
 * CLI, never by the running app (src/lib/db.ts constructs PrismaClient with an
 * explicit datasourceUrl override), so its presence or absence here has no
 * effect on what the app resolves to.
 */
export const OPERATIONAL_VARS = ["RM11"] as const;

/**
 * History database (PriceHistory, ClickEvent), CURRENT-first.
 *
 *   RH6                    — in service since 2026-09-02. Unlike RH8 through
 *                            RH11 (each a freshly provisioned, genuinely empty
 *                            project), this cutover deliberately RECYCLES RH6 —
 *                            the account it retired to in 2026-08-04, which had
 *                            been sitting as a drained migration source ever
 *                            since. A 2026-09-02 probe-databases run confirmed it
 *                            reports User=0 (a real history project, unlike
 *                            RH5 — see below), and migrate-history-db-to-rh6
 *                            re-checked that live, immediately before truncating
 *                            it, rather than trusting the probe's memory.
 *                            The migrate-history top-up task ran FIRST and drained
 *                            RH6's own deep 2026-06-06..08-04 rows (249,155 of
 *                            them) forward into RH11, so nothing from RH6's prior
 *                            term was lost in the TRUNCATE below it.
 *                            migrate-history-db-to-rh6 then restored a row-count
 *                            verified copy of RH11 (Card 1,434, ClickEvent 698,
 *                            PriceHistory 341,824 — up from RH11's own 336,656
 *                            precisely because of that top-up).
 *   RH11                    — the rollback: served 2026-08-31 to 2026-09-02 and
 *                            holds every row written in that window. At/near its
 *                            5 GB transfer allowance, which is why this rotation
 *                            happened, but still reachable. Only ever selected if
 *                            RH6 is UNSET — a safety net for a missing secret, not
 *                            a health check, so a slow-but-present RH6 never
 *                            silently demotes to it (resolveVar is precedence,
 *                            never health; see OPERATIONAL_VARS above for the
 *                            outage that shape caused on the operational side).
 *   DATABASE_URL           — the terminal case, meaning "no separate history
 *                            project is configured; history shares the
 *                            operational database". db-history.ts's
 *                            historyIsSplit depends on this staying last.
 *
 * RH5 IS DELIBERATELY ABSENT, and not because it is orphaned. The 2026-08-23
 * probe found it holding User=85, CollectionCard=374, Order=4,
 * MarketplaceListing=11, RetailerPrice=39,635 — a full OPERATIONAL snapshot from
 * an early term, not a history project at all. It was briefly the intended target
 * of the RH8 rotation; the migration's User-row guard refused it. A 2026-09-02
 * probe (run to pick THIS rotation's target) confirmed it still holds that same
 * data — RH5 remains permanently excluded, never a candidate to recycle. It is
 * also one of the account-recovery sources probe-databases exists to find, so it
 * should be left intact rather than reused.
 *
 * RH10 drops out of this cutover (it was RH11's rollback, and a chain only needs
 * one). RH9, RH8, HISTORY_DATABASE_URL_4/_3, HISTORY_DATABASE_URL (bare) and _2
 * were superseded earlier. RH7 is orphaned — 0% of its card ids resolve against
 * the live catalogue.
 */
export const HISTORY_VARS = ["RH6", "RH11", "DATABASE_URL"] as const;

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
