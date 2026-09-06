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
 *   RM7 — the ONLY operational variable, in service since 2026-09-05. RM6
 *        (live only since 2026-09-03) neared its own 5 GB monthly transfer
 *        allowance after about two days — the same ~2 GB/day burn every prior
 *        project has shown. This cutover RECYCLES RM7 — the account it was
 *        live on 2026-08-20..~08-23, before RM8 replaced it once RM7's OWN
 *        allowance ran out — rather than provisioning a new RM12.
 *
 *        UNLIKE RM6/RM11/RM10/RM9's own recycling, RM7's old contents needed
 *        checking, not assuming: it held real User/Order/MarketplaceListing
 *        rows from that 2026-08-20..08-23 window, and whether that data had
 *        ever been carried forward was an open question (see the reconciliation
 *        task this rotation closed). A 2026-09-05 probe-databases run answered
 *        it with row counts: Order (9) and MarketplaceListing (57) are IDENTICAL
 *        across every generation from RM7 through RM6 (expected — the
 *        marketplace feature was disabled shortly after, so nothing creates a
 *        new one any more), and User climbs monotonically by a plausible
 *        organic amount at each hop (189 → 190 → 209 → 238 → 281 → 295) — the
 *        signature of data that was carried forward and grew normally, not two
 *        disjoint populations that happen to be close. So RM7's old window was
 *        already safely represented, and migrate-main-db-rm6-to-rm7 restored a
 *        row-count verified copy of RM6 (User 296, Card 1,429, RetailerPrice
 *        90,946, and 33 other tables, every one matching exactly) over it,
 *        `pg_restore --clean` dropping and recreating every table from the RM6
 *        dump.
 *
 *        Like RM6, RM11, RM10 and RM9 before it, RM7 is a SINGLE name, not a
 *        chain — a deliberate departure from the RM3 through RM8 era, when
 *        each was a FALLBACK CHAIN (CURRENT-first, falling through to older,
 *        often exhausted projects), and every real outage this database has
 *        had traced back to that shape, not to the database itself.
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
 * RM3 through RM11 (bar RM7 itself) and DATABASE_URL_2 are retired and stay out
 * of this chain — available to the migration tasks by explicit name (see
 * migrate-main-db-rm6-to-rm7 and its predecessors in .github/workflows/maintenance.yml).
 * DATABASE_URL is ALSO not in this chain anymore: it is read directly by
 * prisma/schema.prisma's env("DATABASE_URL") for local dev and by the Prisma
 * CLI, never by the running app (src/lib/db.ts constructs PrismaClient with an
 * explicit datasourceUrl override), so its presence or absence here has no
 * effect on what the app resolves to.
 */
export const OPERATIONAL_VARS = ["RM7"] as const;

/**
 * History database (PriceHistory, ClickEvent), CURRENT-first.
 *
 *   RH6                    — in service again since 2026-09-06. RH7 exceeded its
 *                            5 GB monthly transfer allowance after only two days
 *                            (in service since 2026-09-04), so history rotates
 *                            again — but this rotation is NOT the usual "next
 *                            recycled name" hop: RH8 through RH11, the obvious
 *                            next candidates, are NOT SET in GitHub Actions at
 *                            all (a 2026-09-06 probe-history run reported all
 *                            four as `NOT SET`, not merely unreachable — the
 *                            secrets/vars have been removed since their own
 *                            terms ended). Provisioning a fresh RH12 needs
 *                            owner action this codebase cannot take, so this
 *                            cutover falls back to RH6 — the immediately
 *                            preceding project, already known-safe (it served
 *                            2026-09-02..09-04) and confirmed reachable by that
 *                            same probe.
 *
 *                            THE NON-OBVIOUS PART: 2026-09-05 shipped a SEPARATE
 *                            migration (scripts/backfill-global-history.ts,
 *                            price-import.ts) collapsing every market's
 *                            PriceHistory rows into one country="GLOBAL" row
 *                            per card per day — historySource() in
 *                            price-history.ts now ALWAYS reads country=GLOBAL,
 *                            unconditionally. RH6 predates that migration
 *                            entirely (it was retired 2026-09-04, the day
 *                            before) and holds ZERO GLOBAL rows — only the old
 *                            per-market (AU/CA/EU/NZ/SG/UK/US) shape. Naively
 *                            flipping this chain to RH6 as-is would have made
 *                            every price-history chart and the RiftCompare
 *                            Index render EMPTY, site-wide, with no error —
 *                            exactly the "silently serving garbage" failure
 *                            shape this file exists to prevent.
 *
 *                            So this cutover did NOT dump/restore RH7 over RH6
 *                            (which would have destroyed RH6's own deeper
 *                            per-market archive — EU back to 2026-08-24, CA
 *                            back to 2026-08-10 — for no reason). It ran the
 *                            ADDITIVE `migrate-history` task (scripts/
 *                            migrate-history.ts, skipDuplicates on
 *                            [cardId, country, day]) with this chain already
 *                            pointed at RH6, which copied RH7's 79,381 GLOBAL
 *                            rows (2026-06-06..09-03, 1,420 cards matching the
 *                            live catalogue) into RH6 as pure additions, leaving
 *                            RH6's existing per-market rows untouched. RH6 now
 *                            holds the union: its own older per-market archive
 *                            PLUS the current GLOBAL series the app actually
 *                            reads.
 *   RH7                    — the rollback: served 2026-09-04 to 2026-09-06 and
 *                            holds the GLOBAL series through 2026-09-03 (see
 *                            above — reachable for reads at cutover time, but
 *                            already over its transfer allowance, which is the
 *                            entire reason for this rotation). Only ever
 *                            selected if RH6 is UNSET — a safety net for a
 *                            missing secret, not a health check, so a
 *                            near-exhausted-but-present RH6 never masks a
 *                            genuinely missing RH7 (resolveVar is precedence,
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
 * probe (run to pick the RH6 rotation's target) confirmed it still holds that
 * same data — RH5 remains permanently excluded, never a candidate to recycle. It
 * is also one of the account-recovery sources probe-databases exists to find, so
 * it should be left intact rather than reused.
 *
 * RH8 THROUGH RH11 ARE ABSENT FOR A DIFFERENT REASON THAN RH5: not excluded on
 * purpose, simply GONE from GitHub Actions (see the 2026-09-06 probe-history
 * finding above). If any of them is ever re-added as a secret/var, treat it as a
 * fresh candidate requiring the same live guard every recycled target gets — do
 * not assume the OLD RH8-RH11 findings (documented in earlier git history) still
 * hold. HISTORY_DATABASE_URL_4/_3, HISTORY_DATABASE_URL (bare) and _2 were
 * superseded earlier still.
 */
export const HISTORY_VARS = ["RH6", "RH7", "DATABASE_URL"] as const;

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
