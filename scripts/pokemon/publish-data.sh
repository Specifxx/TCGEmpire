#!/usr/bin/env bash
# Commits the Pokémon section's files the import just wrote (data/pokemon/,
# src/lib/pokemon/store.ts) to main. Used by .github/workflows/pokemon-import.yml.
#
#   bash scripts/pokemon/publish-data.sh "<what wrote them>"
#
# NEVER A DEPLOY. The commit subject must not carry the deploy marker
# (CLAUDE.md, scripts/vercel-ignore-build.sh): these commits ride the next daily
# release like any other. The script refuses a message that contains it.
#
# ONLY THE FILES THIS JOB CHANGED, copied onto a fresh worktree of the CURRENT
# main (main may have moved since the job's checkout), never deleting anything.
# Only this workflow writes data/pokemon (its own concurrency group), so the
# copied files are always the newest. Retries when another push wins the race.
set -euo pipefail

WHO="${1:-a workflow}"
DIR="data/pokemon"

if printf '%s' "$WHO" | grep -qiF -- '[deploy]'; then
  echo "::error::refusing to publish the Pokémon data with a deploy marker in the message."
  exit 1
fi

if [ ! -d "$DIR" ]; then
  echo "No $DIR directory — nothing to publish."
  exit 0
fi

mapfile -t CHANGED < <(git ls-files --others --modified --exclude-standard -- "$DIR" | grep -E '\.json$' || true)
if [ "${#CHANGED[@]}" -eq 0 ]; then
  echo "Pokémon data: nothing new or changed."
  exit 0
fi

SUBJECT="data: Pokémon sealed prices ($(date -u +%Y-%m-%d), ${#CHANGED[@]} files)"
BODY="Written by $WHO. The Pokémon section's data lives in the repository (src/lib/pokemon/store.ts); this commit carries no deploy marker, so the next daily release bundles it."

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
      echo "Pokémon data: main already has these files."
      exit 0
    fi
    git commit --quiet -m "$SUBJECT" -m "$BODY"
    git push --quiet origin HEAD:main
    echo "Pokémon data published: $SUBJECT ($(git rev-parse --short HEAD))."
  ); then
    exit 0
  fi
  echo "Push attempt $attempt lost a race with another push — retrying."
  sleep $((attempt * 3))
done

echo "::error::could not publish the Pokémon data after 5 attempts."
exit 1
