# Radiance release reel — ready to post

**Files** (this folder):
- `reel.mp4`: 1080×1920, 30 s, 30 fps, H.264 + AAC, with its own original soundtrack (−14 LUFS)
- `cover.jpg`: the "RADIANCE IS OUT" frame, for the reel cover
- `cover-chase.jpg`: the Seraphine #1 frame, an alternative cover

Every price is the cheapest listing on RiftCompare on 23 Oct 2026 (02:07 UTC),
before postage. If you post on a later day, check the five prices on the site
first and edit the caption to match. The video says "23 Oct", so it stays true.

---

## Caption (copy everything between the lines)

---

Riftbound: Radiance is out ✨ Here's the chase list: the 5 dearest Radiance cards right now, and all five are Signatures.

#5 Ezreal, Dashing 180* · from US$1,200
#4 K'Sante, Pride of Nazumah 172* · from US$1,304.33
#3 Ziggs, Hexplosives Expert 169* · from US$1,600
#2 Evelynn, Agony's Embrace 175* · from US$1,799
#1 Seraphine, Starry-Eyed Songstress 174* · from US$2,312.54

(Cheapest listing on 23 Oct, before postage.)

Cracking packs this week? Every 14-card booster has 7 Commons, 3 Uncommons, 2 foil Rares or better, 1 foil of any rarity and a token. Riot hasn't published pull rates.

Pulled something good? Tick it in our free set tracker to see what's left to collect and the cheapest listing for every card you're missing. We compare 230+ stores across AU, US, UK, EU, CA and SG 👉 riftcompare.com (link in bio)

Which one are you chasing? Tell us below 👇

RiftCompare is fan-made and isn't endorsed by Riot Games.

#Riftbound #RiftboundTCG #RiftboundRadiance #LeagueOfLegends #TCG

---

## Hashtags

The five at the end of the caption are the core set. Instagram now favours a
few relevant tags over a wall of them. If you want more reach, swap one or two
for these, or put them in the first comment:

`#rbradiance #KDA #Heartsteel #Seraphine #PackOpening #TCGCommunity #TradingCards #RiotGames`

## In the Instagram app

1. **New reel → upload `reel.mp4`.** Leave "Original audio" on: the track is ours, so it won't be muted or swapped.
2. **Cover:** "Add from camera roll" → `cover.jpg`. Check it in the 1:1 grid preview: the title sits in the centre, so it crops well.
3. **Paste the caption.** Add a location if you like (your city reaches local players).
4. **Topics:** Trading card games, League of Legends.
5. **First comment** (pin it): "Full Radiance price list, every card and every store → riftcompare.com/sets/radiance". The set page is the most useful landing for this post.
6. **Share to feed: on**, so it lands on your grid as well.

## Optional tweaks

- **A trending sound:** add it in Instagram's audio editor with "Original audio" at about 30%. The impacts in our track land on every cut, so keep some of it.
- **Text** is baked into the video. If you want to change a word, edit `index.html` and re-render (see the README note below), not in Instagram.
- **Safe zones.** Everything important sits between 210px and 1600px from the top, so Instagram's caption, buttons and profile row never cover a price.

## Re-rendering

```
cd social/instagram/reels/2026-10-radiance-release
python soundtrack.py                                    # needs numpy + scipy
node ../../render-reel.mjs .                            # needs playwright-core, Chromium, ffmpeg
```
