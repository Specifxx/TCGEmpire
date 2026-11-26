# QA guard: every live site's core journeys, every day

Owner, 2026-11-26: sealed products could not be searched on OP Compare and no agent noticed. The QA guard is a
visitor that walks the journeys a buyer needs on every live site, in a real browser, at desktop (1366px) and
phone (390px) widths, and files what it cannot finish.

## What it checks (`scripts/qa-guard/journeys.ts`)

| Journey | Passes when |
|---|---|
| home | the page answers under 400 |
| search single / sealed | typing the query into the site's own header search box brings up a matching product (dropdown, else Enter) |
| search page | the site's `/search?q=` page lists a matching product (where the site has one) |
| product page: price | the first result's page shows a price |
| product page: buy links | it has a buy link; every eBay link carries `campid=5339155912`, every Amazon link a `tag=`, every TCGplayer link goes through the partner link (the site's own `/out` redirects are read, never followed) |
| filters | the list page's own keyword box narrows the list to products naming the word (a list with dropdowns only is a warning) |
| best basket | the tool renders its controls with no error |
| on every page | no console errors (trackers and ad scripts excepted), no 5xx from the site, and on a phone nothing wider than the screen |

A failed journey is tried once more on a fresh page before it counts. The guard says it is a bot in its
User-Agent (`CompareEmpireQABot`) so every site's bot filter keeps it out of analytics, views and clicks, and
analytics and ad hosts are answered with an empty 204.

Sites, queries and URL patterns are in `scripts/qa-guard/sites.ts`. Pick queries the catalogue always holds.
A site that changes its product URLs or its search box changes its entry there in the same PR.

## When it runs (`.github/workflows/qa-guard.yml`)

- **Hourly:** `changed.ts` reads each home page's build id with one plain GET and walks only the sites that
  shipped a new build, so every release is checked within the hour of going live.
- **Daily, 21:17 UTC:** every site, whatever changed.
- **By hand:** Actions → QA guard → Run workflow (`sites` = keys, comma separated).

## What happens when something breaks

1. `issues.ts` opens (or rewrites) ONE issue per broken site in `Specifxx/TCGEmpire`, labelled `qa-guard` and
   `qa:<site>`, listing each failing journey, width and page. It comments only when the failures change, and
   closes the issue when every journey passes again.
2. The daily **QA fix session** (a scheduled Claude session, 22:07 UTC, after the full walk) works every open
   `qa-guard` issue: it reproduces the failure, fixes it in the site's own repository, merges once checks pass,
   and lets the next release and walk close the issue. A failure the guard got wrong is fixed in `sites.ts`.
3. Only a failure no agent can fix (a secret, a sign-in, a paid account, a store or host that blocks us) is
   labelled `qa:owner` and added as one step to `data/hq/owner-steps.json`, which reaches the owner in the
   Monday report. Nothing else emails him.

The workflow itself is green when sites are broken (the issues say so) and red only when the guard broke;
`ops-monitor` watches it as the job `qa-guard.yml`.

The issues are on a public repository: they name the page and the journey, never anything private.
