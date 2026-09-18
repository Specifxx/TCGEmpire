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
 *   RM12 — the ONLY operational variable, in service since 2026-09-18. RM10
 *        (live since 2026-09-14) reached its own 5 GB monthly transfer
 *        allowance after four days — the same ~2 GB/day burn every project in
 *        this rotation has ended on, and the SECOND full project life since
 *        the 2026-09-11 deploy-cadence gate. That gate was the leading
 *        explanation for the burn; two projects dying on the old schedule
 *        since it landed retires that explanation. The real query is still
 *        unidentified — run audit-egress a few hours after this cutover.
 *
 *        RM12 IS A GENUINELY NEW PROJECT, and that is a deliberate break from
 *        the last six cutovers. Every one of those recycled a rested name
 *        (RM6 → RM7 → RM8 → RM9 → RM10) and inherited whatever was left of
 *        that project's monthly allowance. By 2026-09-18 the rotation had run
 *        out of genuinely rested names: RM11, the obvious candidate, is itself
 *        at its limit from its 2026-08-29..09-03 term, and RM8 probes
 *        UNREACHABLE. A new project is the only thing that starts with a full
 *        5 GB.
 *
 *        THIS FILE'S RECYCLE RULE THEREFORE DOES NOT APPLY, and its inverse
 *        does. "A recycled target must be re-verified each time it comes back
 *        around" is about a project that might still hold real data; RM12 has
 *        never been used, so the check that replaced it was the opposite one —
 *        migrate-main-db-rm10-to-rm12's pre-restore inventory asserts RM12 is
 *        EMPTY, on the grounds that a "new" project holding rows is not the
 *        project you think it is. It came back empty.
 *
 *        The cutover itself was verified, not assumed. A 2026-09-18
 *        probe-databases run first confirmed RM10 still REACHABLE and ahead of
 *        every other project on every metric (User=370, PriceAlert=213,
 *        CollectionCard=1823, RetailerPrice=131,599, Card=1431) — so this was a
 *        planned rotation with the data fully drainable, not a recovery from a
 *        dead project. migrate-main-db-rm10-to-rm12 then dumped and restored
 *        it with EVERY table's row count matching exactly (User 370,
 *        RetailerPrice 131,599, PriceAlert 213, SealedListing 2,727,
 *        StoreHealthSnapshot 4,661, PremiumClick 277, Order 9 …), and the
 *        closing `prisma db push` reported the schema already in sync.
 *
 *        Like RM10, RM9, RM8, RM7, RM6 and RM11 before it, RM12 is a SINGLE
 *        name, not a chain — a deliberate departure from the RM3 through RM8
 *        era, when each was a FALLBACK CHAIN (CURRENT-first, falling through
 *        to older, often exhausted projects), and every real outage this
 *        database has had traced back to that shape, not to the database
 *        itself.
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
 * RM3 through RM11 (and RM10, as of this cutover) and DATABASE_URL_2 are retired and stay out
 * of this chain — available to the migration tasks by explicit name (see
 * migrate-main-db-rm10-to-rm12 and its predecessors in .github/workflows/maintenance.yml).
 * DATABASE_URL is ALSO not in this chain anymore: it is read directly by
 * prisma/schema.prisma's env("DATABASE_URL") for local dev and by the Prisma
 * CLI, never by the running app (src/lib/db.ts constructs PrismaClient with an
 * explicit datasourceUrl override), so its presence or absence here has no
 * effect on what the app resolves to.
 */
export const OPERATIONAL_VARS = ["RM12"] as const;

/**
 * History database (PriceHistory, ClickEvent), CURRENT-first.
 *
 *   HISTORY_DATABASE_URL_2 — in service since 2026-09-17, once
 *                            HISTORY_DATABASE_URL (see below) reached its own
 *                            5 GB monthly transfer allowance after five days
 *                            live — its longest stint yet, but still the same
 *                            terminal burn every prior history project has
 *                            shown. This cutover RECYCLES
 *                            HISTORY_DATABASE_URL_2 — retired since the
 *                            2026-08-19 HISTORY_DATABASE_URL_3 cutover —
 *                            rather than provisioning a new project.
 *
 *                            UNLIKE AN UNCHECKED RECYCLE, its old contents
 *                            were verified fresh, not assumed from that old
 *                            term (this file's own rule: a recycled target
 *                            must be re-verified each time it comes back
 *                            around, never trusted from old findings). A
 *                            2026-09-17 probe-history run found it still
 *                            holding real, outdated numbers from that old
 *                            term (rows=45,067, days=2026-08-04..2026-08-09,
 *                            distinctCards=1390, matching RM10 1385/1390
 *                            (100%) — not zeroes, the signature of a
 *                            genuinely recycled project rather than a fresh
 *                            one, and zero GLOBAL rows on its own, predating
 *                            the 2026-09-05 GLOBAL-history migration just like
 *                            every other project's pre-cutover term has), then
 *                            migrate-history-db-hdu-to-hdu2 did a full
 *                            pg_dump/restore of HISTORY_DATABASE_URL
 *                            (rows=423,999, days=2026-06-06..2026-09-17,
 *                            distinctCards=1426, GLOBAL rows=82,175) over it,
 *                            `pg_restore` dropping and reloading Card/
 *                            ClickEvent/PriceHistory, every count verified to
 *                            match exactly.
 *   HISTORY_DATABASE_URL   — the rollback: served 2026-09-12..09-17 (five
 *                            days — see git history for the long account of
 *                            ITS OWN cutover, from RH10) — reachable and
 *                            already holds the GLOBAL series, so it remains a
 *                            genuinely safe rollback. Only ever selected if
 *                            HISTORY_DATABASE_URL_2 is UNSET — a safety net
 *                            for a missing secret, not a health check, so a
 *                            near-exhausted-but-present HISTORY_DATABASE_URL_2
 *                            never masks a genuinely missing
 *                            HISTORY_DATABASE_URL (resolveVar is precedence,
 *                            never health; see OPERATIONAL_VARS above for the
 *                            outage that shape caused on the operational
 *                            side).
 *   DATABASE_URL           — the terminal case, meaning "no separate history
 *                            project is configured; history shares the
 *                            operational database". db-history.ts's
 *                            historyIsSplit depends on this staying last.
 *
 * RH10 DROPS OUT OF THIS CUTOVER (it was HISTORY_DATABASE_URL's own rollback
 * for the 2026-09-12..09-17 stint, and a chain only needs one) — still
 * reachable, still holding the GLOBAL series, available to migration tasks by
 * explicit name if ever needed again.
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
 * RH6, RH7, RH8, RH9, RH11 AND HISTORY_DATABASE_URL_3/_4 STAY OUT OF THIS
 * CHAIN — reachable (the 2026-09-17 probe-history run found all of them so,
 * each holding real if outdated data), but nothing has asked to cut over onto
 * any of them, and this file's own "ONLY LIVE PROJECTS BELONG IN A RUNTIME
 * CHAIN" rule means being reachable is not enough on its own to earn a chain
 * slot. If a future rotation targets one, treat it as a fresh candidate
 * requiring the same live guard every recycled target gets — do not assume
 * OLD findings (documented in earlier git history) still hold.
 */
export const HISTORY_VARS = ["HISTORY_DATABASE_URL_2", "HISTORY_DATABASE_URL", "DATABASE_URL"] as const;

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
