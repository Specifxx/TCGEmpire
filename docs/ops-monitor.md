# The ops monitor

The site checks itself every three hours and emails the owner only when something
needs a look. This is the one-page guide: what it watches, what you will receive,
and the one-time setup. DECISIONS.md, "The site watches itself" (2026-10-14), has the
reasoning.

## What you get

| | |
| --- | --- |
| **Alert email** | Sent when a check turns amber or red (once), gets worse, stays open for a day (red) or three (amber), or recovers. Each item says what is wrong and what to do; most end with a sentence to paste to Claude. |
| **Instant inbox email** | Every contact message, feedback, wrong-price report, store suggestion and support ticket is emailed the moment it is submitted, as is every Stores plan purchase and every edit a paying store makes to its store page text. At most 8 an hour and 25 a day, so spam cannot use up the email allowance; the rest still land in the inbox. |
| **Weekly email** (Monday, Sydney morning) | "All healthy" or what is flagged, plus the inbox count. **If it does not arrive, the monitor has stopped.** |
| **/admin** | A status strip at the top and a red "N new" on the Inbox tile. |
| **/admin/health** | Every check, with bars for the Neon limits and the eBay allowance. |

Emails go to `bill.jyang101@gmail.com` (set `OWNER_ALERT_EMAIL` in Vercel and GitHub to change it).

## What it watches

| Area | Checks |
| --- | --- |
| Databases & limits | Main database answering · main and history database **monthly transfer** (% used, rate, days until it runs out) · age of the safety-net copy of prices |
| eBay | API keys accepted · daily call allowance · auction sweep · eBay listings freshness |
| Prices & data | Store prices per market · sealed prices · store scraper health job · daily price history files · DexCompare's browse index (the Pokémon section's store prices) |
| Payments | Stripe key accepted · Stripe webhook enabled and delivering · a paid **Stores plan** waiting more than two days to be linked to its tracked store (amber: "A store paid for the Stores plan and has no report yet" — link it at `/admin/store-partners`) |
| Email | Resend key accepted · Brevo key accepted |
| Site & deploys | Five key pages load with prices · latest production build · price import, auction sweep, sealed refresh, store health and daily release jobs (failed or overdue) · required settings present on the site (including `STRIPE_STORE_PRICE_ID` once any Stores plan exists) |
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
