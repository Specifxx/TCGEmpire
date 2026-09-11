#!/usr/bin/env bash
# Vercel "Ignored Build Step" — decides, per push, whether Vercel builds AT ALL.
# Wired from vercel.json's `ignoreCommand`. Vercel's contract:
#
#   exit 0  → skip: no deployment is created for this push
#   exit 1  → build as normal
#
# ── WHY THIS EXISTS: THE DEPLOY CADENCE WAS THE NEON TRANSFER BURN ───────────
# Eleven consecutive Neon projects were exhausted at ~2 GB/day (see the notes in
# src/lib/db.ts and DECISIONS.md, "Network transfer: the deploy cadence was the
# burn", 2026-09-11). Every investigation looked for a request handler pulling
# a whole table. There isn't one: scripts/audit-egress.ts measured the app's
# steady-state traffic at ~0.12 GB/day on 2026-08-22/23. The rest is deploys:
#
#   • main received 10–30 commits a day (git log). Each push was a production
#     build. `next build` prerenders ~770 database-backed pages — 200 card
#     pages via generateStaticParams alone — against BOTH Neon projects, and
#     none of it shows in Vercel's function-invocation metrics.
#   • Worse, every new deployment clears the Next.js Full Route Cache (the ISR
#     page cache — Next's own docs: "the Full Route Cache is cleared on new
#     deployments"). So every `revalidate = 86400` page re-rendered from the
#     database on its next hit, again and again, up to thirty times a day.
#     The 24-hour TTL never actually got to run for 24 hours.
#
# The history project died fastest (RH9: one day, 2026-09-09→10) on the two
# days with the most commits (20 and 30).
#
# ── THE RULE ─────────────────────────────────────────────────────────────────
# Build only when the commit message carries the literal marker  [deploy]
# (case-insensitive). Everything else is skipped and simply waits for the next
# scheduled release — .github/workflows/production-deploy.yml lands ONE such
# commit a day, and its "Run workflow" button lands one immediately. A human
# who needs a deploy right now puts [deploy] in their own commit message.
#
# FAILS OPEN. If the commit message cannot be determined at all (the system
# env var is off AND the checkout has no git history), the script BUILDS and
# says why: "never deploys" is a far worse failure than "deploys too often",
# which is merely the status quo this file replaces.
set -u

MARKER='[deploy]'

msg="${VERCEL_GIT_COMMIT_MESSAGE:-}"
source="VERCEL_GIT_COMMIT_MESSAGE"
if [ -z "$msg" ]; then
  # VERCEL_GIT_COMMIT_MESSAGE is only populated when the project has
  # "Automatically expose System Environment Variables" on. Vercel checks the
  # repo out with `git clone --depth=10`, so HEAD's message is available either
  # way.
  msg="$(git log -1 --format=%B 2>/dev/null || true)"
  source="git log -1"
fi

if [ -z "$msg" ]; then
  echo "[vercel-ignore-build] cannot read the commit message (no VERCEL_GIT_COMMIT_MESSAGE, no git history) — building, to fail open."
  exit 1
fi

# grep -F: the marker is a literal, not a pattern. -i: [Deploy] / [DEPLOY] count.
if printf '%s' "$msg" | grep -qiF -- "$MARKER"; then
  echo "[vercel-ignore-build] '$MARKER' found in the commit message (via $source) — building."
  exit 1
fi

echo "[vercel-ignore-build] no '$MARKER' in the commit message (via $source) — skipping this build."
echo "[vercel-ignore-build] production deploys once a day from .github/workflows/production-deploy.yml; put $MARKER in a commit message (or press Run workflow there) to deploy now."
exit 0
