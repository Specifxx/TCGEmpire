# Connecting the earnings dashboard

`/admin/earnings` shows Stripe and Mediavine straight away. TCGplayer, eBay
Partner Network and AdSense each need read-only API keys added in Vercel
(Settings → Environment Variables → Production, then redeploy). Until then they
show "Not connected". The prompt below can be pasted into Claude in Chrome, with
you logged in to each site.

---

You are helping me (the owner of riftcompare.com) collect READ-ONLY reporting API
credentials and add them to Vercel. I am logged in to Impact, the eBay Partner
Network, Google Cloud, AdSense and Vercel in this browser. Work step by step, read
each page before clicking, and STOP and ask me before anything that changes
billing, payment details, or tracking links, or that deletes anything. Never paste
a secret anywhere except the Vercel environment variable form. At the end, tell me
which variables you set (names only, never values).

PART 1. TCGplayer via Impact (app.impact.com)
1. Open Settings (gear) → API (or "Account Settings → API Access").
2. Copy the Account SID and the Auth Token. If only a "read/write" token exists,
   create a READ-ONLY token if the page offers one.
3. In Vercel (project riftcompare → Settings → Environment Variables, Production)
   set IMPACT_ACCOUNT_SID and IMPACT_AUTH_TOKEN.

PART 2. eBay Partner Network (partnernetwork.ebay.com)
4. Click the cloud icon at the bottom left → API. If API access is not enabled,
   enable it (this only exposes reports).
5. Copy the Account SID and Auth Token.
6. In Vercel set EPN_ACCOUNT_SID and EPN_AUTH_TOKEN.

PART 3. AdSense (Google Cloud + OAuth Playground)
7. console.cloud.google.com → create (or pick) a project → APIs & Services →
   Library → enable "AdSense Management API".
8. APIs & Services → OAuth consent screen: External, app name "RiftCompare
   earnings", add my own email as a test user. No other scopes needed.
9. APIs & Services → Credentials → Create credentials → OAuth client ID → Web
   application. Authorised redirect URI:
   https://developers.google.com/oauthplayground . Copy the Client ID and Client
   secret.
10. Open https://developers.google.com/oauthplayground → gear icon → tick "Use
    your own OAuth credentials" → paste the Client ID and secret.
11. In "Step 1", enter the scope
    https://www.googleapis.com/auth/adsense.readonly → Authorize APIs → sign in
    with the Google account that owns the AdSense account → allow.
12. "Step 2" → Exchange authorization code for tokens → copy the Refresh token.
13. In Vercel set ADSENSE_API_CLIENT_ID, ADSENSE_API_CLIENT_SECRET and
    ADSENSE_API_REFRESH_TOKEN. (The AdSense account id is read from the site's
    existing ad client id; nothing else is needed.)
14. Important: while the consent screen is in "Testing", Google expires the
    refresh token after 7 days. On the OAuth consent screen click "Publish app"
    (it only requests the read-only AdSense scope, so no review is needed for
    your own use) so the token keeps working.

PART 3b. Anthropic API usage (optional; only if you use the Claude API, not just a claude.ai plan)
14b. platform.claude.com → Settings → Organization: if it says the Admin API is unavailable for
     individual accounts, skip this part (a claude.ai Pro/Max plan has no API either way; add it on
     the dashboard as a monthly cost instead).
14c. Settings → Admin keys → Create admin key (name "RiftCompare earnings", read access is enough).
14d. In Vercel set ANTHROPIC_ADMIN_API_KEY.

PART 4. Redeploy
15. Vercel → Deployments → the latest Production deployment → ⋯ → Redeploy (so
    the new variables are read).
16. Open https://riftcompare.com/admin/earnings → "Refresh" and confirm each
    source shows "Connected". If one shows an error, copy the error text to me.

---

Mediavine has no API: add its earnings on the dashboard from the Mediavine
dashboard (by day or by month).
