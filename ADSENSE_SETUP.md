# Ads (Google AdSense) — status & how to earn more

**Status: LIVE.** The publisher id `ca-pub-6842128782879909` is baked into the
code (`src/lib/ads.ts`), so the AdSense loader, the verification meta tag and
`/ads.txt` are all active in production. The remaining steps are on Google's side
(approval) and in the AdSense dashboard (turn on Auto ads). This doc is the
checklist.

> Why AdSense: free, no minimum traffic to apply, pays per impression/click, and
> it pairs cleanly with the affiliate links already on the site (eBay / Amazon /
> TCGplayer). For a content + comparison site like this, AdSense is the right
> first ad network. You can layer on others later (Ezoic/Mediavine) once traffic
> grows.

## What's already done (live in production)

- **Publisher id baked in** (`ca-pub-6842128782879909`) — no env config needed.
- **Loader script** in `<head>` site-wide.
- **`google-adsense-account` meta tag** for instant site verification.
- **`/ads.txt`** served automatically (required to get paid).
- **`AdSlot` component** renders real responsive ad units where a slot id is set,
  and renders **nothing** (clean — no placeholder boxes) where one isn't, so Auto
  ads fill those spots instead. Visitors never see an empty ad box.
- **Revenue-optimised placements** (UX-safe): in-article units (top + bottom of
  blog/guides), an in-content unit below the price table on every card page, and a
  leaderboard on `/browse`. All are below the content the visitor came for.
- **Privacy Policy** page at `/privacy` (AdSense **requires** one) + footer link.

## What you still need to do (Google's side — can't be automated)

1. **Confirm the site in AdSense.** Go to <https://adsense.google.com> → add/confirm
   site `riftcompare.com` → click **Verify** (the meta tag + script are already
   live, so it verifies instantly).
2. **Turn on Auto ads** — AdSense → **Ads → By site → riftcompare.com → Auto ads
   ON**. This is what actually starts earning across the whole site using the
   loader that's already installed. No slot ids required.
3. *(Optional, for more control/revenue)* Create Display ad units and send me the
   ~10-digit slot ids, or set them yourself as env vars (see `.env.example`:
   `NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE` / `_BROWSE` / `_CARD`). The hand-placed
   units then light up in the highest-value spots.

### Wait for approval
- Google reviews the site (usually a few days, sometimes up to ~2 weeks).
- Requirements the site already meets: real content (blog, guides, decks),
  clear navigation, a Privacy Policy, and contact info. Keep adding content while
  you wait — more original pages = faster approval and more revenue.

- Google reviews the site (usually a few days, up to ~2 weeks). **No ads show
  until it's approved** — that's a Google gate, not a code issue. Everything the
  reviewer looks for is in place (content, navigation, Privacy Policy, contact,
  ads.txt). Keep publishing content while you wait.

### Get paid
- In AdSense → **Payments**, add your address and bank details.
- Google verifies your address with a PIN (mailed once you hit ~$10 earned) and
  pays out once you reach the **$100** threshold.

## Manual units (optional, for more revenue/control)
- Create Display ad units in AdSense and set their slot ids as env vars:
  - `NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE` — in-article units (blog/guides)
  - `NEXT_PUBLIC_ADSENSE_SLOT_BROWSE` — leaderboard on `/browse`
  - `NEXT_PUBLIC_ADSENSE_SLOT_CARD` — in-content on card pages
- Redeploy. Those spots switch from Auto-ad fill to your hand-placed units.
- Auto ads + manual units can run together.

## Notes & gotchas
- **`ads.txt` is mandatory** to be paid — it's automatic here, just verify it loads.
- Don't click your own ads, ever (instant ban).
- Ad revenue scales with traffic — focus on SEO and content; the plumbing is done.
- Toggle all ads off instantly by setting `NEXT_PUBLIC_ADSENSE_CLIENT=""`.
