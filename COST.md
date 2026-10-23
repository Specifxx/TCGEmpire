# Vercel cost audit (2026-10-23)

## What could and could not be measured

- No Vercel token or dashboard access in this session: per-project usage (ISR writes,
  origin transfer, CPU) for RiftCompare **could not be measured**. The team bill
  (Oct 10–Nov 10, all projects, $41.53) is the only figure, and it is not split per site.
- A local production build was not run (it needs the live databases); page sizes were
  not measured. The 2026-10-17 entry's ~550 KB card page figure is from that entry.
- Measured by grep: 22 dynamic `[param]` page routes outside the Pokémon section;
  13 use `generateStaticParams` over small fixed sets; 2 were ISR over an unbounded set
  of visitor codes (now changed); 104 `trackEvent()` and 10 direct `track()` calls.

## Already in place before this change

- Card pages: `force-dynamic` + `Vercel-CDN-Cache-Control` (2026-10-17).
- Production builds once a day on a `[deploy]` subject marker; previews off; `claude/*`
  never deploys. Stricter than a branch/docs filter, so left as is.
- No middleware. Page TTLs at least 21600. Import purge a no-op in files mode.
- Speed Insights removed (2026-10-16). Analytics mounted once.
- robots.txt: query-string URLs and a list of bulk scrapers disallowed. AhrefsBot,
  SemrushBot and the AI crawlers incl. CCBot are allowed on purpose (repo decisions).

## Changes

1. `/d/[code]` and `/tools/pull-tracker/[set]/s/[code]` leave ISR for the CDN
   (`SHARE_PAGES`), test-pinned to read no visitor data.
2. `images.minimumCacheTTL` = 31 days.
3. Web Analytics `beforeSend` drops localhost, `*.vercel.app`, webdriver, bots and the
   owner (`?notrack=1` / `?notrack=0`).

## Expected effect (qualitative)

Fewer ISR writes for share links, fewer image optimisations and source fetches, fewer
billed analytics events. Not quantified: no usage data was available.
