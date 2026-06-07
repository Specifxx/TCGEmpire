# Turning on ads (Google AdSense) — start earning

The site is **already wired for Google AdSense**. Nothing about the code needs to
change to go live — switching ads on is a single environment variable. This doc
is the checklist from zero to earning.

> Why AdSense: free, no minimum traffic to apply, pays per impression/click, and
> it pairs cleanly with the affiliate links already on the site (eBay / Amazon /
> TCGplayer). For a content + comparison site like this, AdSense is the right
> first ad network. You can layer on others later (Ezoic/Mediavine) once traffic
> grows.

## What's already done (this branch)

- **Loader script** added to `<head>` site-wide, gated on your publisher id.
- **`google-adsense-account` meta tag** for instant site verification.
- **`/ads.txt`** served automatically from your publisher id (required to get paid).
- **`AdSlot` component** now renders real responsive ad units; shows a styled
  placeholder until configured (so nothing looks broken pre-approval).
- **Ad placements**: in-article unit on blog/guides, leaderboard on `/browse`.
  (Auto ads can fill the rest automatically once enabled in the dashboard.)
- **Privacy Policy** page at `/privacy` (AdSense **requires** one) + footer link.
- All driven by env vars — see `.env.example` (`NEXT_PUBLIC_ADSENSE_*`).

## What I need from you

1. **Your AdSense Publisher ID** — looks like `ca-pub-1234567890123456`.
   - Get it at <https://adsense.google.com> → **Account → Settings → Account
     information → Publisher ID**.
   - That's the ONLY thing required to go live.
2. *(Optional, after approval)* **Ad unit slot ids** for the two manual
   placements, if you want pixel-perfect control instead of Auto ads. Each is a
   ~10-digit number from **Ads → By ad unit → Display ad**.

Paste them to me and I'll set the env vars + deploy, **or** follow the steps below
yourself.

## Step-by-step

### 1. Create / sign in to AdSense
- Go to <https://adsense.google.com>, sign up with your Google account.
- Add the site: `riftcompare.com`.

### 2. Verify the site
- AdSense gives you a verification snippet. **You don't need to paste it** — the
  app already emits the `google-adsense-account` meta tag and the AdSense loader
  script as soon as the publisher id env var is set. Just set the env var (step 3)
  and deploy, then click **Verify** in AdSense.

### 3. Set the environment variable (this is the "go live" switch)
- On **Vercel**: Project → **Settings → Environment Variables** → add:
  - `NEXT_PUBLIC_ADSENSE_CLIENT` = `ca-pub-…` (your id), for **Production**.
- Redeploy (Vercel → Deployments → redeploy, or push a commit).
- After deploy, confirm:
  - `https://riftcompare.com/ads.txt` shows
    `google.com, pub-…, DIRECT, f08c47fec0942fa0`
  - View source on any page shows the `adsbygoogle.js` script + the meta tag.

### 4. Wait for approval
- Google reviews the site (usually a few days, sometimes up to ~2 weeks).
- Requirements the site already meets: real content (blog, guides, decks),
  clear navigation, a Privacy Policy, and contact info. Keep adding content while
  you wait — more original pages = faster approval and more revenue.

### 5. After approval — turn on ads
- **Easiest:** AdSense → **Ads → By site → Auto ads → ON**. Google places ads
  automatically across the site using the loader that's already installed. Done.
- **Or manual control:** create two Display ad units, copy their slot ids, and set:
  - `NEXT_PUBLIC_ADSENSE_SLOT_ARTICLE` = the in-article slot id
  - `NEXT_PUBLIC_ADSENSE_SLOT_BROWSE` = the leaderboard slot id
  - Redeploy. The placeholders become live ad units.
- You can run Auto ads + manual units together.

### 6. Get paid
- In AdSense → **Payments**, add your address and bank details.
- Google verifies your address with a PIN (mailed once you hit ~$10 earned) and
  pays out once you reach the **$100** threshold.

## Notes & gotchas
- **`ads.txt` is mandatory** to be paid — it's automatic here, just verify it loads.
- Don't click your own ads, ever (instant ban). Use Auto ads "test" sparingly.
- Ad revenue scales with traffic — focus on SEO and content; the plumbing is done.
- Toggle everything off instantly by clearing `NEXT_PUBLIC_ADSENSE_CLIENT`.
