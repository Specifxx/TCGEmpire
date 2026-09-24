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
 *   RM3 — the ONLY operational variable, in service since 2026-09-22. RM12
 *        (live since 2026-09-18) was approaching its own 5 GB monthly transfer
 *        allowance after four days — the same ~2 GB/day burn every project in
 *        this rotation has ended on, and the THIRD full project life since the
 *        2026-09-11 deploy-cadence gate. The real query is still unidentified;
 *        run audit-egress a few hours after this cutover.
 *
 *        THE TARGET WAS FIRST ASKED TO BE "DATABASE_URL", AND IS NOT.
 *        The owner's instruction on 2026-09-22 named the DATABASE_URL secret.
 *        The one time that was done (2026-08-12) left a verdict in
 *        maintenance.yml that still stands: "DATABASE_URL IS THE MOST
 *        DANGEROUS NAME IN THIS REPO TO ROTATE ONTO … If there is a next
 *        rotation, give the project a fresh name rather than recycling the
 *        generic one." prisma/schema.prisma reads env("DATABASE_URL")
 *        directly, most scripts assign it to aim Prisma, and the workflows'
 *        job-level env assigns it too — so the name would mean both "whichever
 *        database this process should talk to" and "the project at the head of
 *        this chain", and in production those coincide, which is precisely
 *        what makes a mistake there silent. Raised with the owner, who chose
 *        RM3. Every rotation since RM6 has followed the same advice.
 *
 *        RM3 IS A RECYCLED PROJECT — the third operational project this site
 *        ever used, live until ~2026-08-04 — so THIS FILE'S RECYCLE RULE
 *        APPLIES IN FULL: a recycled target is re-verified on every return,
 *        never trusted from an earlier term. A 2026-09-22 probe-databases run
 *        found it REACHABLE and far BEHIND RM12 on every metric (User=137,
 *        Card=1406, RetailerPrice=69,689, CollectionCard=617, PriceAlert=17,
 *        Order=4) — a stale early-August snapshot, which is what a genuinely
 *        rested project looks like. migrate-main-db-rm12-to-rm3's `--clean`
 *        pass then wiped it and restored RM12 over it, with EVERY table's row
 *        count verified equal (User 379, StoreHealthSnapshot 5,169,
 *        UserDigestOptOut 370, TrialRedemption 6, StorePartner 2,
 *        SupportTicket 0, StoreSuggestion 0 …), and the closing
 *        `prisma db push` reported the schema already in sync.
 *
 *        Like RM12, RM10, RM9, RM8, RM7, RM6 and RM11 before it, RM3 is a
 *        SINGLE name, not a chain — a deliberate departure from the RM3
 *        through RM8 era, when each was a FALLBACK CHAIN (CURRENT-first,
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
 * RM4 through RM12 (RM12 as of this cutover) and DATABASE_URL_2 are retired and stay out
 * of this chain — available to the migration tasks by explicit name (see
 * migrate-main-db-rm12-to-rm3 and its predecessors in .github/workflows/maintenance.yml).
 * DATABASE_URL is ALSO not in this chain anymore: it is read directly by
 * prisma/schema.prisma's env("DATABASE_URL") for local dev and by the Prisma
 * CLI, never by the running app (src/lib/db.ts constructs PrismaClient with an
 * explicit datasourceUrl override), so its presence or absence here has no
 * effect on what the app resolves to.
 */
export const OPERATIONAL_VARS = ["RM3"] as const;

/**
 * History database (PriceHistory, ClickEvent), CURRENT-first.
 *
 *   HISTORY_DATABASE_URL_3 — in service since 2026-09-22, once
 *                            HISTORY_DATABASE_URL_2 (see below) came within
 *                            reach of its own 5 GB monthly transfer allowance
 *                            after five days live — the same terminal burn
 *                            every history project has shown. This cutover
 *                            RECYCLES HISTORY_DATABASE_URL_3, retired since
 *                            the 2026-08-21 _4 cutover, rather than
 *                            provisioning a new project.
 *
 *                            RE-VERIFIED FRESH, not assumed from that old
 *                            term (this file's own rule: a recycled target is
 *                            re-checked every time it comes back around). A
 *                            2026-09-22 probe-history run found it holding
 *                            real, outdated numbers from that term
 *                            (rows=293,094, days=2026-08-06..2026-08-21,
 *                            distinctCards=1423, matching RM12 1418/1423
 *                            (100%)) and — the tell — ZERO GLOBAL rows of its
 *                            own, which places its last term before the
 *                            2026-09-05 GLOBAL-history migration, exactly as
 *                            every other pre-cutover term has looked. Behind
 *                            the source on every metric, i.e. genuinely
 *                            rested. migrate-history-db-hdu2-to-hdu3 then did
 *                            a full pg_dump/restore of HISTORY_DATABASE_URL_2
 *                            (rows=423,999, days=2026-06-06..2026-09-17,
 *                            distinctCards=1426, GLOBAL rows=82,175) over it,
 *                            every count verified equal: Card 1,437,
 *                            ClickEvent 698, PriceHistory 423,999.
 *   HISTORY_DATABASE_URL_2 — the rollback: served 2026-09-17..09-22, holds the
 *                            same GLOBAL series (it is what _3 was restored
 *                            FROM), so it is a genuinely safe rollback. Only
 *                            ever selected if HISTORY_DATABASE_URL_3 is UNSET
 *                            — a safety net for a missing secret, not a health
 *                            check, so a near-exhausted-but-present _3 never
 *                            masks a genuinely missing _2 (resolveVar is
 *                            precedence, never health; see OPERATIONAL_VARS
 *                            above for the outage that shape caused on the
 *                            operational side).
 *   DATABASE_URL           — the terminal case, meaning "no separate history
 *                            project is configured; history shares the
 *                            operational database". db-history.ts's
 *                            historyIsSplit depends on this staying last.
 *
 * HISTORY_DATABASE_URL DROPS OUT OF THIS CUTOVER (it was _2's own rollback for
 * the 2026-09-17..09-22 stint, and a chain only needs one) — still reachable,
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
 * RH6, RH7, RH8, RH9, RH10, RH11 AND HISTORY_DATABASE_URL/_4 STAY OUT OF THIS
 * CHAIN — reachable (the 2026-09-22 probe-history run found all of them so,
 * each holding real if outdated data), but nothing has asked to cut over onto
 * any of them, and this file's own "ONLY LIVE PROJECTS BELONG IN A RUNTIME
 * CHAIN" rule means being reachable is not enough on its own to earn a chain
 * slot. If a future rotation targets one, treat it as a fresh candidate
 * requiring the same live guard every recycled target gets — do not assume
 * OLD findings (documented in earlier git history) still hold.
 */
export const HISTORY_VARS = ["HISTORY_DATABASE_URL_3", "HISTORY_DATABASE_URL_2", "DATABASE_URL"] as const;

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
