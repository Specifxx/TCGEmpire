# RiftCompare on Instagram: the Riftbound look

The posts that do well on Riftbound Instagram (the Syncd "Overnumbered Evelynn"
post is the reference) look official because they borrow the game's own visual
grammar. This kit copies that grammar and puts **our** mark where the game's logo
would sit.

## What makes it read as "Riftbound"

Observed from the game's packaging, card frames, site and the reference post.
Riot publishes no public brand guide, so these values are matched by eye.

| Element | Riftbound does | We do |
|---|---|---|
| Wordmark | Chunky condensed caps, orange→gold gradient, swirl replacing the O | `RIFT ⟳OMPARE` in Anton with the same gradient; our green swirl C (`public/logo-c.png`) recoloured orange takes the swirl's place |
| Sub-lockup | "LEAGUE of LEGENDS" in white classical serif caps, small "of" | "RIFTBOUND price TRACKER" in Cinzel, small gold "price" |
| Ribbon | "TRADING CARD GAME" in a thin gold bracket bar | "EVERY STORE · ONE SEARCH" in the same bar, dark-backed |
| Background | Marbled energy swirl (icy blue/white on navy; Vendetta used red/green) | SVG turbulence marble, `#05070f → #0b1833 → #a9dcff` |
| Frames | Hairline gold filigree around every card element | `--filigree: #d4a94f`, 2px lines, double inset borders |
| Headline | Heavy white caps, thick electric-blue outline + glow | Montserrat 900, 7px `#2f6bff` stroke, blue glow |
| Hero | One card, centred, large, glowing | Same: card at ~45% width with gold edge + warm glow |

RiftCompare green (`#34d17e`) is used **once per slide**, for the number or the
button that matters. That keeps the posts recognisably ours.

## Rules

1. **Never use the Riftbound or League of Legends logo files.** Riot's fan policy
   ("Legal Jibber Jabber") requires a written licence before their logos or
   trademarks appear in a fan project, its ads or its socials. We can name the
   game in plain text. We copy the style, not the mark.
2. Every carousel carries the line "RiftCompare is a fan-made price tool and isn't
   endorsed by Riot Games." Put it on the last slide or in the caption.
3. Card art is fine as the subject of the post (same as the card pages on the site).
   Keep the card uncropped so the artist credit and © RGI line stay visible.
4. Prices follow `docs/launch-radiance-2026-10.md`: "cheapest listing today, before
   postage", the date it was checked, no "worth", no "before it spikes", no
   buy-now pressure, no saving percentages.
5. Real numbers only: pull them from `data/public/` (cards.json + listings/) on the
   day you make the post.
6. Light text never sits straight on the swirl. Put it on `.glass` or a `.panel`.

## Making a post

```
cp -r social/instagram/posts/2026-10-evelynn-alt-art social/instagram/posts/<new>
# edit index.html: card art path, headline, prices, swirl seed
npm i --no-save playwright-core
node social/instagram/render.mjs social/instagram/posts/<new>   # writes s1.png, s2.png…
```

Canvas is 1080×1350 (Instagram portrait, 4:5). Change `seed` on the
`feTurbulence` to get a different swirl; for a warm set, swap the `#bands` stops
to reds and oranges.

Fonts (all SIL Open Font License, in `fonts/`): Anton, Cinzel, Montserrat.

## Caption for the first post

> Alt art Evelynn from Radiance 🔥 Where's the cheapest copy right now?
>
> Lowest in-stock listing per region (15 Oct, before postage):
> 🇺🇸 US$35.17 · 🇪🇺 €38.00 · 🇨🇦 C$48.18 · 🇦🇺 A$55.40
>
> Radiance releases 23 October. Search any card across 190+ stores, free → riftcompare.com (link in bio)
>
> RiftCompare is fan-made and isn't endorsed by Riot Games.
>
> #Riftbound #RiftboundTCG #rbradiance #Evelynn #LeagueOfLegends #TCG
