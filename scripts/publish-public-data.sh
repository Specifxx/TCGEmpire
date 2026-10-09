#!/usr/bin/env bash
# Commits the public data snapshot a workflow just exported (data/public/, see
# src/lib/public-data/ and scripts/export-public-data.ts) to main.
#
#   bash scripts/publish-public-data.sh "<what wrote it>"
#
# NEVER A DEPLOY. Like publish-price-history.sh, the subject never carries the
# deploy marker (CLAUDE.md): the snapshot rides the next daily release. The
# script refuses a message that contains it.
#
# THE WHOLE DIRECTORY. The export is a full snapshot, so main's data/public/ is
# replaced by this job's copy (deletions included: a card with no listings left
# loses its file). Nothing outside data/public/ is touched. Retries when another
# push wins the race.
set -euo pipefail

WHO="${1:-a workflow}"
DIR="data/public"

if printf '%s' "$WHO" | grep -qiF -- '[deploy]'; then
  echo "::error::refusing to publish public data with a deploy marker in the message."
  exit 1
fi
if [ ! -f "$DIR/meta.json" ]; then
  echo "::error::$DIR/meta.json is missing — the export did not complete; nothing published."
  exit 1
fi

CARDS=$(node -e "const m=require('./$DIR/meta.json');console.log(m.counts.Card||0)")
LISTINGS=$(node -e "const m=require('./$DIR/meta.json');console.log(m.counts.RetailerPrice||0)")
SUBJECT="data: public data snapshot (${CARDS} cards, ${LISTINGS} listings)"
BODY="Written by $WHO. Public catalogue and prices live in the repository (src/lib/public-data/); this commit carries no deploy marker, so the next daily release bundles it."

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

WORK="$(mktemp -d)"
cleanup() { git worktree remove --force "$WORK/tree" >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

for attempt in 1 2 3 4 5; do
  git fetch --quiet origin main
  git worktree remove --force "$WORK/tree" >/dev/null 2>&1 || true
  git worktree add --quiet --detach "$WORK/tree" origin/main
  mkdir -p "$WORK/tree/$DIR"
  rsync -a --delete --exclude='*.tmp-*' "$DIR/" "$WORK/tree/$DIR/"
  if (
    cd "$WORK/tree"
    git add -A -- "$DIR"
    if git diff --cached --quiet; then
      echo "Public data: main already has this snapshot."
      exit 0
    fi
    CHANGED=$(git diff --cached --name-only | wc -l | tr -d ' ')
    git commit --quiet -m "$SUBJECT" -m "$BODY" -m "$CHANGED file(s) changed."
    git push --quiet origin HEAD:main
    echo "Public data published: $SUBJECT, $CHANGED file(s) ($(git rev-parse --short HEAD))."
  ); then
    exit 0
  fi
  echo "Push attempt $attempt lost a race with another push — retrying."
  sleep $((attempt * 3))
done

echo "::error::could not publish the public data snapshot after 5 attempts."
exit 1
