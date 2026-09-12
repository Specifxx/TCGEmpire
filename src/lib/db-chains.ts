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
 *   RM9 — the ONLY operational variable, in service since 2026-09-11. RM8
 *        (live only since 2026-09-08) neared its own 5 GB monthly transfer
 *        allowance after about three days — the same ~2 GB/day burn every
 *        prior project has shown. This cutover RECYCLES RM9 — the account it
 *        was live on 2026-08-23..~08-26, before RM10 replaced it once RM9's
 *        OWN allowance ran out — rather than provisioning a new RM12.
 *
 *        UNLIKE AN UNCHECKED RECYCLE, RM9's old contents were verified fresh,
 *        not assumed from the 2026-08-26-era precedent (this file's own rule:
 *        a recycled target must be re-verified each time it comes back around,
 *        never trusted from old findings). A 2026-09-11 probe-databases run
 *        answered whether RM9's old data had ever been carried forward with
 *        row counts, not a guess:
 *          RM9 (died)  User=209  PriceAlert=40   CollectionCard=634   RetailerPrice=90773
 *          RM10        User=238  PriceAlert=114  CollectionCard=702   RetailerPrice=89828
 *          RM11        User=281  PriceAlert=131  CollectionCard=1029  RetailerPrice=90721
 *          RM6         User=298  PriceAlert=158  CollectionCard=1160  RetailerPrice=90372
 *          RM7         User=308  PriceAlert=158  CollectionCard=1163  RetailerPrice=89877
 *          RM8 (live)  User=322  PriceAlert=219  CollectionCard=1195  RetailerPrice=128993
 *        Every metric climbs monotonically from RM9 through to RM8 — the
 *        signature of data that was carried forward and grew normally, not an
 *        orphaned last copy. So migrate-main-db-rm8-to-rm9 restored a
 *        row-count verified copy of RM8 (User 322, Card 1,429, RetailerPrice
 *        128,993, and every other table matching exactly) over it,
 *        `pg_restore --clean` dropping and recreating every table from the RM8
 *        dump.
 *
 *        Like RM8, RM7, RM6, RM11 and RM10 before it, RM9 is a SINGLE name,
 *        not a chain — a deliberate departure from the RM3 through RM8 era
 *        (its FIRST term), when each was a FALLBACK CHAIN (CURRENT-first,
 *        falling through to older, often exhausted projects), and every real
 *        outage this database has had traced back to that shape, not to the
 *        database itself.
 *
 * ── WHY THIS IS ONE NAME NOW, NOT ANOTHER CHAIN ──────────────────────────────
 * resolveVar() below selects the first variable that is merely SET — precedence,
 * never health. With a multi-entry chain, an exhausted CURRENT project doesn't
 * error, it silently demotes every read to a stale or empty fallback, and ~84
 * `.catch(() => [])` sites across src/ turn that into missing data rather than
 * an error page (see the 2026-08-22 outage this comment used to describe in
 * detail — RM7 exhausted its transfer allowance that time, the "rollback" RM8
 * turned out to be reachable and completely empty because the migration that
 * fills a fallback had never been run, and the site showed no in-stock listings
 * for hours before anyone thought to suspect the database). A single name can
 * still fail, but it fails LOUDLY — P1001, not silence — which is the trade
 * this project now makes deliberately: no emergency fallback lever, but no more
 * silently-serving-garbage incidents either.
 *
 * RM3 through RM11 (bar RM9 itself) and DATABASE_URL_2 are retired and stay out
 * of this chain — available to the migration tasks by explicit name (see
 * migrate-main-db-rm8-to-rm9 and its predecessors in .github/workflows/maintenance.yml).
 * DATABASE_URL is ALSO not in this chain anymore: it is read directly by
 * prisma/schema.prisma's env("DATABASE_URL") for local dev and by the Prisma
 * CLI, never by the running app (src/lib/db.ts constructs PrismaClient with an
 * explicit datasourceUrl override), so its presence or absence here has no
 * effect on what the app resolves to.
 */
export const OPERATIONAL_VARS = ["RM9"] as const;

/**
 * History database (PriceHistory, ClickEvent), CURRENT-first.
 *
 *   HISTORY_DATABASE_URL   — in service since 2026-09-12, once RH10 (see below)
 *                            reached its own 5 GB monthly transfer allowance
 *                            after two days live — the same burn every prior
 *                            history project has shown. This cutover RECYCLES
 *                            HISTORY_DATABASE_URL — the OLDEST history variable
 *                            in the whole rotation, retired since the
 *                            2026-08-16 HISTORY_DATABASE_URL_2 cutover — rather
 *                            than provisioning a new project.
 *
 *                            UNLIKE AN UNCHECKED RECYCLE, its old contents were
 *                            verified fresh, not assumed from that old term
 *                            (this file's own rule: a recycled target must be
 *                            re-verified each time it comes back around, never
 *                            trusted from old findings). A 2026-09-12
 *                            probe-history run found it still holding real,
 *                            outdated numbers from that old term (rows=45,067,
 *                            days=2026-08-04..2026-08-09, distinctCards=1390,
 *                            matching RM9 1385/1390 — not zeroes, the signature
 *                            of a genuinely recycled project rather than a
 *                            fresh one), then migrate-history-db-rh10-to-hdu did
 *                            a full pg_dump/restore of RH10 (Card=1,436,
 *                            ClickEvent=698, PriceHistory=422,589) over it,
 *                            `pg_restore` dropping and reloading Card/
 *                            ClickEvent/PriceHistory, every count verified to
 *                            match exactly.
 *
 *                            THE PART THAT MATTERS MOST HERE: its own prior
 *                            term (2026-08-04..08-09) predates the 2026-09-05
 *                            GLOBAL-history migration
 *                            (scripts/backfill-global-history.ts,
 *                            price-import.ts collapsing every market's
 *                            PriceHistory rows into one country="GLOBAL" row
 *                            per card per day — historySource() in
 *                            price-history.ts now ALWAYS reads
 *                            country=GLOBAL, unconditionally) and held zero
 *                            GLOBAL rows on its own. The pg_dump/restore FROM
 *                            RH10 is what actually carries the GLOBAL series
 *                            onto it — HISTORY_DATABASE_URL was never
 *                            populated with GLOBAL rows any other way.
 *   RH10                   — the rollback: served 2026-09-10..09-12 (two
 *                            days — see git history for the long account of
 *                            ITS OWN cutover, from RH9) — reachable and
 *                            already holds the GLOBAL series, so it remains a
 *                            genuinely safe rollback. Only ever selected if
 *                            HISTORY_DATABASE_URL is UNSET — a safety net for
 *                            a missing secret, not a health check, so a
 *                            near-exhausted-but-present HISTORY_DATABASE_URL
 *                            never masks a genuinely missing RH10 (resolveVar
 *                            is precedence, never health; see
 *                            OPERATIONAL_VARS above for the outage that shape
 *                            caused on the operational side).
 *   DATABASE_URL           — the terminal case, meaning "no separate history
 *                            project is configured; history shares the
 *                            operational database". db-history.ts's
 *                            historyIsSplit depends on this staying last.
 *
 * RH9 DROPS OUT OF THIS CUTOVER (it was RH10's own rollback for the
 * 2026-09-10..09-12 stint, and a chain only needs one) — still reachable,
 * still holding the GLOBAL series, available to migration tasks by explicit
 * name if ever needed again.
 *
 * RH5 IS DELIBERATELY ABSENT, and not because it is orphaned. The 2026-08-23
 * probe found it holding User=85, CollectionCard=374, Order=4,
 * MarketplaceListing=11, RetailerPrice=39,635 — a full OPERATIONAL snapshot from
 * an early term, not a history project at all. It was briefly the intended target
 * of the RH8 rotation; the migration's User-row guard refused it. A 2026-09-02
 * probe (run to pick the RH6 rotation's target) confirmed it still holds that
 * same data — RH5 remains permanently excluded, never a candidate to recycle. It
 * is also one of the account-recovery sources probe-databases exists to find, so
 * it should be left intact rather than reused.
 *
 * RH6, RH7, RH8, RH11 AND HISTORY_DATABASE_URL_2/_3/_4 STAY OUT OF THIS CHAIN —
 * reachable (a 2026-09-12 probe-history run found all of them so, each holding
 * real if outdated data), but nothing has asked to cut over onto any of them,
 * and this file's own "ONLY LIVE PROJECTS BELONG IN A RUNTIME CHAIN" rule means
 * being reachable is not enough on its own to earn a chain slot. If a future
 * rotation targets one, treat it as a fresh candidate requiring the same live
 * guard every recycled target gets — do not assume OLD findings (documented in
 * earlier git history) still hold.
 */
export const HISTORY_VARS = ["HISTORY_DATABASE_URL", "RH10", "DATABASE_URL"] as const;

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
