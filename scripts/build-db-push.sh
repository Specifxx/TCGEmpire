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

# Only push schema for a real Vercel production/preview build with a database
# configured. A local `next build` (no DATABASE_URL) must not try to reach anything.
# Equivalent to the original inline check
# (`['production','preview'].includes(VERCEL_ENV) && DATABASE_URL`), just native bash.
if ! { [ "${VERCEL_ENV:-}" = "production" ] || [ "${VERCEL_ENV:-}" = "preview" ]; } || [ -z "${DATABASE_URL:-}" ]; then
  echo "[build-db-push] not a Vercel production/preview build with DATABASE_URL set — skipping schema push."
  exit 0
fi

# RM3-first, same order as lib/db.ts and every GitHub Actions workflow. Unlike the
# app runtime (which can silently keep serving from a stale connection until the next
# cold start), this ALWAYS reflects the current build's actual environment.
if [ -n "${RM3:-}" ]; then
  export DATABASE_URL="$RM3"
  SOURCE="RM3"
elif [ -n "${DATABASE_URL_2:-}" ]; then
  export DATABASE_URL="$DATABASE_URL_2"
  SOURCE="DATABASE_URL_2"
else
  SOURCE="DATABASE_URL"
fi
# Name the winner, never the value (it's a credential). This is the one line that
# turns "P1001 against some unfamiliar host" into an immediate answer: if SOURCE is
# anything other than RM3, RM3 is missing from THIS Vercel environment/scope — check
# Settings -> Environment Variables -> RM3 -> is "Production" (or "Preview") ticked.
echo "[build-db-push] operational DB source for this build: $SOURCE"
if [ "$SOURCE" != "RM3" ]; then
  echo "::warning::[build-db-push] RM3 is not visible in this build (VERCEL_ENV=${VERCEL_ENV:-unset}) — falling back to ${SOURCE}, which lib/db.ts documents as an exhausted/dead fallback. If db push below fails with P1001, this is almost certainly why."
fi

# A failed push doesn't fail the build — see the block comment at the bottom for why.
if ! prisma db push --skip-generate --accept-data-loss; then
  echo "::error::[build-db-push] prisma db push FAILED against ${SOURCE} — deployed code and the live database are now out of sync; run the maintenance.yml db-push job ASAP"
fi

# History database (PriceHistory/ClickEvent) — same optional, best-effort push.
#
# BUG FIXED HERE (2026-07-31): this block used to read ONLY
#   HISTORY_DATABASE_URL_3 / HISTORY_DATABASE_URL_2
# — the two OLDEST, long-dead projects, in the reverse of the app's own
# precedence. It had never been updated when the history DB moved _2 -> _3 -> _4
# -> RH5, so on every Vercel deploy it either pushed the schema into an exhausted
# project the app never reads, or (when only the current var was set) silently
# pushed nothing at all while reporting success. That is precisely how a new
# column can 500 the admin clicks page in production despite a green deploy.
#
# This chain now MIRRORS src/lib/db-history.ts exactly, newest-first. Keep the two
# in sync — if you add a project there, add it here in the same position.
if [ -n "${RH6:-}" ]; then
  HIST="$RH6"; HIST_SOURCE="RH6"
elif [ -n "${RH5:-}" ]; then
  HIST="$RH5"; HIST_SOURCE="RH5"
elif [ -n "${HISTORY_DATABASE_URL_4:-}" ]; then
  HIST="$HISTORY_DATABASE_URL_4"; HIST_SOURCE="HISTORY_DATABASE_URL_4"
elif [ -n "${HISTORY_DATABASE_URL:-}" ]; then
  HIST="$HISTORY_DATABASE_URL"; HIST_SOURCE="HISTORY_DATABASE_URL"
elif [ -n "${HISTORY_DATABASE_URL_2:-}" ]; then
  HIST="$HISTORY_DATABASE_URL_2"; HIST_SOURCE="HISTORY_DATABASE_URL_2"
elif [ -n "${HISTORY_DATABASE_URL_3:-}" ]; then
  HIST="$HISTORY_DATABASE_URL_3"; HIST_SOURCE="HISTORY_DATABASE_URL_3"
else
  HIST=""; HIST_SOURCE=""
fi

if [ -n "$HIST" ]; then
  # Same rule as the operational push above: name the winning variable, never its
  # value. If this says anything other than RH6, RH6 is missing from THIS Vercel
  # environment/scope.
  echo "[build-db-push] history DB source for this build: $HIST_SOURCE"
  if [ "$HIST_SOURCE" != "RH6" ]; then
    echo "::warning::[build-db-push] RH6 is not visible in this build (VERCEL_ENV=${VERCEL_ENV:-unset}) — falling back to ${HIST_SOURCE}, which db-history.ts documents as an exhausted/dead fallback."
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

# Never exit non-zero: everything above is best-effort maintenance that must not
# block `next build` from running — this preserves the original inline script's
# trailing `|| true` around the whole block exactly.
exit 0
