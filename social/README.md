# RiftCompare on social: TikTok, YouTube Shorts and Instagram

Short videos and carousels made from the site's own price data, so posting costs
nothing but the minute it takes to upload. Zero ad budget: the goal is visitors
and affiliate buy clicks, through the link in each profile.

## Make a pack

```
bash social/build.sh movers          # this week's 5 biggest risers and 5 drops
bash social/build.sh top SFD         # a set's 10 most expensive cards (OGN OGS SFD UNL VEN RAD LGC)
bash social/build.sh boxes RAD       # cheapest booster box at a store in each market
```

Each writes `social/out/<day>-<pack>/` (git-ignored):

| File | Where it goes |
|---|---|
| `video.mp4` 1080×1920, 15–30 s, original track | TikTok, Instagram Reel, YouTube Short: the same file to all three |
| `cover.jpg` | Reel and Short cover |
| `s1.png`… 1080×1350 | Instagram carousel (same story, swipeable) |
| `tiktok.txt`, `instagram.txt`, `youtube.txt` | Captions; YouTube has a title and a description |
| `CHECK.md` | Every number with its card page. Open two or three before posting |

Needs Node, Python 3 with numpy, ffmpeg and Playwright's Chromium. Card art comes
from `public/card-art`; the newest sets aren't there yet, so `top RAD` / `top VEN`
need `--remote-art` (the image CDN), which works on a laptop or in Actions but
not in the cloud sandbox. `node social/preview.mjs <dir> 2 9` takes stills to
look at before filming the whole thing.

Code: `make.mjs` (what each pack says), `lib/data.mjs` (the numbers, read from
`data/public` and `data/price-history`), `lib/video.mjs` and `lib/slides.mjs`
(the pages), `lib/style.mjs` (the look), `render-*.mjs` (frame-exact filming).

## The numbers: same basis as the site, always dated

- Card prices are the site's history basis: the cheapest in-stock listing across
  our AU, US, UK and SG stores that Sydney day, in US$ (what `/movers` shows).
- Movers use the site's guards: nothing under US$3, no move of +300% or −80% or
  more (a mismatched listing, not a market), promos left out.
- A set's top list holds back any card whose cheapest listing halved overnight
  (how a mismatched listing shows up; Riven 173* at Radiance's launch) and lists
  it in CHECK.md.
- Box prices are per market in that market's own currency, never converted, from
  independent stores only (no eBay, no TCGplayer row), and a pre-order says so.
- Wording (`docs/launch-radiance-2026-10.md`): "cheapest listing, before
  postage", with the date. Never "worth", never a prediction ("before it
  spikes"), no buy-now pressure, no saving percentages.

## Brand

The Riftbound look with our mark: the swirl R in the orange-gold wordmark,
Anton / Cinzel / Montserrat (SIL OFL, `fonts/`), gold filigree, a marbled swirl,
RiftCompare green for the number that matters.

1. Never Riot's or Riftbound's logo files: their fan policy needs a written
   licence for logos and trademarks in a fan project's socials. Name the game in
   plain text.
2. Every post carries "RiftCompare is fan-made and isn't endorsed by Riot Games."
   (end card and caption). Card art stays uncropped enough to read.
3. Never claim a partnership, creator deal or endorsement that hasn't happened.

## Channel plan

One vertical video a pack, posted to all three platforms; the carousel goes to
Instagram only. Upload the clean `video.mp4` everywhere, never a download with
another platform's watermark (Instagram and YouTube push those down).

| Day (Sydney) | Pack | Why |
|---|---|---|
| Monday | `movers` | The week's price story; the data day after the weekend's sales |
| Wednesday | `top <SET>`, rotating RAD → SFD → OGN → UNL → VEN | Evergreen "most expensive" search and share bait |
| Friday | `boxes <newest set>` | Weekend buyers; each country sees its own stores |
| Release weeks | extra: set out, chase list, box prices on day 1 and day 7 | The spikes in search and views |

Post at 9–11 am Sydney (Tue–Sat): that is the US evening, the biggest English
audience. Reply to every comment in the first hour; pin a question ("Which one
are you chasing?"). Links: TikTok and Shorts captions can't carry a clickable
link, so every profile's link is tagged and the caption says "link in bio";
Instagram stories can carry a link sticker (CHECK.md has the tagged URL). Visits
land in the site's entry-source bucket "social" (`src/lib/entry-source.ts`).

Reddit is separate and hand-written per community (see the project's Reddit
posts); don't cross-post these videos there.
