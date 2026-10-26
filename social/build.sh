#!/usr/bin/env bash
# One ready-to-post pack: data → video.mp4 + cover.jpg + carousel PNGs + captions.
#   bash social/build.sh movers | top <SET> | boxes <SET>  [--remote-art] [--out dir]
# Needs Node, Python 3 with numpy, ffmpeg and Playwright's Chromium.
set -euo pipefail
cd "$(dirname "$0")/.."
dir=$(node social/make.mjs "$@")
duration=$(grep -o 'duration: [0-9.]*' "$dir/video.html" | head -1 | cut -d' ' -f2)
python3 social/soundtrack.py "$dir" "$duration"
node social/render-slides.mjs "$dir"
node social/render-reel.mjs "$dir"
echo "$dir"
