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
entered on the dashboard as a one-off cost on its date. The dashboard is the
source of truth for ALL the owner's sites: every Vercel charge counts (the plan,
usage, and every domain bought or renewed, for any site), and all Anthropic spend. Paste this into Claude in Chrome while logged in to Vercel,
claude.ai (and platform.claude.com if you use the API) and riftcompare.com as
the admin:

```
You are helping me (the owner of riftcompare.com) record my historical spend on Vercel and Anthropic as costs on my own admin dashboard. The dashboard is the source of truth for ALL my sites, so EVERY Vercel charge counts, including domains for sites other than RiftCompare. Read each page before clicking. Do NOT change any plan, payment method, domain or billing setting (no renewals, transfers or auto-renew changes), and do not download anything I didn't ask for. Never type card numbers anywhere.

STEP 1. Collect every Vercel charge
1. On vercel.com, open the account/team switcher (top left) and note EVERY scope I have: my personal account and every team (e.g. Specifix's projects). Do steps 2 and 3 for each one.
2. Settings → Billing → Invoices (or "Invoice history"). For EVERY invoice since the first one, note: invoice date (YYYY-MM-DD), total amount actually charged (including tax), currency, and what it was for (plan, usage, or domain).
3. Domains: open the Domains tab (and Settings → Billing, or the domain's own page, for its purchase/renewal receipts). For EVERY domain bought or renewed through Vercel, for any site, note: the domain name, the purchase or renewal date, the amount charged and the currency. If a domain charge already appears on one of the invoices from step 2, keep it once only (on the invoice line) and just note which domain it was.

STEP 2. Collect Anthropic invoices
3. Go to claude.ai → Settings → Billing → Invoices (or "View invoices", which may open Stripe's billing portal). For EVERY invoice, note the date, total charged and currency. Include plan changes, upgrades and any extra usage charges.
4. If I also have a Claude Console (platform.claude.com) account, go to Settings → Billing → Invoice history and note those invoices too, marked "API".

STEP 3. Show me the list before entering anything
5. Show me one table: Source (Vercel plan/usage / Vercel domain / Claude plan / Claude API), Date, What (e.g. the domain name), Amount, Currency, and the total per source. Point out anything you think might be a duplicate. Wait for me to say "go".

STEP 4. Enter them on the dashboard
6. Open https://riftcompare.com/admin/earnings and scroll to "Costs".
7. For each invoice, fill the form and click "Add cost":
   - What: "Vercel invoice YYYY-MM", "Domain <name> (purchase)" or "Domain <name> (renewal)", "Claude plan invoice YYYY-MM" or "Claude API invoice YYYY-MM"
   - Type: Hosting for Vercel invoices and domains, AI for Anthropic
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

---

## Part 6. Vercel cost per site (2026-10-30)

The dashboard's "By site" table and the weekly growth report read Vercel's
billing API (`GET /v1/billing/charges`, per project and day). It needs two
server-only variables in the riftcompare project (Production):

- `VERCEL_TEAM_ID`: Vercel → the team → Settings → General → Team ID (`team_…`).
- `VERCEL_BILLING_TOKEN`: Vercel → Account Settings → Tokens → Create, scope:
  the team that holds the sites, no expiry or a year. Never paste it anywhere
  but the Vercel variable form.

They are read by the next production build (the daily release). Then
`/admin/earnings` → Connections shows "Vercel (per project) (cost) Connected",
and the "Vercel invoice …" entries stop counting for the last 120 days (the API
covers them; domain entries keep counting). A project the table lists as
"Vercel project <name>" is one `SITES` in `src/lib/earnings/sites.ts` does not
recognise: add its name pattern there.
