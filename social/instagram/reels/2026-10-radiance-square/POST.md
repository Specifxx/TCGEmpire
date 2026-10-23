# Radiance square post — ready to post

**Files** (this folder):
- `video.mp4`: 1080×1080, 38 s, 30 fps, H.264 + AAC. A calm, original lo-fi track (−16 LUFS).
- `cover.jpg`: the cover, Radiance's 20 most expensive cards with their cheapest listing.
- `caption.txt`: the caption below, as a file you can copy on your phone.

Every price is the cheapest listing on RiftCompare on 23 Oct 2026 (02:07 UTC),
before postage. Posting on a later day? Check the prices on
riftcompare.com/sets/radiance first. The cover and caption say "23 Oct", so they
stay true even if the numbers move.

## In the Instagram app

1. **+ → Post** (not Reel). Pick `video.mp4`. Keep it at **1:1** (tap the crop
   icon if Instagram suggests 4:5).
2. **Cover → "Add from camera roll" → `cover.jpg`.** Your grid shows the top 20,
   and the video plays when someone taps it.
3. **Paste `caption.txt`.** Leave "Original audio" on: the track is ours.
4. **First comment (pin it):** "Every Radiance card, every store →
   riftcompare.com/sets/radiance".
5. Optional: tag a location, and add `#rbradiance #KDA #Heartsteel #Seraphine
   #PackOpening #TCGCommunity` in the first comment for reach.

## Why it's worded the way it is

- Prices are "cheapest listing, dated, before postage", never "worth" or
  predictions (the site's posting rules, `docs/launch-radiance-2026-10.md`).
- Riven's Signature 173* has no reliable listing (the only match is a US$50
  row that is almost certainly mis-matched), so it is left out of the ranking
  and the caption says so, rather than ranking a card on a bad number.

## Re-rendering

```
cd social/instagram/reels/2026-10-radiance-square
python soundtrack.py                         # numpy + scipy
node ../../render-reel.mjs .                 # playwright-core, Chromium, ffmpeg
# cover: open cover.html at 1080x1080 and screenshot it (see render-reel.mjs)
```
