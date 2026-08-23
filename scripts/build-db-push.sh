#!/usr/bin/env bash
# Pushes the current Prisma schema to the operational (and history) database before
# `next build` runs, so a deploy can never ship code that expects a column the live
# database doesn't have yet. Invoked from package.json's `build` script.
#
# EXTRACTED FROM AN INLINE ONE-LINER on purpose. This used to be a single JSON-escaped
# bash command in package.json, dense enough that a misplaced quote would be invisible
# until it broke a build. A real .sh file can be syntax-checked (`bash -n`) and diffed
# sanely.
#
# WHY THE DIAGNOSTIC LINE MATTERS: this repo has hit the same shape of bug twice
# before — a P1001 "can't reach database server" that turned out to be a workflow
# silently resolving to an old, exhausted fallback database because the current one
# (RM3, then RH5) wasn't actually set in that specific environment (see the RM3/RH5
# history in lib/db.ts and lib/db-history.ts). Every time, root-causing it took
# several round trips because nothing in the failing log said WHICH database it had
# resolved to. This script names the winning variable, in the SAME log stream a P1001
# appears in, so that question never has to be asked again.
set -uo pipefail

# The CURRENT project for each database, i.e. the first entry of the resolution
# chain in src/lib/db.ts and src/lib/db-history.ts respectively. Declared once,
# here, because the "you resolved to a dead fallback" warnings below used to
# hard-code the name in the condition AND in the message text — three places per
# database, and a cutover updated the chain but not the warnings. That is not
# hypothetical: after the RM3->RM4 and RH6->RH7 cutovers on 2026-08-04, every
# production deploy printed a ::warning:: naming the CURRENT database as the
# "exhausted/dead fallback". A warning that cries wolf on every green build is
# worse than no warning, because it teaches you to scroll past the one line that
# was supposed to answer "which database did this build actually write to?".
#
# tests/db-chain.test.ts asserts these two values still match the head of each
# chain, so the next cutover fails a test instead of quietly lying in a log.
# Rotated onto RM8 on 2026-08-22: RM7 went over its 5 GB monthly transfer
# allowance just TWO days after the 2026-08-20 cutover onto it — the same
# ~2 GB/day burn every prior project has shown. RM8 was empty at that point
# (the pre-stage task had never been run) and was restored from RM6 first.
# See the long note on OPERATIONAL_VARS in src/lib/db-chains.ts.
CURRENT_OP="RM8"
# Rotated again on 2026-08-23: HISTORY_DATABASE_URL_4 approached its 5 GB monthly
# allowance only two days after taking over, and RH8 — a NEW project, empty
# before the restore — took its place. The chains are CURRENT-first, not
# newest-first; see the long note on HISTORY_URL in src/lib/db-history.ts.
CURRENT_HIST="RH8"

# Only push schema for a real Vercel production/preview build with a database
# configured. A local `next build` (no database vars) must not try to reach anything.
#
# GATES ON THE WHOLE OPERATIONAL CHAIN, not bare DATABASE_URL. The original check
# was `['production','preview'].includes(VERCEL_ENV) && DATABASE_URL`, written when
# DATABASE_URL was the only operational variable. It has since become
# RM7 || RM8 || RM5 || DATABASE_URL_2 || DATABASE_URL || RM4 || RM3 || RM6 (lib/db.ts), and lib/db.ts explicitly
# tells the owner the older vars can eventually be deleted — at which point
# this line would exit 0 on every deploy and silently stop pushing schema to
# BOTH the operational AND the history database, while logging a
# benign-looking "skipping". A green deploy against an un-migrated database is
# exactly the failure this script exists to prevent.
if ! { [ "${VERCEL_ENV:-}" = "production" ] || [ "${VERCEL_ENV:-}" = "preview" ]; } \
   || [ -z "${RM8:-}${RM7:-}${DATABASE_URL:-}" ]; then
  echo "[build-db-push] not a Vercel production/preview build with an operational database set (RM8 / RM7 / DATABASE_URL) — skipping schema push."
  exit 0
fi

# CURRENT-first, same order as lib/db.ts and every GitHub Actions workflow. Unlike
# the app runtime (which can silently keep serving from a stale connection until
# the next cold start), this ALWAYS reflects the current build's actual environment.
#
# EVERY BRANCH EXCEPT THE DATABASE_URL ONE MUST `export`, because DATABASE_URL
# is the only name `prisma db push` reads. Now that the head is RM8, the FIRST
# branch is the one that must copy — and getting this wrong is silent and
# expensive, because `prisma db push` would migrate a PREVIOUS project while
# the app (src/lib/db-chains.ts, RM8-first) reads the current one. A green deploy
# against an un-migrated database is exactly the failure this script exists to
# prevent.
if [ -n "${RM8:-}" ]; then
  export DATABASE_URL="$RM8"
  SOURCE="RM8"
elif [ -n "${RM7:-}" ]; then
  # The previous project, demoted 2026-08-22 when it went over its transfer
  # allowance. Reached by UNSETTING RM8 — this chain falls through on an unset
  # variable, never on an unreachable one.
  export DATABASE_URL="$RM7"
  SOURCE="RM7"
else
  # DATABASE_URL is last and is NOT a good production fallback — it is kept
  # because prisma/schema.prisma reads that literal name and local dev sets only
  # it. Retired projects (RM3/RM4/RM5/RM6/DATABASE_URL_2) were removed from this
  # chain on 2026-08-20: a decommissioned project whose variable lingers is not a
  # safety net, it is a trap. See src/lib/db-chains.ts.
  SOURCE="DATABASE_URL"
fi
# Name the winner, never the value (it's a credential). This is the one line that
# turns "P1001 against some unfamiliar host" into an immediate answer: if SOURCE is
# anything other than $CURRENT_OP, that variable is missing from THIS Vercel
# environment/scope — check Settings -> Environment Variables -> is "Production"
# (or "Preview") ticked.
echo "[build-db-push] operational DB source for this build: $SOURCE"
if [ "$SOURCE" != "$CURRENT_OP" ]; then
  echo "::warning::[build-db-push] ${CURRENT_OP} is not visible in this build (VERCEL_ENV=${VERCEL_ENV:-unset}) — falling back to ${SOURCE}, which lib/db.ts documents as an exhausted/dead fallback. If db push below fails with P1001, this is almost certainly why."
fi

# A failed push doesn't fail the build — see the block comment at the bottom for why.
if ! prisma db push --skip-generate --accept-data-loss; then
  echo "::error::[build-db-push] prisma db push FAILED against ${SOURCE} — deployed code and the live database are now out of sync; run the maintenance.yml db-push job ASAP"
fi

# History database (PriceHistory/ClickEvent) — same optional, best-effort push.
#
# BUG FIXED 2026-07-31 (this chain used to read the two OLDEST, long-dead
# projects, reversed): fixed again 2026-08-19 for the _2 -> _3 rotation, and
# again 2026-08-21 for the _3 -> _4 rotation. This chain MIRRORS
# src/lib/db-history.ts exactly, CURRENT-first. Keep the two in sync — if you
# rotate there, rotate here into the same position.
# tests/db-chain.test.ts compares the two lists and fails if they drift.
if [ -n "${RH8:-}" ]; then
  HIST="$RH8"; HIST_SOURCE="RH8"
elif [ -n "${HISTORY_DATABASE_URL_4:-}" ]; then
  # Rollback: served 2026-08-21 to 2026-08-23, reachable, near its allowance.
  HIST="$HISTORY_DATABASE_URL_4"; HIST_SOURCE="HISTORY_DATABASE_URL_4"
else
  # No separate history project — history shares the operational database, which
  # the push above already covered. RH7 was dropped as ORPHANED (0% of its card
  # ids resolve against the live catalogue) and _2/_3/HISTORY_DATABASE_URL (bare)
  # as superseded; RH6 is a migration SOURCE, not a runtime target. RH5 is NOT a
  # history project at all — it holds 85 User rows (see db-chains.ts).
  HIST=""; HIST_SOURCE=""
fi

if [ -n "$HIST" ]; then
  # Same rule as the operational push above: name the winning variable, never its
  # value. If this says anything other than $CURRENT_HIST, that variable is missing
  # from THIS Vercel environment/scope — which means the schema is being pushed to
  # an exhausted project while the app reads a brand-new, TABLE-LESS one.
  echo "[build-db-push] history DB source for this build: $HIST_SOURCE"
  if [ "$HIST_SOURCE" != "$CURRENT_HIST" ]; then
    echo "::warning::[build-db-push] ${CURRENT_HIST} is not visible in this build (VERCEL_ENV=${VERCEL_ENV:-unset}) — falling back to ${HIST_SOURCE}, which db-history.ts documents as an exhausted/dead fallback."
  fi
  DATABASE_URL="$HIST" prisma db push --skip-generate --accept-data-loss || true
else
  echo "[build-db-push] no history-database variable set — history tables share the operational DB, nothing extra to push."
fi

# DELIBERATE CHANGE from the original inline script: these three ran chained with
# `&&` before (one failure skipped the rest). They're three unrelated maintenance
# tasks, not a dependent pipeline, and none of them can affect whether `next build`
# runs either way (see the trailing `exit 0` below) — so each now runs independently,
# which is strictly more robust than letting an early one's failure silently skip
# the other two.
tsx scripts/marketplace-seed.ts || true
tsx scripts/fix-altart-rarity.ts || true
tsx scripts/grant-early-premium.ts || true

# IndexNow: submit every blog/guide URL on every deploy, not just once a day.
# See the script's own header for why this exists — a real content change
# (a new or edited post) used to wait on the next scheduled batch (up to 24h)
# before anything told Bing/Yandex/Seznam/Naver it existed. `|| true` for the
# same reason as the three scripts above: best-effort, never blocks the build.
# No-ops outside production (pingIndexNow's own isProduction() gate).
tsx scripts/indexnow-ping-deploy.ts || true

# MANUAL CARDS — the backstop catalogue for printings our automated sources
# genuinely cannot see (Organized-Play promos, the drawing-only T1 Worlds
# Champion Collection, alt-art rune cycles). See prisma/manual-cards.json.
#
# WHY THIS IS HERE NOW. This script was the only automated writer to the card
# table, and add-manual-cards.ts was NOT in it — its single caller was a
# `workflow_dispatch`-gated step in maintenance.yml (task: cards-manual). So
# adding an entry to manual-cards.json, committing it and deploying did exactly
# nothing: the JSON claimed to be the source of truth while the live database
# never heard about it until someone remembered to fire a workflow by hand. Six
# T1 printings shipped in the repo, were referenced by two published articles and
# 404'd in production for that reason alone.
#
# Safe to run every deploy, for the same reasons as the three scripts above:
# it UPSERTS by externalId (never wipes, never touches a card not listed), skips
# any entry with a FILL_ME placeholder, and is idempotent — a second run reports
# UPDATEs and changes nothing. `|| true` because a catalogue backstop must never
# be the reason a deploy fails; the dispatchable maintenance job stays as the
# manual escape hatch for running it out-of-band.
tsx scripts/add-manual-cards.ts || true

# Never exit non-zero: everything above is best-effort maintenance that must not
# block `next build` from running — this preserves the original inline script's
# trailing `|| true` around the whole block exactly.
exit 0
