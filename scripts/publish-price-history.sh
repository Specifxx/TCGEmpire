#!/usr/bin/env bash
# Commits the price-history files a workflow just wrote (data/price-history/,
# see src/lib/price-history-store.ts) to main. Used by refresh-prices.yml after
# every import and by export-price-history.yml.
#
#   bash scripts/publish-price-history.sh "<what wrote them>"
#
# NEVER A DEPLOY. The commit subject must not carry the deploy marker
# (CLAUDE.md, scripts/vercel-ignore-build.sh): these commits ride the next daily
# release like any other. The script refuses a message that contains it.
#
# ONLY THE FILES THIS JOB CHANGED. The job's checkout can be an hour old by the
# time an import finishes, and main may have gained day files from another run
# since. So this copies only the files that differ from the job's own checkout
# (new or rewritten), onto a fresh worktree of the CURRENT main, and never
# deletes anything. A same-day file from another run is replaced only when this
# run rewrote that same day, which is the store's "last run of the day wins".
#
# Retries the fetch-commit-push cycle when another push wins the race.
set -euo pipefail

WHO="${1:-a workflow}"
DIR="data/price-history"

if printf '%s' "$WHO" | grep -qiF -- '[deploy]'; then
  echo "::error::refusing to publish price history with a deploy marker in the message."
  exit 1
fi

if [ ! -d "$DIR" ]; then
  echo "No $DIR directory — nothing to publish."
  exit 0
fi

mapfile -t CHANGED < <(git ls-files --others --modified --exclude-standard -- "$DIR" | grep -E '\.json$' || true)
if [ "${#CHANGED[@]}" -eq 0 ]; then
  echo "Price history: no new or changed day files."
  exit 0
fi

DAYS="$(printf '%s\n' "${CHANGED[@]}" | sed -E 's#^data/price-history/##; s#\.json$##' | sort)"
COUNT="${#CHANGED[@]}"
if [ "$COUNT" -le 4 ]; then
  SUMMARY="$(printf '%s' "$DAYS" | paste -sd, - | sed 's/,/, /g')"
else
  SUMMARY="$COUNT day files, $(printf '%s\n' "$DAYS" | head -1) … $(printf '%s\n' "$DAYS" | tail -1)"
fi
SUBJECT="data: price history ($SUMMARY)"
BODY="Written by $WHO. Public price history lives in the repository (src/lib/price-history-store.ts); this commit carries no deploy marker, so the next daily release bundles it."

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

WORK="$(mktemp -d)"
cleanup() { git worktree remove --force "$WORK/tree" >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

for attempt in 1 2 3 4 5; do
  git fetch --quiet origin main
  git worktree remove --force "$WORK/tree" >/dev/null 2>&1 || true
  git worktree add --quiet --detach "$WORK/tree" origin/main
  for f in "${CHANGED[@]}"; do
    [ -f "$f" ] || continue
    mkdir -p "$WORK/tree/$(dirname "$f")"
    cp "$f" "$WORK/tree/$f"
  done
  if (
    cd "$WORK/tree"
    git add -- "$DIR"
    if git diff --cached --quiet; then
      echo "Price history: main already has these files."
      exit 0
    fi
    git commit --quiet -m "$SUBJECT" -m "$BODY"
    git push --quiet origin HEAD:main
    echo "Price history published: $SUBJECT ($(git rev-parse --short HEAD))."
  ); then
    exit 0
  fi
  echo "Push attempt $attempt lost a race with another push — retrying."
  sleep $((attempt * 3))
done

echo "::error::could not publish the price-history files after 5 attempts."
exit 1
