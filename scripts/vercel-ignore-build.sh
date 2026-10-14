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
# A PRODUCTION build happens only when the commit's SUBJECT LINE — the first
# line, nothing else — carries the literal marker  [deploy]  (case-insensitive).
# Everything else is skipped and simply waits for the next scheduled release —
# .github/workflows/production-deploy.yml lands ONE such commit a day, and its
# "Run workflow" button lands one immediately. A human who needs a deploy right
# now puts [deploy] in their own commit SUBJECT.
#
# SUBJECT ONLY, AND THIS IS NOT A DETAIL. The first version searched the whole
# message and deployed on 2026-09-11 08:29 for a merge commit whose subject had
# no marker at all — its body read "(no [deploy] marker on purpose)", and a
# literal-string search cannot tell a marker from prose ABOUT the marker. This
# repo writes long explanatory commit messages, and the deploy gate is now one
# of the things they explain, so that collision is a certainty rather than a
# fluke. The subject line is where both intended uses already put it (the
# scheduled release commit, and a human's "hotfix X [deploy]"), and it is the
# one line nobody writes prose in. Verified against all three real cases at the
# time of the fix; tests/deploy-cadence.test.ts pins the body case.
#
# PREVIEW AND DEVELOPMENT BUILDS ARE OFF (owner, 2026-10-14: "stop building
# these pages ahead of time on preview deploys"). Until then a push to any
# branch not named claude/* (vercel.json disables those outright), or a pull
# request from one, made a Preview build, and a Preview build is the full
# production pipeline pointed at the databases the Preview environment holds
# (the live ones: every cutover sets them in all three Vercel environments):
# scripts/build-db-push.sh
# pushes the BRANCH's Prisma schema to the operational and history projects
# (--accept-data-loss), package.json's build runs a Singapore price import, and
# `next build` prerenders ~475 database-backed pages. Next has no switch to skip
# prerendering a static page (route segment config must be a literal), so the
# one place that stops all of it is here, before the build starts. A preview
# or development build now happens only when the commit SUBJECT carries the
# literal marker  [preview]  (any case), added only when the owner asks for a
# preview of that commit; it is then a full build, like production. The same
# SUBJECT-only rule as [deploy]: a body that discusses the marker builds
# nothing. An unreadable message never builds a preview (no fail-open here:
# production is the only build that must not be lost). Production is
# unchanged. The CLI staging deploy (.github/workflows/staging-deploy.yml) never
# passes through this script. DECISIONS.md, "Preview builds are off unless a
# commit asks for one", 2026-10-14.
#
# WHEN THE ENVIRONMENT IS UNKNOWN (VERCEL_ENV unset), the push is treated as
# production and gated. The asymmetry is deliberate: gating a preview by
# mistake costs a preview URL; not gating production by mistake recreates the
# burn this file exists to stop.
#
# FAILS OPEN on the message. If the commit message cannot be determined at all
# (the system env var is off AND the checkout has no git history), the script
# BUILDS and says why: "never deploys" is a far worse failure than "deploys
# too often", which is merely the status quo this file replaces.
set -u

MARKER='[deploy]'
PREVIEW_MARKER='[preview]'

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

env="${VERCEL_ENV:-}"
if [ "$env" = "preview" ] || [ "$env" = "development" ]; then
  # See "PREVIEW AND DEVELOPMENT BUILDS ARE OFF" above. Subject only, like the
  # production marker below.
  preview_subject="$(printf '%s\n' "$msg" | head -n 1)"
  if [ -n "$preview_subject" ] && printf '%s' "$preview_subject" | grep -qiF -- "$PREVIEW_MARKER"; then
    echo "[vercel-ignore-build] VERCEL_ENV=$env and '$PREVIEW_MARKER' in the commit SUBJECT (via $source) — building the preview that was asked for."
    exit 1
  fi
  echo "[vercel-ignore-build] VERCEL_ENV=$env — previews are off (owner, 2026-10-14): no '$PREVIEW_MARKER' in the commit SUBJECT (via $source), skipping. A preview builds only when its commit subject carries $PREVIEW_MARKER."
  exit 0
fi

if [ -z "$msg" ]; then
  echo "[vercel-ignore-build] cannot read the commit message (no VERCEL_GIT_COMMIT_MESSAGE, no git history) — building, to fail open."
  exit 1
fi

# The SUBJECT is the first line — see "SUBJECT ONLY" above. head -n 1 on the
# whole message, so a body that discusses the marker cannot trigger a build.
subject="$(printf '%s\n' "$msg" | head -n 1)"

# grep -F: the marker is a literal, not a pattern. -i: [Deploy] / [DEPLOY] count.
if printf '%s' "$subject" | grep -qiF -- "$MARKER"; then
  echo "[vercel-ignore-build] '$MARKER' found in the commit SUBJECT (via $source) — building."
  exit 1
fi

echo "[vercel-ignore-build] VERCEL_ENV=${env:-unset (treated as production)}: no '$MARKER' in the commit SUBJECT (via $source) — skipping this build."
echo "[vercel-ignore-build] production deploys once a day from .github/workflows/production-deploy.yml; put $MARKER in a commit message (or press Run workflow there) to deploy now."
exit 0
