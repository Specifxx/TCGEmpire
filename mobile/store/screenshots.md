# Screenshots & store graphics

Every image the listing needs is **generated**, not hand-captured:

```bash
# from the repo ROOT
npx tsx scripts/gen-store-screenshots.ts
```

Output lands in `mobile/store/assets/`:

| File | Size | What it is |
| --- | --- | --- |
| `phone-1.png` … `phone-6.png` | 1080×1920 | Captioned phone screenshots |
| `feature-graphic.png` | 1024×500 | Play's listing header (required) |
| `icon-512.png` | 512×512 | Play's listing icon (required, no alpha) |

## How it works

The app *is* the live site in a native shell, so the generator screenshots
`https://riftcompare.com` at a real phone viewport (390×844 @3×) and composes
each capture onto an exact 1080×1920 canvas with a caption and a device bezel.
Re-run it after any redesign instead of re-capturing eight frames by hand.

Three details in there are deliberate and easy to break:

- **It sends the app's User-Agent** (`RiftCompareApp`, the same token
  `capacitor.config.ts` appends). That makes the site render exactly as it does
  *inside* the app — the native class is stamped and AdSense is paused — so the
  frames show what a user will actually get, with no web ad slots the app never
  displays. See `src/lib/native-boot.ts`.
- **It scrolls to a named heading before capturing**, in two passes. These pages
  lazy-load rows as they come into range, so the layout is still moving a second
  after the first scroll; one pass reliably overshot by several hundred pixels.
  It also uses a plain `window.scrollTo` rather than Playwright's
  `scrollIntoViewIfNeeded`, because the site sets `overflow: clip` on `<html>`
  and the CDP scroll-into-view behind that helper silently no-ops against it.
- **It proxies the site through a local plain-HTTP mirror.** Headless Chromium
  in this sandbox cannot be taught to trust the egress-inspection CA, so a
  direct `https://` navigation renders a blank page. Node does the real,
  properly-verified TLS handshake and Chromium only talks to `127.0.0.1`. On a
  normal machine this is a harmless pass-through; set `STORE_SHOT_ORIGIN` to
  point it somewhere else (e.g. `http://localhost:3000` against a local dev
  server).

## Changing the frames

Edit the `SHOTS` array at the top of `scripts/gen-store-screenshots.ts`:

```ts
{
  name: "phone-7",
  path: "/deck",
  caption: "Price a whole deck\nin one go",   // \n splits the headline
  sub: "Paste a list, see what it costs",
  scrollToText: "Deck Builder",               // optional
  settleMs: 2500,                             // optional
}
```

Keep captions to two short lines — Play crops the sides of screenshots on small
devices, and anything longer gets unreadable in the listing carousel.

## What Play requires

| Asset | Requirement |
| --- | --- |
| Phone screenshots | 2–8. Each side 320–3840px. **1080×1920 is the safe 9:16** |
| Feature graphic | Exactly 1024×500, PNG or JPEG |
| Icon | Exactly 512×512, 32-bit PNG, **no alpha channel** |

The generator flattens the icon onto the brand background precisely because Play
rejects an icon with an alpha channel.

> **Tablet screenshots.** Play warns if a listing has none and limits tablet
> surfacing. It is a warning, not a blocker. To add them, append entries to
> `SHOTS` and give the context a tablet viewport.

## Apple App Store sizes (for the iOS build)

| Device | Resolution | Simulator |
| --- | --- | --- |
| 6.7" iPhone | 1290 × 2796 | iPhone 15/16 Pro Max |
| 6.5" iPhone | 1242 × 2688 | iPhone 11 Pro Max |
| 12.9" iPad Pro (only if you ship iPad) | 2048 × 2732 | iPad Pro 12.9" |

3–10 per size, portrait. Either change `CANVAS_W`/`CANVAS_H` in the generator
and re-run, or capture from the Simulator with **File → Save Screen** (`⌘S`).
