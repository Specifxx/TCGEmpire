# Switching the site to serve public data from GitHub

Built and tested on 2026-10-09 (DECISIONS.md, "Public data moves out of Neon
into the repository"). Nothing changes until `PUBLIC_DATA_MODE` is set in
Vercel and a production build runs.

## The three modes

| `PUBLIC_DATA_MODE` | Public pages read | If Neon dies | Saves Neon transfer | Site price freshness |
| --- | --- | --- | --- | --- |
| `db` (unset, today) | Neon | whole site fails | no | after each import (twice a day) |
| `fallback` | Neon, files when Neon fails | public pages keep working | no | twice a day; daily while Neon is down |
| `files` | the files only | public pages keep working | yes, most of it | once a day (the release right after the morning import's snapshot) |

In every mode, accounts, collections, alerts, orders and the marketplace stay
in Neon, and the alert emails still run on the twice-daily imports.

Recommended order: `fallback` first for a day or two, then `files`.

## Prompt for Claude in Chrome

Paste this into Claude in Chrome (signed in to Vercel as the project owner):

> Open https://vercel.com and go to the **riftcompare** project (team
> "specifix-s-projects"). Go to **Settings → Environment Variables**. Add a new
> variable named exactly `PUBLIC_DATA_MODE` with the value `fallback`, ticked
> for **Production** and **Preview** (not Development). Save it. Do not change
> or delete any other variable.
>
> Then go to **Deployments**, open the most recent **Production** deployment,
> open its **⋯** menu and choose **Redeploy**. In the dialog, leave "Use
> existing Build Cache" **unchecked**, and confirm. Wait until the new
> deployment shows **Ready** (it takes several minutes).
>
> When it is Ready, open https://riftcompare.com, https://riftcompare.com/browse,
> https://riftcompare.com/price-guide and one card page from the homepage, and
> confirm each shows cards with prices. Then open the deployment's **Logs**
> (Runtime Logs) and search for `public-data`. Report any lines you find,
> especially ones containing `[public-data:unsupported]`, and tell me the
> deployment URL and its status. Do not change anything else.

To move from `fallback` to `files` later, run the same prompt with the value
`files` and the instruction to **edit** the existing variable instead of adding
one.

## Rolling back

Set `PUBLIC_DATA_MODE` back to `db` (or delete it) and redeploy. Neon still
holds every row; nothing was moved out of it.

## What to watch after switching

- **Runtime logs.** `[public-data:unsupported]` names a query shape the file
  engine refused, which went to Neon instead. Send it to Claude to add.
- **The egress audit** (`egress-audit.yml`, Sundays) shows the Neon transfer
  drop.
- **The daily export.** It appears as the "Export and publish the public data
  snapshot" step in `refresh-prices.yml`, and as a `data: public data snapshot`
  commit each morning. If it fails, the site keeps the previous day's files.

## When the site's data changes in `files` mode

Once a day. The morning import (`refresh-prices.yml`, scheduled 07:00 UTC but
started hours late by GitHub) exports the snapshot, commits it, and then
dispatches the production release, so every release carries that day's
snapshot. A card added to the database (a new set's import) appears on the
site with the next morning's snapshot and release. If the import or export
fails, `production-deploy.yml`'s 22:00 UTC fallback releases whatever `main`
holds, which is the previous snapshot.
