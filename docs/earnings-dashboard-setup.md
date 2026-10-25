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

---

## Part 5. Enter every Vercel and Anthropic invoice as a cost (Claude in Chrome)

Vercel and claude.ai have no billing API for your own plan, so each invoice is
entered on the dashboard as a one-off cost on its date. Everything spent on both
is RiftCompare's. Paste this into Claude in Chrome while logged in to Vercel,
claude.ai (and platform.claude.com if you use the API) and riftcompare.com as
the admin:

```
You are helping me (the owner of riftcompare.com) record my historical spend on Vercel and Anthropic as costs on my own admin dashboard. All of it is RiftCompare's. Read each page before clicking. Do NOT change any plan, payment method or billing setting, and do not download anything I didn't ask for. Never type card numbers anywhere.

STEP 1. Collect Vercel invoices
1. Go to vercel.com → my team (Specifix's projects) → Settings → Billing → Invoices (or "Invoice history").
2. For EVERY invoice since the first one, note: invoice date (YYYY-MM-DD), total amount actually charged (including tax), currency.

STEP 2. Collect Anthropic invoices
3. Go to claude.ai → Settings → Billing → Invoices (or "View invoices", which may open Stripe's billing portal). For EVERY invoice, note the date, total charged and currency. Include plan changes, upgrades and any extra usage charges.
4. If I also have a Claude Console (platform.claude.com) account, go to Settings → Billing → Invoice history and note those invoices too, marked "API".

STEP 3. Show me the list before entering anything
5. Show me one table: Source (Vercel / Claude plan / Claude API), Date, Amount, Currency, and the total per source. Wait for me to say "go".

STEP 4. Enter them on the dashboard
6. Open https://riftcompare.com/admin/earnings and scroll to "Costs".
7. For each invoice, fill the form and click "Add cost":
   - What: "Vercel invoice YYYY-MM", "Claude plan invoice YYYY-MM" or "Claude API invoice YYYY-MM"
   - Type: Hosting for Vercel, AI for Anthropic
   - Amount: the total charged (number only, e.g. 20.00)
   - Currency: the invoice's currency
   - Repeats: One-off
   - Date: the invoice date
8. Don't enter an invoice twice: check the list under the form first. If a Claude API invoice's month already shows a figure in the "Anthropic API usage" row (i.e. the admin key is connected), skip that API invoice so it isn't counted twice.
9. Do not remove or edit any entry already in the list (the "Reddit + Meta ads" entry is mine).

STEP 5. Report
10. Tell me how many entries you added per source and the totals, and confirm the "Total costs" all-time figure on the dashboard went up by that amount.
```

Going forward, add each new month's invoices the same way (or re-run the prompt
and tell it to add only invoices newer than the latest entry).
