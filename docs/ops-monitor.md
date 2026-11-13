# The ops monitor

The site checks itself every three hours and emails the owner only when something
needs a look. This is the one-page guide: what it watches, what you will receive,
and the one-time setup. DECISIONS.md, "The site watches itself" (2026-10-14), has the
reasoning.

## What you get

| | |
| --- | --- |
| **Alert email** | Sent only for RED: when a check turns red, stays red for another day, or recovers from red. Amber is shown on `/admin/health`, Empire HQ and the Monday report, never mailed on its own. Each item says what is wrong and what to do; most end with a sentence to paste to Claude. |
| **Instant inbox email** | Every contact message, feedback, wrong-price report, store suggestion and support ticket is emailed the moment it is submitted, as is every Stores plan purchase and every edit a paying store makes to its store page text. At most 8 an hour and 25 a day, so spam cannot use up the email allowance; the rest still land in the inbox. |
| **The one Monday report** (Monday, Sydney morning) | Every site in one row (Google clicks vs target, earnings, health), the steps waiting for you, RiftCompare's flagged checks, money and the growth detail (`src/lib/hq/weekly-email.ts`). It replaced the weekly digest and the growth report. **If it does not arrive, the monitor has stopped.** |
| **/admin/hq** | Empire HQ: the Monday report's rows, live, with a Done button for each step. |
| **/admin** | A status strip at the top and a red "N new" on the Inbox tile. |
| **/admin/health** | Every check, with bars for the Neon limits and the eBay allowance. |

Emails go to `bill.jyang101@gmail.com` (set `OWNER_ALERT_EMAIL` in Vercel and GitHub to change it).

## What it watches

| Area | Checks |
| --- | --- |
| Databases & limits | Main database answering · main and history database **monthly transfer** (% used, rate, days until it runs out) · age of the safety-net copy of prices |
| eBay | API keys accepted · daily call allowance · auction sweep · eBay listings freshness |
| Prices & data | Store prices per market · sealed prices · store scraper health job · daily price history files · a **new Riftbound set on TCGplayer** that `SETS` does not know yet (red: "Tell Claude: add the Riftbound set …"; its pre-order page builds itself once added) · DexCompare's browse index (the Pokémon section's store prices) |
| Earnings | Every source the earnings dashboard (`/admin/earnings`) is connected to still answers: Stripe, TCGplayer (Impact), eBay Partner Network, AdSense. Amber when a connected one fails; one not set up yet is only noted. |
| Payments | Stripe key accepted · Stripe webhook enabled and delivering · a paid **Stores plan** waiting more than two days to be linked to its tracked store (amber: "A store paid for the Stores plan and has no report yet" — link it at `/admin/store-partners`) · a **store partner code** that stops showing within a week unless someone re-tests it at the store's checkout (amber; set its `checked` date in `src/lib/store-partner-deals.ts`) |
| Email | Resend key accepted · Brevo key accepted |
| Site & deploys | Five key pages load with prices · latest production build · the Discord price bot's endpoint (once set up: it must refuse an unsigned request with 401) · price import, auction sweep, sealed refresh, store health and daily release jobs, and the SEO check that runs against the live site after each production deploy (failed or overdue) · required settings present on the site (including `STRIPE_STORE_PRICE_ID` once any Stores plan exists) |
| Search engines | Bing indexing for the small sites: pages in Bing per site, a refused URL submission or a site not verified in Bing Webmaster (amber; `scripts/bing-submit.ts`) |
| Inbox | Anything waiting more than two days |

A check that cannot run (a key is not set, an API is unreachable) shows grey and
**never raises an alert**.

## One-time setup

Everything works without this except the Neon limit tracking. Do these in order of value:

1. **`NEON_API_KEY`** (turns on the transfer-limit bars and the "will run out in N days" warning).
   Neon console → Account settings → API keys → Create. Then GitHub → the repository →
   Settings → Secrets and variables → Actions → New repository secret → name `NEON_API_KEY`.
   If your databases live in a Neon *organisation*, also add `NEON_ORG_ID`.
2. **Check these Actions secrets exist** (the other workflows already use them):
   `RM8`, `CRON_SECRET`, `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `STRIPE_SECRET_KEY`.
3. **Optional:** add `RESEND_API_KEY` as an Actions secret so alerts can be sent without
   going through the site. Without it the alert is sent by the site, which is enough unless
   the site itself is down; an undeliverable urgent alert fails the job, and GitHub emails the owner.
4. Run it once: GitHub → Actions → "Ops monitor" → Run workflow. Tick **dry run** to see the
   result in the log without sending anything.

When a database changes (a migration), nothing here needs editing: the monitor reads the
live database name from `src/lib/db-chains.ts` like everything else.

## Reading an alert

- **Red / "needs attention"** — act on it today. Usually the fix is a sentence to Claude.
- **Amber / "heads up"** — nothing is broken; it will be if ignored. For the Neon limit it means "on pace to run out before the month resets".
- **Back to normal** — the problem it told you about has cleared.

## Adding a new thing to watch

Anything new that can quietly stop (a scheduled job, an external API, a limit) gets a check:
write it in `src/lib/ops/checks.ts` with a plain-English summary and an `action`, add it to
`runChecks`, and add a test in `tests/ops-monitor.test.ts`. Workflows go in the `JOBS` list.
