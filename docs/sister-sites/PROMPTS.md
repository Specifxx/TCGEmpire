# Sister-site prompt library

Reusable prompts for building the next RiftCompare sister site. They are
generalised from the prompts actually used to build OP Compare
(`Specifxx/OpCompare`) on 2026-10-03.

Every entry has the same parts:

- **When to use it**
- **Inputs to fill in**
- **The prompt**, in a fenced block with `{PLACEHOLDERS}`
- **How it went for OP Compare**, covering what went right and wrong

Read with:

- `docs/sister-sites/PLAYBOOK.md`: the step-by-step method. The kick-off
  prompt points the session at it.
- `docs/sister-sites/OP-COMPARE-BUILD-LOG.md`: what happened on 2026-10-03,
  with timestamps.
- `docs/sister-sites/store-discovery/`: the store-finding scripts that
  prompt 2 drives.

**Rules for every prompt here.**

- Never paste a secret value into a prompt. That covers database passwords,
  API keys, `sk_`/`whsec_`/`rk_` values, `AUTH_SECRET`, `CRON_SECRET`,
  `ADMIN_TOKEN`, OAuth client secrets and JWTs.
- Where a prompt needs a local database, use `{LOCAL_DB_URL}` and fill it in
  only in the live session. Throwaway local credentials are fine there, but
  never commit them.
- Never write the owner's personal email address into a committed prompt. Use
  `{OWNER_EMAIL}` or `{ADMIN_EMAILS}` and fill it in only when pasting.
- `{SCRATCHPAD}` is the session's scratchpad directory (the system prompt
  names it), or `$(mktemp -d)` if there is none. Never use a path inside a
  repo.

## Contents

| # | Prompt | Used for OP Compare as | Kind |
|---|---|---|---|
| 1 | [Kick-off: build {SITE_NAME} for {GAME} from RiftCompare](#1-kick-off-build-site_name-for-game-from-riftcompare) | First message (U1), plus the 15 later requests (U2–U16) folded in | Main session |
| 2 | [Store discovery](#2-store-discovery-agent) | Agent "Find One Piece TCG stores" (38 min, 121 stores) | Background agent, general-purpose |
| 3 | [Correctness review](#3-correctness-review-agent-read-only) | Agent "Review OP Compare for bugs" (22 min, 9 bugs + 1 minor) | Background agent, general-purpose, read-only |
| 4 | [Map a RiftCompare feature for porting](#4-map-a-riftcompare-feature-for-porting) | Agent "Map RiftCompare Premium/Stripe" (7 min, 44.6 KB report) | Background agent, Explore (read-only) |
| 5 | [Claude in Chrome go-live template](#5-claude-in-chrome-go-live-prompt-template) | `docs/CHROME-SETUP-PROMPT.md` in OpCompare | Pasted into Claude in Chrome by the owner |
| 6 | [Launch-post brief](#6-launch-post-brief) | The Reddit draft (U8, rewritten for U13) | Main session, at the very end |
| 7 | [QA verifier set (appendix)](#7-appendix-parallel-qa-verifier-prompts) | The `admin-parity-and-thumbnails` workflow's Build and Verify phases | Parallel verifier agents |
| 8 | [Port a RiftCompare subsystem: Map, Spec, Implement](#8-port-a-riftcompare-subsystem-map-spec-implement) | The same workflow's Map, Spec and Implement phases (admin, U14; share images, U15) | Workflow: parallel mappers, one spec writer, two implementers |
| 9 | [eBay Browse port map](#9-ebay-browse-port-map) | Workflow `ebay-port-map` (U16) | Workflow: four mappers, a spec, a challenger |

U1–U16 are the owner's requests, numbered as in
[OP-COMPARE-BUILD-LOG.md §2](OP-COMPARE-BUILD-LOG.md#2-the-owners-requests-verbatim).

Sources: the 2026-10-03 session transcript, its subagent transcripts and its
workflow scripts. The original research notes lived in a scratchpad that is
deleted when the session ends, so this file is the durable copy. Times are UTC
on 2026-10-03.

---

## 1. Kick-off: build {SITE_NAME} for {GAME} from RiftCompare

**When to use it.** Use it as the first message of the session that builds
the site. The owner creates the sister repo on GitHub first, empty or holding
only a README, and attaches it to the session.

**If you are a session that was told only "build {SITE_NAME}"** (or "build
Lorcana Compare using PROMPTS.md") and did not receive this prompt filled in:
do not start building. Placeholders are not decisions.

1. Reply to the owner with [PLAYBOOK.md §1](PLAYBOOK.md#1-decide-before-writing-code)'s
   questions as one numbered list. Pre-fill a default wherever the playbook
   has one:
   - the TCGCSV category from [PLAYBOOK §4.3](PLAYBOOK.md#43-all-tcgcsv-categories-2026-10-03);
   - markets US, CA, AU, UK, EU, SG;
   - eBay search links only;
   - price history on a GitHub `data` branch;
   - plans, gated features and trial policy copied from RiftCompare.
2. Always ask, never default:
   - the domain (never guess one);
   - the GitHub repo: the owner creates it empty. If it is not attached to
     your session, call `add_repo`, and stop if access is denied;
   - whether that repo will stay public (raw history reads need it);
   - the two-letter prefix;
   - parity in / out / later;
   - who is admin.
3. Fill this prompt from the answers, show the filled copy to the owner, and
   treat it as your instructions.

**What it fixes.** OP Compare's kick-off was a single spoken sentence:

> "similar to Riff Compare … identical website except everything is one
> piece … don't use the eBay API quota"

The owner then sent 15 more requests (U2–U16) to say the rest: three of them
after the last commit. This prompt asks those things up front. It follows §11,
"If we did it again", in the build log.

**Inputs**

| Placeholder | Example (OP Compare) | Notes |
|---|---|---|
| `{SITE_NAME}` | OP Compare | |
| `{GAME}` | One Piece Card Game | |
| `{TCGCSV_CATEGORY}` | 68 | From `https://tcgcsv.com/tcgplayer/categories`. Check that `.../{id}/groups` answers 200. |
| `{DOMAIN}` | opcompare.app | Must already be owned. Never guess a `.com`. |
| `{REPO}` / `{REPO_DIR}` | Specifxx/OpCompare, /home/user/OpCompare | Created empty by the owner. |
| `{BRANCH}` | claude/… | The branch the session works on. `main` is created at go-live. |
| `{RIFT_DIR}` | /home/user/TCGEmpire | |
| `{TEMPLATE_DIR}` / `{TEMPLATE_COMMIT}` | a clone of Specifxx/OpCompare / `d71528b` | The previous sister site, copied from git, never from a working tree ([PLAYBOOK §2.1](PLAYBOOK.md#21-a-purpose-built-port-not-a-fork)). Use a newer commit only if the owner names one. |
| `{SISTER_SITES}` | RiftCompare (riftcompare.com, Specifxx/TCGEmpire); OP Compare (opcompare.app, Specifxx/OpCompare) | All read-only |
| `{SHORT_PREFIX}` | `oc` (OP Compare's, so now taken) | Two letters for cookies, localStorage keys, the client event and affiliate sub-ids. Ask the owner (PLAYBOOK §1 Q13), e.g. `lc` for Lorcana Compare. It must not clash with a prefix already in use: `rc` (RiftCompare sub-ids), `pkmn` (RiftCompare's Pokémon section sub-ids), `oc`/`op` (OP Compare), `tcge` (RiftCompare's session cookie). |
| `{MARKETS}` | US, CA, AU, UK, EU, SG | |
| `{PARITY}` | a three-column list | Start from OP Compare's README sections "What's on the site" and "Not ported (yet) from RiftCompare", mark each row in / out / later, and add OP-only features (e.g. the `/leaders` and `/colors` hubs, which become ink-colour hubs for Lorcana). The prompt has a table skeleton. |
| `{PLANS}` | Plus $2.99/month and $23.99/year; Premium $4.99/month and $39.99/year; USD | Tiers, monthly and annual prices, currency. The owner's call. |
| `{GATED_FEATURES}` | Plus: Deal Finder; Premium: adds the Buy List Planner; both: no footer ads | The owner's call |
| `{TRIAL_POLICY}` | no trial (RiftCompare's $1 trial needs reminder emails, and there is no mailer) | The owner's call |
| `{ADMIN_EMAILS}` | the owner's address | Fill in **only in the live session**. Built into the code as the fallback admin list; the `ADMIN_EMAILS` env var replaces it when set. |
| `{SHARE_IMAGE_HERO}` | "the price guide, with real top cards and prices" | What every link preview must feature (U15). |
| `{EBAY_POLICY}` | "search links only" | Pick one: "search links only", or "own keyset, off until `EBAY_CLIENT_ID`/`EBAY_CLIENT_SECRET` are set, quota split by market and card value" (prompt 9, prompt 5 §11b). |
| `{HISTORY_STORE}` | GitHub `data` branch | Or "like RiftCompare". GitHub raw reads need a **public** repo. |
| `{SLUG}` | opcompare | Lowercase site slug: Neon/Vercel names, Stripe `metadata.site`, lookup keys |
| `{LOG_NAME}` | OP-COMPARE | Upper-kebab site name. Names the copy of the build log in this folder, e.g. `LORCANA-COMPARE-BUILD-LOG.md`. |
| `{LAUNCH_POST_LINE}` | see below the prompt | Whether to write a launch post (prompt 6) |

**The prompt**

````text
Build {SITE_NAME} (https://{DOMAIN}), a {GAME} price-comparison website, as a sister site of RiftCompare. Work in {REPO_DIR} (GitHub {REPO}, branch {BRANCH}). RiftCompare's code is at {RIFT_DIR}; treat it and every other sister site ({SISTER_SITES}) as READ-ONLY for the whole build.

Read first, in this order:
1. {RIFT_DIR}/docs/sister-sites/PLAYBOOK.md: the method. Follow its phases and checklists. Where this prompt and the playbook disagree, this prompt wins; say so.
2. {RIFT_DIR}/docs/sister-sites/OP-COMPARE-BUILD-LOG.md: how the last sister site went and what went wrong.
3. {RIFT_DIR}/CLAUDE.md, {RIFT_DIR}/docs/CURRENT-STATE.md, and the DECISIONS.md entries they link (use docs/DECISIONS-INDEX.md; DECISIONS.md is too long to read whole).
4. The previous sister site's README.md, CLAUDE.md, DECISIONS.md and docs/SETUP.md, read at {TEMPLATE_COMMIT} in {TEMPLATE_DIR} (`git -C {TEMPLATE_DIR} show {TEMPLATE_COMMIT}:README.md` and so on).

What the owner has already decided (do not re-ask; do not change):
- Domain: https://{DOMAIN}, apex canonical, www redirects to it. Use it everywhere from the first commit.
- Repo: {REPO}. Confirm it is public before building if price history lives on GitHub, and never change its visibility.
- Game data: TCGCSV category {TCGCSV_CATEGORY} for the catalogue and TCGplayer reference prices.
- Markets: {MARKETS}. Every price is shown in the visitor's market currency.
- eBay: {EBAY_POLICY}. Never call RiftCompare's eBay API or read its EBAY_CLIENT_* credentials; RiftCompare's quota is not ours.
- Price history: {HISTORY_STORE}.
- Branding: a {GAME}-themed logo, palette and fonts of our own; the layout, navigation and features otherwise match RiftCompare. Prefix {SHORT_PREFIX} for every cookie, localStorage key, client event and affiliate sub-id.
- Plans: {PLANS}. Gated: {GATED_FEATURES}. Trial: {TRIAL_POLICY}. If any of these is blank, copy RiftCompare's and list it in your report as an owner decision still open.
- Admin: {ADMIN_EMAILS} is the built-in admin fallback list (admins count as Premium); the ADMIN_EMAILS env var replaces it when set.
- Link previews: every share image features {SHARE_IMAGE_HERO}, with real data. Not a logo and a tagline.
- Feature parity:
  | Feature | in / out / later | note |
  |---|---|---|
  {PARITY}
  Rows to cover at least: price guide, browse, card/set/sealed pages, movers, market index, stores page, affiliate panels (eBay search links + TCGplayer), SEO blog with Article schema, RSS, share images, sitemap, IndexNow, Search Console and IndexNow workflows (Bing via a GSC import), GA4, accounts (Google/Discord OAuth), Plus/Premium via Stripe with gated tools, admin pages (port / adapt / skip per area, with the admins above), public feedback forms that feed admin queues, email (and any trial that depends on reminder emails), social/ad marketing.
  Before you build, post the not-ported list back to me so I can correct it early.
- Infrastructure: a NEW Neon project, Vercel project, GA4 property, Google OAuth client, Discord app and Stripe account (never RiftCompare's: its reconcile matches subscriptions by email and would cross-grant). Search Console reuses RiftCompare's service account (GSC_SA_KEY) with a fresh key; the IndexNow key and the EPN / Impact affiliate ids are reused with `{SHORT_PREFIX}-` sub-ids.
- I will not set anything up by hand. The hand-over is docs/SETUP.md (every GitHub secret/variable and Vercel env var, with where its value comes from) plus a Claude in Chrome setup prompt built from {RIFT_DIR}/docs/sister-sites/PROMPTS.md prompt 5.

How to work:
- Start from the template's committed tree: `git -C {TEMPLATE_DIR} archive {TEMPLATE_COMMIT} | tar -x -C {REPO_DIR}`. Never copy from a sister site's working tree; it may hold unreviewed work. If the template repo is not in your session, attach it read-only with add_repo and clone it outside {REPO_DIR}.
- On day one, apply PLAYBOOK §2.3's template fixes and rename every token in PLAYBOOK §2.2's list (cookies, `oc:me`, `op:*` localStorage keys, `oc-<market>` sub-ids, `affiliateSubId("oc", …)`, Stripe keys, User-Agents, the contact address default). Check with `grep -rnE '\boc[_:-]|"oc"|\bop:|opcompare|OP Compare' src scripts tests .github` until only intended hits remain.
- Before writing catalog.ts or match.ts, answer PLAYBOOK §4.1's questions for {GAME} in {REPO_DIR}/DECISIONS.md.
- If {GAME}'s TCGplayer prices carry several `subTypeName`s per product (Lorcana: Normal / Foil / Cold Foil), decide BEFORE the schema whether each finish is its own printing row (slug + finish) or one row with per-finish prices (PLAYBOOK §3.4.1). Record the choice in DECISIONS.md, and make the matcher pick the finish from the title or skip the listing.
- From minute one, start the store-discovery agent in the background (PROMPTS.md prompt 2, scripts in {RIFT_DIR}/docs/sister-sites/store-discovery/). The sister sites' store registries are biased to their own games; use them as candidate sources, not the answer.
- Build and test against a real local Postgres with a full import. The matcher must map each listing to exactly ONE printing or skip it. Add a real store title to the tests for every rule. Never loosen a rule to raise the match count. After a full import, report `SELECT pg_size_pretty(pg_database_size(current_database()))` against Neon's 0.5 GB free-tier storage.
- Keep RiftCompare's egress rules: pages read only cached loaders; no generateStaticParams prewarming of database-backed routes; no unstable_cache nesting; each cache entry well under ~1.2 MB raw; the root layout must not read cookies, headers or the session (doing so makes every page dynamic). Port RiftCompare's .github/workflows/egress-audit.yml (or a cut-down version), or record in DECISIONS why not.
- Keep the template's deploy gate: production builds only for a commit whose SUBJECT contains [deploy], one scheduled release a day. Never put [deploy] in a subject yourself. Keep the template's vercel.json, and set `git.deploymentEnabled` to `{"claude/*": false, "claude/**": false, "data": false}`. Do not copy RiftCompare's vercel.json: its www.riftcompare.com redirect and its newsletter, digest and Discord crons are RiftCompare's.
- Keep a running build log at {REPO_DIR}/docs/BUILD-LOG.md, committed with each phase (decisions, numbers, problems → cause → fix, each with time and commit), so nothing has to be reconstructed from the transcript later. Record decisions in {REPO_DIR}/DECISIONS.md too. RiftCompare stays read-only: at hand-over, offer me a copy for {RIFT_DIR}/docs/sister-sites/{LOG_NAME}-BUILD-LOG.md, and commit it there only if I say so (plain subject, never [deploy]).
- When the build is QA'd, start the correctness-review agent (PROMPTS.md prompt 3). Before porting any large RiftCompare feature, map it instead of surveying it yourself: prompt 4 for one agent, prompt 8 for a multi-area port such as admin, prompt 9 for an eBay API.
- Run `npx prisma generate && npm run typecheck && npm run lint && npm test` before every commit. Commit and push to {BRANCH} as each phase lands. Do not create `main`; the go-live prompt does.
- Once `main` exists, land each finished, verified change on `main` (a PR or a fast-forward), without [deploy], and confirm the next 08:00 UTC release picked it up. Work left on {BRANCH} rides no release. Do not branch-protect `main` unless the Actions bot may still push to it (the release workflow pushes an empty [deploy] commit there).
- If a Stop hook asks you to commit while background agents or workflows are still editing the repo, do not commit their unverified output. Say so, and commit when verification finishes.
- End your turn at each phase boundary or after each push, so messages I queue while you work are delivered. Last time one request waited 19 minutes because the whole build ran as one turn.
- Environment pitfalls from last time (PLAYBOOK §3.1 and §3.13 "Pitfalls last time" have the detail):
  - a foreground `sleep` is blocked: wait with an `until` loop in a background call, or with Monitor (a Monitor with no events expires after about 5 minutes);
  - background servers die at the 30-minute background limit: restart before final QA;
  - `pkill -f`/`pgrep -f` patterns can match your own shell (exit 144): find a server by port with `ss -ltnp | grep :<port>`;
  - Playwright may not reach localhost through the proxy: try localhost first, then the container's own IP (`hostname -I`) as a proxy bypass with `--ignore-certificate-errors`;
  - a tsx script outside the repo cannot resolve the repo's modules: copy it into the repo root as a dot-file, run it, delete it;
  - after editing a file with sed, Read it again before using Write or Edit on it;
  - use absolute paths for screenshots and logs, or they land in the repo;
  - TCGCSV refused Python urllib: use curl or Node with a User-Agent. The TCGCSV price archive returned 403 from the sandbox; try it from Actions.
- {LAUNCH_POST_LINE}

At the end, report: what was built (commits, tests, stores per market, cards with an in-stock offer per market, database size), what was not ported and why, every owner decision still open, every open item, and the filled-in Chrome setup prompt.
````

Set `{LAUNCH_POST_LINE}` to "At the very end, once the numbers are final,
write the launch post from PROMPTS.md prompt 6." Or set it to "No launch post."

**How it went for OP Compare.**

- **Wrong: the domain.** The domain was not given. The code guessed
  `opcompare.com` for 80 minutes, until the owner said "the domain name is
  opcompare.app which is really important". Fixing it took about 11 minutes and
  a rebuild of canonicals, the sitemap and workflow defaults.
- **Wrong: the stores.** The first registry was RiftCompare's 114 stores that
  happen to stock One Piece. The owner had to say "We obviously need different
  stores". The dedicated search raised UK in-stock coverage from 2,037 to 3,605
  cards and EU from 2,630 to 3,528.
- **Wrong: the parity scope arrived in pieces.**
  - Accounts and Stripe sat on the "not ported" list until the owner asked for
    them. The session then picked the prices and dropped the $1 trial itself;
    OP Compare's CLAUDE.md says those are the owner's call.
  - The owner asked to remove a "cheapest on eBay" feature that had never been
    ported, so his picture of the build was out of date mid-way.
  - The price-history architecture was reversed mid-build ("use github to store
    the data").
- **Wrong: three requests came after the last commit (`d71528b`, 10:45).**
  - U14 (11:06): "Admin features should also be the same", with the owner's
    address as admin.
  - U15 (11:07): "Website link thumbnails must also be very good featuring the
    website and mainly the price guide". The default share image until then
    was a logo and a tagline.
  - U16 (11:16): OP Compare's own eBay keyset, "a new 5000 API quota which we
    can split by region and allocate based on card price like riftcompare".

  All three ran as background workflows (prompts 7–9); none was committed by
  13:00. The prompt now asks for admins, share images and the eBay policy up
  front.
- **Wrong: queued messages arrived late.** The documentation request (U12) was
  typed at 10:29 and seen at 10:48; the launch-post voice (U13) was typed at
  10:49 and seen at 10:55. The whole build ran as one long turn, so queued
  messages surfaced only when it ended. By then most of the evidence existed
  only in the transcript and an ephemeral scratchpad. Hence the build-log line
  and the "end your turn at each phase boundary" line in the prompt.
- **Wrong: the layout made every page dynamic.** The root layout read the
  market cookie and geo header, so every page rendered on demand. RiftCompare
  forbids this. The egress line in the prompt now says so.
- **Right: the reconnaissance.** Screenshots of live riftcompare.com, reading
  RiftCompare's models, retailers and Shopify import code, and finding the
  local Postgres produced a working first commit in 53 minutes.

---

## 2. Store-discovery agent

**When to use it.** Start it in the background within the first minutes of
the build, as soon as the game's card-number format is known. Run it again
later for a market that is still thin.

**Inputs**

| Placeholder | Example | Notes |
|---|---|---|
| `{GAME}` / `{SITE_NAME}` | One Piece Card Game / OP Compare | |
| `{REPO_DIR}` | /home/user/OpCompare | The sister repo. The agent must not edit it. |
| `{RIFT_DIR}` | /home/user/TCGEmpire | |
| `{REGISTRY}` | {REPO_DIR}/src/lib/stores.ts | The NEW site's registry, passed as `--known`. Omit `--known` if it does not exist yet (at minute one it usually doesn't). Never pass a sister site's registry as `--known`: those stores are candidates. |
| `{SISTER_REGISTRIES}` | {RIFT_DIR}/src/lib/retailers.ts; OP Compare's src/lib/stores.ts | Converted to `CC|Name|URL` candidate lines. General TCG stores often carry several games. |
| `{GAME_CONFIG}` | a copy of `store-discovery/game.example.json` | Only this file changes per game, but almost every key in it does. See "Adapting the config" below. |
| `{WORK}` | {SCRATCHPAD}/stores | Where the agent writes. Not inside any repo. |
| `{MARKETS}` | US AU UK SG CA EU | Map EU to the `country=ES` Shopify market |
| `{TARGET}` | 10–25 new stores per market | |
| `{MIN_CLEAN}` | 20 | Minimum clean, numbered, English listings |
| `{KNOWN_NAMES}` | per market: well-known stores for this game | Hints only. The agent verifies every one. |

**Adapting the config to a new game.** `game.example.json` is the One Piece
config. Copied unchanged for Lorcana, its `otherGamesRe` contains `lorcana`, so
`classify()` in `store-discovery/lib.mjs` marks every Lorcana title as another
game, `clean` is false, and `verify-stores.mjs` rejects every store with "no
collection with clean numbered listings". Write `{GAME_CONFIG}` before
starting the agent, or make writing it the agent's step 0:

1. `game`, `handleRe`, `titleRe` (Lorcana: `lorcana`).
2. `conventionalHandles` (for example `lorcana-singles`,
   `disney-lorcana-singles`, `lorcana`, `disney-lorcana`) and
   `singlesHandleRe`.
3. `cardNumberRe` and `strictCardNumberRe`: sample 3–5 known stores'
   `products.json` first and write the regex from how they actually title
   singles. Do not assume. PLAYBOOK §4.1 rows 4 and 6 say how stores write
   numbers was not checked for any game but One Piece, and that slash numbers
   (Pokémon, Lorcana, Riftbound, SWU) have a different shape.
4. `otherGamesRe`: remove the new game and add the earlier sister games
   (`one ?piece|optcg` alongside `riftbound` and `pok[eé]mon`, which are
   already there).
5. `skipHandleRe`: drop `manga` and any other One Piece-only word that is
   irrelevant to the new game.
6. `foreignRe` and `gradedRe`: check the new game's foreign editions.
7. Run all three scripts on 2 stores you know stock the game, and confirm
   `clean > 0` before the full run.

(The checklist lives here because `store-discovery/README.md`'s quick start
covers One Piece only.)

**The prompt**

````text
Goal: find online stores that sell ENGLISH {GAME} singles and sealed product in these markets: {MARKETS}, for the price-comparison site {SITE_NAME}. We need stores NOT already in our registry ({REGISTRY}, if it exists yet), prioritising {GAME} specialists and big TCG retailers known for {GAME}. Target {TARGET} where they exist; an empty market is an acceptable answer, report it honestly.

Context:
- We can only read Shopify stores (public `/collections/<handle>/products.json?limit=250&page=N&country=XX`). Non-Shopify stores are out of scope: list them separately at the end, do not include them.
- Use the tooling in {RIFT_DIR}/docs/sister-sites/store-discovery/ (read its README.md first). Do not modify it; write everything under {WORK}/. The game config is {GAME_CONFIG}; if it does not exist yet, write it first per the "Adapting the config" checklist in {RIFT_DIR}/docs/sister-sites/PROMPTS.md prompt 2 and test it on 2 known stores. Pipeline (drop both `--known {REGISTRY}` if {REGISTRY} does not exist):
    D={RIFT_DIR}/docs/sister-sites/store-discovery
    node $D/detect-shopify.mjs    {WORK}/candidates.txt {WORK}/detect.json --config {GAME_CONFIG} --known {REGISTRY}
    node $D/probe-collections.mjs {WORK}/detect.json    {WORK}/probe.json  --config {GAME_CONFIG}
    node $D/verify-stores.mjs     {WORK}/probe.json     {WORK}/verify.json --config {GAME_CONFIG} --detect {WORK}/detect.json --known {REGISTRY}
  If the scripts lack something you need, copy a script into {WORK}/ and adapt the copy; say what you changed and why.
- Be polite: keep the scripts' honest User-Agent, per-host delay, robots.txt handling and backoff. Do not raise concurrency within one host.

Steps:
1. Build a candidate list (`CC|Name|URL` lines in {WORK}/candidates.txt).
   a. Convert the sister sites' registries ({SISTER_REGISTRIES}) into candidate lines. They go through the same pipeline and the same checks (language, graded, currency) as every other candidate; do NOT pass them as `--known`.
   b. Harvest regional store directories: they gave most of the last run's stores, while web search gave few. yestcg.com (US), cardcompass.co.uk (UK) and tcgstorefinder.com.au (AU) supplied 74 of the last run's 121. tcgtalk's Singapore shop list was tried and gave 0 stores that held up. Look for equivalents for every market, including the publisher's official store locator. Take every Shopify store a directory lists, whatever games the directory tags it with: last time only 92 of cardcompass's 718 stores mentioned One Piece, yet stores outside those 92 passed.
   c. Add web searches in parallel, e.g. "{GAME} singles store <country>", "buy {GAME} singles <country>", "best place to buy {GAME} singles <country> reddit", and these known names: {KNOWN_NAMES}. Verify every name by probing; never trust memory.
2. Run detect → probe → verify. Keep a store only if it has at least {MIN_CLEAN} clean (English, ungraded, single-card) listings carrying a card number, under 50% foreign, its observed currency matches its market, and it is not already registered (compare the myshopify domain, not just the host).
3. Near-misses: before rejecting a store as "too few", check whether a collection filled page 1 (verify flags it). Re-probe those over more pages (copy probe-collections.mjs into {WORK}/ with a higher `extraPagesWhenFull`) and list them as near-misses for the main session to test with the real importer. Last time a store showed 18 on page 1 and gave 960 cards on import.
4. Second pass by hand on every store you keep: open a few product pages and LOOK at the card images (Japanese, French and other prints hide behind English titles), check tags and variant options for language, graded slabs and other games mixed in.
5. Note numbers that appear only in SKUs (BinderPOS-style "Name [Set]" titles): the importer's number path will not match those; its name-plus-set path may.

Output: {WORK}/verify.json exactly as verify-stores.mjs writes it (`entries` are the kept stores, `checks` hold the evidence per key, `excluded` holds one reason per rejected candidate). Remove from `entries` any store your hand pass rejected, and add it to `excluded` with the reason. Write {WORK}/notes.md with the hand-pass results per store, the near-misses, and the non-Shopify retailers.

Then reply with a short summary: counts per market with the biggest stores, which sister-site stores passed or failed (and why: language, graded, currency, too few), notable non-Shopify retailers, exclusions grouped by reason (language, graded, currency, too few, duplicate), SKU-only stores, near-misses, odd collection names, borderline stores kept (within 10 of the threshold), and anything that looked wrong (robots.txt blocks, password-protected stores, frozen feeds). Do not edit any file in {REPO_DIR} or {RIFT_DIR}.
````

**After it returns** (the main session's QA of the agent's output):

1. Spot-probe the three biggest new stores through the site's real matcher
   (OP Compare: `scripts/probe-stores.ts`).
   - That script ignores configured collection handles, so a store whose
     sitemap hides its handles shows 0. Hodges UK did this; its real
     handles worked on import.
2. Merge `verify.json`'s `entries` into the registry. Skip duplicate keys,
   domains and currency mismatches. Run `tsc`.
3. Import only the new stores and the near-misses, e.g.
   `IMPORT_ONLY_STORES=$(cat new-keys.txt) npm run import`. Scan the per-store
   lines for stores with 1–2-digit card counts and sample matched offers in SQL.

**How it went for OP Compare.**

- **Right.**
  - The run found 121 verified stores (US 42, AU 31, CA 19, UK 17, EU 12, SG 0)
    from about 2,040 candidates.
  - The merge was mechanical: "121 added; skipped []".
  - The validation import stored 142,610 offers from those stores, with 0
    failures.
  - Directories, not web search, supplied most stores.
  - Checking the myshopify domain caught `plentyofgames.com.au` as the
    registry's `plenty`.
  - The image check caught stores with Japanese prints behind English set
    names.
- **Wrong or worth knowing.**
  - The original prompt's probe script sent a browser User-Agent and read only
    page 1. The new tooling fixes the first and partly fixes the second: the
    probe reads up to 2 extra pages (`extraPagesWhenFull`) when page 1 is full
    and the store is still short of a clear pass, while verify still samples
    page 1 only, which the README documents. (Gear Gaming showed 18 numbered
    listings on page 1 but gave 960 cards on import.)
  - The 114 stores seeded from RiftCompare's registry were passed as known, so
    they were never checked for language, graded slabs or currency; they were
    checked only for a numbered count. The prompt now runs them through the
    pipeline as candidates.
  - 33 stores carry numbers only in SKUs.
  - Singapore had no English Shopify store that held up.
  - Troll and Toad looked non-Shopify, but it is a password-protected Shopify
    store.
  - 401 Games broke the importer's 20-page cap later (fixed with
    `MAX_PAGES` 30).
  - The agent took 38 minutes. It was started 40 minutes into the build and
    only after the owner objected. Start it at minute one.

---

## 3. Correctness-review agent (read-only)

**When to use it.** Use it once the site builds, a full import has run
locally and a production server is up. For OP Compare that was about 75
minutes in. Run it again after any large matcher or import change.

**Inputs**

| Placeholder | Example | Notes |
|---|---|---|
| `{SITE_NAME}`, `{GAME}`, `{REPO_DIR}` | | |
| `{LOCAL_DB_URL}` | `postgresql://<user>:<pw>@localhost:5432/<db>` | Fill in only in the live session. Never commit it. |
| `{SERVER_URL}` | http://localhost:3000 | A `next start` production server on the current tree |
| `{REVIEW_DIR}` | {SCRATCHPAD}/review | Throwaway scripts go here, never in the repo |
| `{PRINTING_RISKS}` | One Piece: alternate art / parallel / manga / special / PRB reprint / event-stamped (PRE, RE, ANN) vs the standard print, and vice versa | Take it from your answers to PLAYBOOK §4.1. Lorcana: Normal vs Foil vs Cold Foil when finishes are price subtypes of one product (rows 12 and 20); Enchanted and other numbers above the set size (e.g. 212/207); promo numbering; slash numbers tripping `NOT_A_RAW_SINGLE`'s serial clause (row 6). |
| `{NAME_RISKS}` | One Piece: character aliases in parentheses ("Mr.3 (Galdino)") | Lorcana: " - " subtitles (e.g. "Elsa - Spirit of Winter") stripped by `baseName` (PLAYBOOK §4.1 row 22). |
| `{FOCUS}` | the numbered list in the prompt | Re-order it for the site. The matcher always comes first. |
| `{MOVING_TREE}` | "Another session is editing src/lib/match.ts right now" or empty | Tell the reviewer if the tree is moving |

**The prompt**

````text
Do a careful correctness review (read-only — do NOT edit any files) of the Next.js app in {REPO_DIR}, a {GAME} price-comparison site ({SITE_NAME}). Report only real bugs with a concrete failure scenario (input/state → wrong output or crash), ranked most severe first (rank by money and visibility: a wrong price on an expensive card beats a cosmetic crash), each with file:line, a reproduction (real store titles or URLs), and a suggested fix. Skip style nits. Say explicitly which areas you checked and found clean, and how you checked them.

{MOVING_TREE}
If the tree changes while you work, re-run every finding against the current tree before you report and drop the ones that no longer reproduce.

Focus areas, in priority order:
1. src/lib/match.ts — matching store listing titles to exactly ONE TCGplayer printing. Look for titles matched to the WRONG printing ({PRINTING_RISKS}), a single fit accepted when the title names a different set, incidental words (card types, colours) picking a more specific printing, regex mistakes (word boundaries, case, greedy groups), graded slabs, foreign-language and non-single listings slipping through, and the sealed matcher matching the wrong set or product type (cases, displays, accessories). tests/match.test.ts shows intended behaviour.
2. The import pipeline (src/lib/import.ts, src/lib/store-import.ts or equivalents): raw SQL upserts with positional params and casts, per-store offer replacement and what happens on failure, per-market aggregates (Offer.priceCents is in the market's currency; USD reference prices are USD cents), which TCGplayer price (and which finish) each printing takes, currency mix-ups, date windows, history writes.
3. Catalogue parsing (src/lib/catalog.ts): variant tokens, printing classification, name parsing ({NAME_RISKS}), slugs, sealed kinds.
4. src/lib/data.ts cached loaders: tuple encode/decode alignment, slug round-trips, cache entry sizes (budget ~1.2 MB raw per entry).
5. Pages and API routes: crashes on empty data (a set with no cards, a card with no offers, a blog post before the first import), wrong currency formatting, links to routes that don't exist, gated rows leaked to free users, and anything in the root layout that reads cookies, headers or the session (it makes every page dynamic).
6. Anything that would break `next build` on Vercel without a database, and the GitHub workflows in .github/workflows.

You can run read-only commands: `npx tsc --noEmit`, `npm test`, `psql "{LOCAL_DB_URL}"` (it holds a full import), and curl against {SERVER_URL}. The most effective method last time: export every stored store offer and the catalogue to CSV once (`psql \copy`), then write throwaway scripts under {REVIEW_DIR}/ (not in the repo) that import the real matcher functions from {REPO_DIR}/src/lib/match.ts and replay EVERY stored offer through the current code, diffing against what is stored. Return a concise list of verified findings.
````

**After it returns.** Turn every finding into a failing real-title test
first, then fix it.

1. Re-import.
2. Replay all stored offers again. OP Compare skipped this step after its
   review fixes; do not.
3. Report how many offers moved printing and how many are now skipped.
4. Record the rules in `DECISIONS.md`. OP Compare's entry is "The set a title
   names decides; aliases are names (review fixes)".

**How it went for OP Compare.**

- **Right.**
  - Replaying all 188,727 stored offers through the real matcher found 9
    confirmed bugs plus 1 minor. The most expensive was original-set Manga
    listings priced as the PRB-01 Manga printing: an EU page showed €2,150 built
    entirely from OP06 listings.
  - The report's "areas that came out clean" section was as useful as the bugs.
    It confirmed:
    - the import SQL;
    - all 7,255 slugs round-trip;
    - `next build` works with no database.
  - The reviewer reported at 10:08. All 9 bugs were fixed in one commit
    (`335c40a`, 10:17). Tests went from 42 to 45. The fixes were checked by a
    full re-import (365,516 offers, 10:22), not by a replay: no replay was run
    after `335c40a`, which is why step 2 above asks for one.
- **Worth knowing: the replay before the review.** At 10:00, after the main
  session's own stamp, "(V.2)", PRB and "(Non-English)" rule-outs, a replay of
  all 328,432 stored offers left 326,707 unchanged, moved 967 to another
  printing and skipped 758.
- **Wrong or worth knowing.**
  - The main session was editing `match.ts` while the reviewer read it. The
    reviewer noticed and dropped the findings that the edits had already
    fixed. The original prompt did not warn it; this one does.
  - It did not check cache entry sizes. The 2 MB budget is still untested, and
    RiftCompare measured the safe limit at about 1.2 MB raw.
  - It did not notice that the root layout makes every page dynamic. Both
    checks are now in the focus list.
  - The focus list named One Piece printing risks. For another game those
    are the wrong bugs to hunt, hence `{PRINTING_RISKS}` and `{NAME_RISKS}`.
  - The original prompt put the local DB password inline. That is fine in a
    live session but must never be committed: use `{LOCAL_DB_URL}`.

---

## 4. Map a RiftCompare feature for porting

**When to use it.** Use it before porting any large RiftCompare system, such
as accounts, Premium and Stripe, admin, alerts or email. The agent reads, and
the main session keeps building. For a system with several separable areas
(admin had five), prompt 8 splits the map across parallel agents.

**Agent type.** Use `Explore`, which is read-only.

**Inputs**

| Placeholder | Example | Notes |
|---|---|---|
| `{RIFT_DIR}` | /home/user/TCGEmpire | |
| `{FEATURE}` | Premium subscription (Stripe) and the accounts/sign-in it depends on | |
| `{QUESTIONS}` | the numbered list below, adapted | Keep "every env var" and "tests and DECISIONS" in every map |

**The prompt**

````text
Read-only investigation of the RiftCompare codebase at {RIFT_DIR} (Next.js App Router, Prisma, Postgres). I need to port its **{FEATURE}** to a sister site, so I need a precise map. Do not edit anything.

Start with a section "Corrections to the brief's assumptions": wherever this brief guesses wrong (library names, file names, routes, mechanisms), say so first.

Report, with file paths (and line numbers where useful) and short code excerpts of the essential logic:
{QUESTIONS}
For Premium/Stripe these were:
1. Auth / accounts: library or custom code, providers, session strategy (JWT vs DB), Prisma models, sign-in/sign-out/account pages and components, middleware, every env var.
2. Stripe: checkout creation (route, mode, price ids or lookup keys, trial, success/cancel URLs, customer creation, metadata), the webhook (path, events, signature verification, DB updates, idempotency), billing portal, any sync/reconcile job, Prisma fields, every Stripe env var, plans, prices, intervals, currencies.
3. What the feature unlocks or gates, how gating is enforced (server components, API routes, helpers), what free users see instead, and how it coexists with the caching/egress rules (cached loaders, unstable_cache, ISR, the root-layout rule). Look for rules in CLAUDE.md, docs/CURRENT-STATE.md, DECISIONS.md (via docs/DECISIONS-INDEX.md) and the src/lib/db.ts header.
4. UI: pages, upgrade prompts, account page, nav entries, copy, legal pages touched.
5. Email: what it sends, through which service, env vars.
6. Tests covering it, and DECISIONS.md entries about it (title + one-line gist + line number).
7. Every env var (name, where set: Vercel vs GitHub, purpose).
8. Porting gotchas: anything that would silently break, leak across sites or double-charge if copied naively (shared accounts, hard-coded site URLs, email-based matching, fail-open crons). Flag every place where a port might reasonably behave differently from RiftCompare, so the difference is a recorded choice.

Be concrete and complete: the goal is that someone can re-implement the same behaviour in another repo from your report without reopening these files. If something is large, give the essential logic, not the whole file. Thoroughness: very thorough.
````

**After it returns.** Read the pure helpers yourself before porting them. For
Premium these were entitlement, tiers, checkout params and the OAuth `next`
handling. Port the tests with them.

**How it went for OP Compare.**

- **Right: the corrections section.** The report opened with "Corrections to
  the brief's assumptions". The brief had guessed NextAuth, a magic link,
  middleware and `src/lib/data.ts`, and all four were wrong. That opening is
  now built into the prompt.
- **Right: speed and completeness.** The map took 7 minutes and ran to 44.6 KB.
  The port landed in `d71528b` with `tests/premium.test.ts`.
- **Right: the gotchas section.** It drove two decisions:
  - a separate Stripe account, because RiftCompare's reconcile matches
    subscriptions by email;
  - prices in `src/lib/plans.ts` plus lookup keys, instead of price-id env
    vars.
- **Worth knowing.** The $1 trial was not ported, because it depends on
  RiftCompare's reminder emails and OP Compare has no mailer.
- **Worth knowing.** One choice was changed without recording a reason: OP
  Compare's reconcile cron refuses to run without `CRON_SECRET`, while
  RiftCompare's runs anyway. Ask the mapper to flag such differences
  explicitly. Item 8 now does.

---

## 5. Claude in Chrome go-live prompt (template)

**When to use it.** Use it at the end of the build. Commit the filled-in copy
to the sister repo as `docs/CHROME-SETUP-PROMPT.md`, so it is versioned with
the code it configures.

**Who runs it.** The owner pastes it into Claude in Chrome, after logging in
to GitHub, Vercel, Neon, Google, Stripe, Discord and the domain registrar.

**Before handing it over**

- Fill every placeholder.
- Delete or keep each step tagged `[OPTIONAL]`, `[IF ACCOUNTS]`,
  `[IF PREMIUM]`, `[IF ADMIN]` or `[IF EBAY API]`.
- **Hard gate: every env var name.** List every name the code and workflows
  read, and check each one appears in the prompt or is deliberately left out
  (a default that is right for this site):
  `grep -rhoE 'process\.env\.[A-Z0-9_]+' src scripts | sort -u` and
  `grep -rhoE '(secrets|vars)\.[A-Z0-9_]+' .github | sort -u`.
  Do not hand over until the lists match.
- Check every route, workflow name and quoted UI or log string against the new
  repo, because the template quotes OP Compare's:
  - `grep -h '^name:' .github/workflows/*.yml` (Import prices, Stripe setup,
    Production deploy, Search Console, IndexNow submit);
  - `find src/app -name route.ts` (`/api/auth/oauth/[provider]/callback`,
    `/api/stripe/webhook`, `/indexnow.txt`), and `ls public/icon-512.png`;
  - `grep -n 'WEBHOOK MISSING\|all six events' scripts/stripe-setup.ts`;
  - the `/account` text " (owner account)" and the welcome page's
    "You're <tier>!".
- Set `NEXT_PUBLIC_CONTACT_EMAIL` in step 3.2, or fix the default in
  `src/lib/site.ts`: OP Compare's falls back to RiftCompare's public address,
  and `src/lib/scrape.ts` sends it as `From:` to every store.

**Inputs**

| Placeholder | OP Compare value | Notes |
|---|---|---|
| `{SITE_NAME}` | OP Compare | Shown on the consent screen and in Stripe, GA4 and Discord |
| `{GAME}` | One Piece Card Game | |
| `{DOMAIN}` | opcompare.app | Apex. Canonical, no `www`. |
| `{REPO}` | Specifxx/OpCompare | |
| `{BRANCH}` | claude/tender-noether-2na98p | `main` is created from it |
| `{SLUG}` | opcompare | Used for the Neon and Vercel project names, Stripe `metadata.site`, and lookup keys `{SLUG}_<tier>_<interval>` |
| `{SHORT_PREFIX}` | oc | Used for EPN `customid`, Impact `sharedid` and the `{SHORT_PREFIX}_auth` cookie. For the next site, not `rc`, `pkmn`, `oc`, `op` or `tcge` (see prompt 1). |
| `{RIFT_REPO}` | Specifxx/TCGEmpire | |
| `{SISTER_SITES}` | RiftCompare (riftcompare.com, Specifxx/TCGEmpire) | For the third site, add OP Compare (opcompare.app, Specifxx/OpCompare) |
| `{DESCRIPTOR}` | OPCOMPARE | Stripe statement descriptor, 5–22 characters |
| `{BRAND_COLOR}` | #d92b33 | |
| `{CONTACT_EMAIL}` | the site's own public contact address | Shown on the contact page and sent as `From:` to stores. Never RiftCompare's, never the owner's personal address unless he says so. |
| `{PRICES}` | Plus $2.99/month and $23.99/year; Premium $4.99/month and $39.99/year | Must match `PLAN_CENTS` in `src/lib/plans.ts` |
| `{CARDS}`, `{SEALED}`, `{STORES}` | ~7,300 · ~420 · ~235 | From the last full local import |
| `{IMPORT_TIME}` | 10 to 20 min | 6 minutes locally with a cached TCGCSV. GitHub runs uncached and adds `npm ci`. |
| `{INDEXNOW_KEY}` | 43ac93dd97a44d4894bedf52d621c57c | Public, reused on purpose |

**The prompt** (paste the part between the `---` lines)

````markdown
# Claude in Chrome — {SITE_NAME} setup prompt

Paste everything between the lines into Claude in Chrome. Before you do, log in
to:
- GitHub, Vercel, Neon, Google (Cloud Console, Analytics and Search Console),
  Stripe and Discord, using the same accounts as RiftCompare;
- the registrar of **{DOMAIN}**.

---

You are setting up the production infrastructure for **{SITE_NAME}**, a {GAME}
price-comparison website at **https://{DOMAIN}**. Its code is finished in the
GitHub repo **{REPO}** (branch `{BRANCH}`). It is a sister site of RiftCompare
(repo {RIFT_REPO}, site riftcompare.com). It must get its **own** of each of
these:
- Neon database
- Vercel project
- Google sign-in client and Discord app            [IF ACCOUNTS]
- Stripe account                                   [IF PREMIUM]
- Google Analytics property
- Search Console property

**The domain is `{DOMAIN}`. I already own it.** Use exactly
`https://{DOMAIN}` (no `www`, no trailing slash) wherever a site URL is asked
for. If the domain's TLD is HTTPS-only (`.app`, `.dev`, `.page` and others on
the HSTS preload list), the site won't load until Vercel has issued its
certificate. That takes a few minutes after the DNS is right, and it's normal.

Ground rules:
- **Every existing sister site is read-only:** {SISTER_SITES}. Never change,
  delete or rotate anything of theirs:
  - their Vercel projects
  - their GitHub repos or secrets
  - their Neon projects
  - their Stripe accounts
  - their Google Cloud projects or OAuth clients
  - their GA or GSC properties
  - their domains' DNS

  You may only READ values from them where a step says so.
- **Do not change {REPO}'s visibility.** It must stay public: the site reads
  its price history from raw.githubusercontent.com without a token, and a
  private repo breaks every chart.
- **No money, no guesses.** Do not buy anything (domains, paid plans) and do not
  add a payment method. If a step needs money, legal or business details I
  haven't given (for example Stripe's activation form), or a decision, stop and
  ask me.
- **Ask before deleting DNS.** Never delete an existing DNS record on
  {DOMAIN} without asking me first.
- **Keep secrets in their fields.** Never paste secret values into chat, issues
  or commit messages. Only put them in the secret or env-var fields named below.
- **Track and report.** Keep a running checklist. Finish with a summary of what
  you did, every value you set (secrets shown only as "set") and anything left.

**Random secrets:** whenever a step says "generate a random secret", open
https://www.random.org/strings/?num=3&len=20&digits=on&upperalpha=on&loweralpha=on&unique=on&format=plain&rnd=new
and join the three lines into one 60-character string. Use a fresh one each
time. (If I paste you secrets I generated myself, use those instead.) You need
these:
- `CRON_SECRET`
- `AUTH_SECRET`                                    [IF ACCOUNTS]
- `ADMIN_TOKEN`                                    [OPTIONAL][IF ADMIN]

**Every Vercel environment-variable change only takes effect after a new
production deployment.** Pushes don't build production here; GitHub → Actions →
**Production deploy** → Run workflow does.

**Order.** The site goes live first (steps 1–5), so that Google, Discord and
Stripe can see a working website, privacy policy and logo when they ask for
them (steps 6–8).

## 1. Neon — new database
1. Open https://console.neon.tech and create a **new project** `{SLUG}`:
   - Postgres 16 or newest
   - region **AWS US East (N. Virginia)**
   - free plan (0.5 GB storage; the local database was about 245 MB after 13
     imports, so watch it)
2. Copy the **pooled** connection string (Connect → "Pooled connection" on; it
   contains `-pooler` and ends with `?sslmode=require`). This is `DATABASE_URL`.

## 2. GitHub — {REPO}
1. **Create `main`.** Code → branches → New branch `main`, source
   `{BRANCH}`. Note the commit `main` was created from (for the report). Then
   Settings → General → Default branch → `main`. Do not add branch protection
   to `main`: the daily release pushes to it.
2. **Workflow permissions.** Settings → Actions → General → Workflow
   permissions → **Read and write permissions** → Save. The daily release pushes
   to `main`, and the import pushes price history to a `data` branch that it
   creates itself.
3. **Secrets.** Settings → Secrets and variables → Actions → **Secrets**:
   - `DATABASE_URL` = the Neon pooled string
   - `CRON_SECRET` = a random secret (keep it for step 3)
   - `GSC_SA_KEY` = added in step 9
   - `STRIPE_SECRET_KEY` = added in step 8           [IF PREMIUM]
4. **Variables.** Same page → **Variables**:
   - `SITE_URL` = `https://{DOMAIN}`
   - `GSC_PROPERTY` = `sc-domain:{DOMAIN}`
   - `INDEXNOW_KEY` = `{INDEXNOW_KEY}` (RiftCompare's public IndexNow key,
     reused on purpose)

## 3. Vercel — new project and the domain
1. **Create the project.** https://vercel.com/new → import **{REPO}** in the
   same team as RiftCompare. Project name `{SLUG}`, framework Next.js, defaults
   otherwise.
2. **Environment variables.** Settings → Environment Variables, for
   **Production and Preview**:
   - `DATABASE_URL` = the Neon pooled string
   - `CRON_SECRET` = the same value as GitHub's
   - `AUTH_SECRET` = a NEW random secret (never another site's)   [IF ACCOUNTS]
   - `NEXT_PUBLIC_SITE_URL` = `https://{DOMAIN}`
   - `NEXT_PUBLIC_CONTACT_EMAIL` = `{CONTACT_EMAIL}` (required: without it the
     site and its store scraper identify themselves with RiftCompare's address)
   - `INDEXNOW_KEY` = `{INDEXNOW_KEY}`
   - `ADMIN_EMAILS` = my email address. Ask me which one; it is the account
     treated as admin and as Premium for free. If I name more than one admin,
     list them all comma-separated: this value replaces the code's built-in
     admin list, so it must include every admin, me included.  [IF ACCOUNTS]
   - `ADMIN_TOKEN` = a NEW random secret of at least 32 characters, for admin
     scripts only (Production only).                [OPTIONAL][IF ADMIN]

   [OPTIONAL] Then copy these from RiftCompare's Vercel project, but only the
   ones it has. Read the values there and change nothing:
   - `EBAY_AFFILIATE_CAMPAIGN`
   - `TCGPLAYER_IMPACT_LINK`
   - `NEXT_PUBLIC_USD_TO_AUD`, `NEXT_PUBLIC_USD_TO_GBP`,
     `NEXT_PUBLIC_USD_TO_SGD`, `NEXT_PUBLIC_USD_TO_CAD`,
     `NEXT_PUBLIC_USD_TO_EUR`

   Do NOT copy any of these: `EBAY_CLIENT_*`, `RM*`, `RH*`,
   `HISTORY_DATABASE_URL*`, `AUTH_SECRET`, `ADMIN_TOKEN`, `STRIPE_*`,
   `*_PRICE_ID`, Google or Discord OAuth, Resend, Brevo, AdSense.
3. **Production branch.** Settings → Git → Production Branch = **`main`**.
4. **Domains.** Settings → Domains → add **`{DOMAIN}`**, then
   **`www.{DOMAIN}`** set to **redirect to `{DOMAIN}`** (308).
5. **DNS.**
   - If `{DOMAIN}` appears on the team's **Domains** page (bought through
     Vercel or on Vercel nameservers), Vercel configures it. Wait for
     **Valid Configuration**.
   - Otherwise:
     1. Find the registrar at
        https://lookup.icann.org/en/lookup?name={DOMAIN}.
     2. Add **exactly the records Vercel shows**: an A record on `@` and a
        CNAME on `www`. Don't change nameservers. Ask me before removing a
        conflicting record, such as a parking page.
     3. If you can't access the registrar, stop and tell me which one it is.

   Wait for Valid Configuration and certificates on both names.
6. **"Build skipped" is normal.** Production builds only for commits whose
   subject contains `[deploy]`. Leave those messages alone; step 5 deploys.

## 4. Load the data
GitHub → Actions → **Import prices** → Run workflow (branch main, defaults).
It does three things:
- creates the tables;
- imports {CARDS} cards, {SEALED} sealed products and prices from {STORES}
  stores;
- creates the `data` branch, where the price history is published.

Wait for green ({IMPORT_TIME}). If it fails, open the log and report the error
to me. Then note the database size Neon shows for the project (Monitoring or
the project dashboard) for the report.

## 5. First production deploy
1. GitHub → Actions → **Production deploy** → Run workflow (branch main).
2. In Vercel → Deployments, wait for the production deployment to be
   **Ready**. Then open **https://{DOMAIN}** and check:
   - the homepage shows card counts and prices; `/browse` lists cards; a card
     page shows a price table;
   - `/privacy` and `/terms` load (Google and Stripe will link to them);
   - `/sitemap.xml` loads and its URLs start with `https://{DOMAIN}/`;
   - `/indexnow.txt` shows the key;
   - `https://www.{DOMAIN}` redirects to `https://{DOMAIN}`;
   - `/premium` says "Opening soon" for now; that is expected until step 8.
                                                                      [IF PREMIUM]

## 6. Google sign-in — a new OAuth client                    [IF ACCOUNTS]
1. **Project.** https://console.cloud.google.com → project picker → **New
   project** "{SITE_NAME}". Make sure it is selected.
2. **Consent screen.** APIs & Services → **OAuth consent screen** (Google Auth
   Platform):
   - App name "{SITE_NAME}"; user support email and developer contact = my
     email (same as ADMIN_EMAILS)
   - Audience **External**
   - Authorized domain `{DOMAIN}`
   - Home page `https://{DOMAIN}`, privacy policy `https://{DOMAIN}/privacy`,
     terms `https://{DOMAIN}/terms` (live since step 5)
   - Data access / scopes: `openid`, `.../auth/userinfo.email`,
     `.../auth/userinfo.profile`
   - Then **Publish app** (In production). These basic scopes need no Google
     review. If Google asks to verify ownership of {DOMAIN}, do step 9.2
     (Search Console) first and come back. If it asks for verification
     anyway, tell me and continue.
3. **Client.** **Clients / Credentials → Create OAuth client → Web
   application** "{SITE_NAME} web":
   - Authorized JavaScript origin: `https://{DOMAIN}`
   - Authorized redirect URI: `https://{DOMAIN}/api/auth/oauth/google/callback`
4. **Vercel.** Copy the client ID and secret into Vercel as
   `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (Production and Preview).

(Only if creating a project is impossible: RiftCompare's existing client could
take that redirect URI too, but its sign-in screen would say "RiftCompare".
Ask me before touching it.)

## 7. Discord sign-in (optional, recommended)          [OPTIONAL][IF ACCOUNTS]
1. https://discord.com/developers/applications → **New Application**
   "{SITE_NAME}", with the logo from https://{DOMAIN}/icon-512.png.
2. OAuth2 → Redirects → add `https://{DOMAIN}/api/auth/oauth/discord/callback`
   → Save.
3. Copy the Client ID and (Reset) Client Secret into Vercel as
   `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`.

## 8. Stripe — a separate account for {SITE_NAME}            [IF PREMIUM]
1. **Separate account.** https://dashboard.stripe.com → account switcher (top
   left) → **New account** named "{SITE_NAME}". It must NOT be RiftCompare's
   account (RiftCompare matches every subscription in its account to its own
   users by email) or any other sister site's.
2. **Activate payments.**
   - Use the same business details as RiftCompare's account where Stripe offers
     to copy them.
   - Public business name **{SITE_NAME}**; statement descriptor
     **{DESCRIPTOR}**; website `https://{DOMAIN}` (live since step 5); support
     email = my email.
   - If Stripe needs anything else (identity, bank account, tax details), stop
     and ask me.
3. **Branding and receipts.**
   - Settings → Branding: the logo from https://{DOMAIN}/icon-512.png, brand
     colour `{BRAND_COLOR}`.
   - Settings → Customer emails: turn on **successful payments** receipts.
4. **Secret key.** Developers → API keys → reveal the **live secret key**
   (`sk_live_…`). Put it in:
   - the Vercel env var `STRIPE_SECRET_KEY` (Production and Preview)
   - the GitHub secret `STRIPE_SECRET_KEY`
5. **Create products and prices.** GitHub → Actions → **Stripe setup** → Run
   workflow (branch main). Wait for green. Its log lists:
   - the two products ({SITE_NAME} Plus, {SITE_NAME} Premium)
   - four prices: {PRICES}
   - the portal configuration

   It ends with "WEBHOOK MISSING", which is expected at this point.
6. **Webhook.** Stripe → Developers → Webhooks → **Add endpoint**:
   - URL `https://{DOMAIN}/api/stripe/webhook`
   - events, exactly these six:
     - `checkout.session.completed`
     - `checkout.session.async_payment_succeeded`
     - `invoice.paid`
     - `invoice.payment_succeeded`
     - `customer.subscription.created`
     - `customer.subscription.updated`

   Reveal the **Signing secret** (`whsec_…`) and put it in Vercel as
   `STRIPE_WEBHOOK_SECRET` (Production).
7. **Check.** Run **Stripe setup** once more. The log should now end with
   "all six events subscribed".
8. **Redeploy and check accounts.** GitHub → Actions → **Production deploy** →
   Run workflow, wait for **Ready**, then:
   - `/login` shows "Continue with Google" (and Discord, if set up);  [IF ACCOUNTS]
   - sign in with my Google account: it lands on `/account`, which says
     "Premium (owner account)" when ADMIN_EMAILS is my email;        [IF ACCOUNTS]
   - `/admin` loads for me and is refused for a second, non-admin account;
                                                                      [IF ADMIN]
   - `/premium` shows "Get Plus" and "Get Premium" buttons, not "Opening
     soon".                                                           [IF PREMIUM]
9. [OPTIONAL][IF PREMIUM] End-to-end payment test (ask me first). In Stripe,
   create a coupon at 100% off for one month and a promotion code `OWNERTEST`.
   1. Sign in on the site with a second Google account.
   2. On `/premium`, start Plus monthly and enter `OWNERTEST`.
   3. Confirm the welcome page says "You're Plus!" and the footer ads
      disappear.
   4. Then in Stripe: cancel that subscription immediately, and deactivate the
      promotion code and the coupon.

## 9. Google Analytics 4 and Search Console
1. **GA4.**
   1. https://analytics.google.com → Admin, in the **same account as
      RiftCompare** → Create → Property "{SITE_NAME}", with my time zone and
      currency.
   2. Add a Web data stream for `https://{DOMAIN}` with Enhanced measurement
      on.
   3. Put the Measurement ID (`G-…`) in Vercel as `NEXT_PUBLIC_GA_ID`
      (Production).
2. **Search Console property.** https://search.google.com/search-console →
   Add property → **Domain** → `{DOMAIN}`.
   1. Add the TXT record it shows on `@` wherever {DOMAIN}'s DNS lives
      (Vercel → Domains → {DOMAIN} → DNS Records, or the registrar).
   2. Click **Verify**, retrying for up to ~30 minutes.

   [OPTIONAL] Only if you cannot add DNS records: use a **URL prefix** property
   `https://{DOMAIN}/` with the **HTML tag** method instead.
   1. Put the `content` value in Vercel as `GOOGLE_SITE_VERIFICATION`
      (Production).
   2. Run Production deploy and wait for Ready, then click Verify.
   3. Set the GitHub variable `GSC_PROPERTY` to `https://{DOMAIN}/`.
3. **Service account access.** Search Console → Settings → Users and
   permissions → Add user: the service-account email (ends
   `.iam.gserviceaccount.com`) that RiftCompare's property lists as a user →
   **Full**. If RiftCompare's property lists no service account, stop and tell
   me: one has to be created first ({RIFT_REPO} `docs/OWNER-CHECKLIST.md` §3).
4. **`GSC_SA_KEY`.** Google Cloud Console → IAM & Admin → Service accounts →
   that account → Keys → Add key → JSON. Open the downloaded file in a tab and
   paste its full contents into the GitHub secret `GSC_SA_KEY`. If you can't
   open it, ask me to paste it.
5. **Sitemap.** Search Console → Sitemaps → submit
   `https://{DOMAIN}/sitemap.xml`.
6. [OPTIONAL] **Bing.** https://www.bing.com/webmasters → Add site → **Import
   from Google Search Console** → `{DOMAIN}`. Then submit the sitemap there
   too. (Only if the import is impossible: verify with the meta-tag method and
   put its value in Vercel as `BING_SITE_VERIFICATION`.)
7. **Redeploy.** Run **Production deploy** once more so the GA ID (and any
   verification tag) take effect.

## 10. Turn on the search workflows
1. GitHub → Actions → **Search Console** → Run workflow. Its summary should
   show "Sitemap submit … HTTP 204" or "200".
2. GitHub → Actions → **IndexNow submit** → Run workflow. It should report URLs
   submitted.

## 11. Affiliate housekeeping (optional — ask me before submitting forms)  [OPTIONAL]
- Impact (TCGplayer affiliate): add `https://{DOMAIN}` as a promotional property
  on the existing account.
- eBay Partner Network: nothing required ({SITE_NAME}'s clicks are tagged
  `{SHORT_PREFIX}-…`). Optionally add `https://{DOMAIN}` as a traffic source.

## 11b. eBay Browse API keyset (only if the code has its own eBay integration)  [IF EBAY API]
Do this step only if {REPO}'s `main` already contains the eBay integration and
its updated `tests/no-ebay-api.test.ts` (the code is off until the keys are
set). Never use RiftCompare's eBay keys: they would spend its quota. Ask me
before creating anything on the eBay developer portal.
1. Vercel (Production): `EBAY_VERIFICATION_TOKEN` = a NEW random 32–80
   character string (letters, digits, `_` and `-`); `EBAY_DELETION_ENDPOINT` =
   `https://{DOMAIN}/api/ebay/marketplace-deletion` (apex, no trailing slash).
   Run **Production deploy** and wait for Ready.
2. eBay developer portal → the {SITE_NAME} app → Alerts & Notifications →
   Marketplace account deletion: the same endpoint URL and token → Save → send
   a test notification. (eBay issues Production keys only after this answers.)
3. GitHub secrets: `EBAY_CLIENT_ID` (App ID) and `EBAY_CLIENT_SECRET` (Cert ID)
   of the **Production** keyset. Never put these two in Vercel.
4. [OPTIONAL] GitHub variables, only if I ask to change the defaults:
   `EBAY_QUOTA_RESERVE` (calls left unspent each day; default 600),
   `EBAY_MAX_CALLS` (per-run cap; default 2200), `EBAY_MIN_VALUE_CENTS`
   (cheapest card worth searching, in USD cents; check the code's default).

## 12. Report
Give me:
- the live URL, and whether `www` redirects;
- the commit `main` was created from;
- the repo's visibility (it must be public);
- the Neon project name, region, and its storage used after the first import;
- every GitHub secret and variable, and every Vercel env var (names only);
- the Google OAuth project and client name, and whether the consent screen is
  in production;
- the Discord app name;
- the Stripe account name, the products and prices created, the webhook URL and
  its event count;
- the GA4 measurement ID;
- the GSC property, its verification status, and whether Bing is set up;
- the results of the Import / Stripe setup / Production deploy / Search
  Console / IndexNow runs, and of the sign-in test;
- anything you could not finish, and why;
- a reminder that `buy_click` must be marked as a GA4 key event once it shows
  up under Admin → Events (it appears only after real clicks).

---
````

**After go-live** (paste into the build session once `main` exists;
`{MAIN_BASE_COMMIT}` is the commit the Chrome report says `main` was created
from):

````text
{REPO}'s `main` now exists (created from {MAIN_BASE_COMMIT}). From now on, land each finished and verified change on `main`, by PR or fast-forward from {BRANCH}, with a plain commit subject (never [deploy] unless I say a release is urgent). List every commit on {BRANCH} that is not on `main` (`git log main..{BRANCH} --oneline`), say which are verified, and land those. After the next 08:00 UTC release, confirm on https://{DOMAIN} that each landed change is live. Don't add branch protection to `main`; the release workflow pushes to it.
````

**How it went for OP Compare.**

- **Right: the owner asked for exactly this.** He asked three times: "give me
  a claude chrome extension prompt", "I really don't want to set it up", and
  "get everything set up via stripe for the chrome extension too".
- **Right: one file, kept with the code.** The prompt was committed in the
  repo (`9648da6`) and rewritten as the build changed: the domain in
  `2b6f0cd`, then OAuth, Stripe and the `data` branch in `d71528b`.
- **Right: the Launch Kit.** The prompt was also published in a private Launch
  Kit page with Copy buttons. A script cut the page from the repo file, so the
  two could not drift.
- **Right: the stop rules.** The ground rules stop before money, legal or
  business details, or any DNS deletion.
- **Not yet tested.** As of 11:30 UTC on 2026-10-03 the prompt had never been
  run. `main` did not exist yet (it was at `d71528b` by 13:15) and `opcompare.app` returned Vercel
  `DEPLOYMENT_NOT_FOUND`. None of the UI paths (Neon, Google Auth Platform,
  the Stripe account switcher, Vercel Domains) have been checked against the
  current UIs.
- **Wrong: the order.** OP Compare's prompt published the Google consent
  screen and activated Stripe, with the site's URL, privacy page and logo,
  before the first production deploy, while the domain still served
  `DEPLOYMENT_NOT_FOUND`. The template now deploys first (steps 4–5).
- **Wrong: the owner used the wrong secret name.** He said `GA_SA_KEY` for
  `GSC_SA_KEY`. The template uses the real name. Always map the owner's words
  to the real variable names.
- **Wrong: work after the prompt was written.** The admin, share-image and eBay
  work started after the prompt was committed. Anything on the build branch
  after `main` is created rides no release until merged, hence the "After
  go-live" block.
- **Gaps the template adds that OP Compare's prompt lacked:**
  - every sister site is read-only, not only RiftCompare;
  - the repo's visibility must not change;
  - a stop if RiftCompare's Search Console property has no service account;
  - "every env change needs a Production deploy run";
  - `ADMIN_EMAILS` replaces any built-in admin list;
  - `NEXT_PUBLIC_CONTACT_EMAIL` is required, and `ADMIN_TOKEN` is optional;
  - locally generated secrets may be pasted in;
  - the GA4 `buy_click` key event is reported as a leftover;
  - an optional eBay keyset step.
- **Still not covered:** OP Compare's `vercel.json` lacks RiftCompare's
  `claude/*` preview opt-out. Fix that in code; the go-live prompt cannot.

---

## 6. Launch-post brief

**When to use it.** Use it at the very end, after go-live, so every number
matches the live site.

**When to post.** Wait at least seven days after the first production import.
Before then:

- the "moved this week" sort and `/movers` are empty, because they need a
  price 7–11 days old;
- card charts need two days of history.

**Inputs**

| Placeholder | Example | Notes |
|---|---|---|
| `{SITE_NAME}`, `{DOMAIN}`, `{GAME}` | | |
| `{VOICE}` | "a proud team launch: we made RiftCompare as an MVP, took the learnings and applied them to {GAME}, so it's more complete; keen for feedback" | **Ask the owner.** It is his call. |
| `{FOCUS}` | the price guide | The "heart of it" |
| `{COMMUNITIES}` | r/OnePieceTCG, r/OnePieceTCGFinance | A starting list. The agent researches more. |
| `{STYLE_RULES}` | personal, sounds human, no hyphens or dashes anywhere | Exactly as the owner put them |
| `{URL_POLICY}` | link the homepage only, because `/price-guide` contains a hyphen | Decide whether URLs are exempt from a no-hyphen rule |
| `{KNOWN_GAPS}` | thin markets, shipping not included | |

**The prompt**

````text
Write a launch post for {SITE_NAME} (https://{DOMAIN}), a free {GAME} price-comparison site, for {COMMUNITIES}. Draft only; the owner posts it.

Voice: {VOICE}. Personal and human, written like a player talking to other players, not marketing copy (no "game-changer", "seamless", "we're thrilled to announce"). Main focus: {FOCUS}. Style rules: {STYLE_RULES}. URLs: {URL_POLICY}.

1. Research the communities first: for each subreddit, open the subreddit itself (not a third-party summary) and read its rules and sidebar on self-promotion, link posts and flair. Note member counts with where you read them. Suggest any other community that fits, and say which to skip and why.
2. Every number and claim in the post must match the LIVE site and data as of today. Get each one from the database, the code or the live pages (stores per market, printings, how often prices refresh, what is free, what is gated) and list each claim with its source in a table after the draft. Don't claim a feature that has no data yet (week-on-week movers need a week of history; charts need two days).
3. Content: what the site is and who it's for, why we built it, what makes {FOCUS} useful (be concrete), one honest line on what we skip and why (with a real example), known gaps ({KNOWN_GAPS}), and a specific feedback ask (wrong printing, missing local shop, wishes). Short paragraphs, no bullet lists, under 450 words, with a title under 300 characters. End with a friendly sign-off that fits the game.
4. Check the banned characters with a script that FAILS CLOSED, not by eye and not with grep: save the title and body to a UTF-8 file and run the Python check below; it must print 0 and exit 0. Re-run it after every edit.
5. Check the link preview of every URL in the post (fetch the page's og:image and look at it). If it does not show {FOCUS}, say so.
6. Output: the subreddit table (rules, flair to use, best time to post if the rules say), the title, the body, the claims table, and anything the owner must decide.
````

**The banned-character check.** It exits 1 on any hit. It catches every
Unicode dash (category `Pd`) plus the soft hyphen and the minus sign. Tested:
the final OP Compare post gives `0 hyphen/dash characters, 409 words` and exit
0, and a test string with two dashes gives exit 1.

```python
#!/usr/bin/env python3
"""Fail (exit 1) if a launch post contains any hyphen or dash character."""
import sys, unicodedata
EXTRA = {"­", "−"}  # soft hyphen (Cf), minus sign (Sm): not in category Pd
text = open(sys.argv[1], encoding="utf-8").read()
hits = [(i, c) for i, c in enumerate(text) if unicodedata.category(c) == "Pd" or c in EXTRA]
for i, c in hits[:20]:
    print(f"U+{ord(c):04X} at {i}: …{text[max(0, i - 20):i + 20]!r}…")
print(f"{len(hits)} hyphen/dash characters, {len(text.split())} words")
sys.exit(1 if hits else 0)
```

Run it as `python3 check_dashes.py post.md`. For other banned characters, add
them to `EXTRA`. Example: `"’"` if the owner wants straight apostrophes
only.

**How it went for OP Compare.**

- **Wrong: the first dash check passed by mistake.** It was
  `grep -nP "[-\x{2010}-\x{2015}\x{2212}]" reddit.md && echo "HYPHENS FOUND" || echo "no hyphens or dashes"`.
  Under a non-UTF-8 locale grep rejected the pattern ("character code point
  value … too large"), and the `||` branch printed the pass message. The
  session caught this and re-checked in Python: 0 dashes, 417 words. Use only
  the fail-closed script above.
- **Wrong: the voice.** The first draft was a solo "I made a free One Piece
  price guide…". The owner wanted a proud team "we just launched", with
  RiftCompare as the MVP. The rewrite came 10 minutes later: 409 words, 0
  dashes. That is why `{VOICE}` is an input you must ask for.
- **Wrong: the subreddit research was thin.** It was one web search, and its
  "124k members" for r/OnePieceTCG came from a third-party summary. Neither
  subreddit's self-promotion rules were read, and Reddit itself was never
  opened. Step 1 of the prompt now requires opening the subreddits.
- **Wrong: a claim made before its data exists.** The post claimed "sort … by
  how much it moved this week", which is empty for the first seven days
  (`src/lib/history.ts` needs a price 7–11 days old). Step 2 now demands a
  claims table with a source for each claim.
- **Wrong: the link preview.** The post was handed over at 10:48 and rewritten
  at 10:55. The owner asked for new price-guide share images only afterwards
  (11:07, U15). That work started at about 11:10 and was still uncommitted at
  13:00. Check the homepage's link preview before posting; step 5 now does.
- **Right: the content held up.**
  - Concrete numbers: 235 shops, over 7,000 printings, twice a day.
  - An honest skip example: "Shanks Manga".
  - Known gaps stated up front: Singapore is thin, shipping is not included.
  - A specific feedback ask.
- **Right: the Launch Kit.** The post went into the private Launch Kit page.
  When the post was rewritten, the page was republished in place, so the link
  stayed the same.
- **For next time:** keep the post text in the repo or the build log, not only
  in the scratchpad. (The final post is preserved in OP-COMPARE-BUILD-LOG.md,
  Appendix A.)

---

## 7. Appendix: parallel QA verifier prompts

**When to use it.** Use it after a large feature lands, such as admin pages,
share images or Premium. One agent builds once, then several verifiers each
attack one angle on their own server. Prompt 8 covers the phases before this
(Map, Spec, Implement).

**Source.** This is generalised from the Build and Verify phases of the
`admin-parity-and-thumbnails` workflow, started at 11:10 UTC (`wxmugv6yh`).
The session usage limit stopped it at 11:36:37 with 10 of 16 agents failed; it
was resumed at 12:22:34 (`wbnfgz2t4`). At about 13:08 it was still running, in
its Fix phase. Its output is uncommitted in OP Compare's working tree and its
verifier findings were never read, so its results are unverified. The prompts
themselves encode the session's QA lessons.

**Inputs**

| Placeholder | Notes |
|---|---|
| `{REPO_DIR}` | The sister repo |
| `{RIFT_DIR}` | RiftCompare |
| `{WS}` | A scratch workspace outside the repo, e.g. {SCRATCHPAD}/admin-og |
| `{AUTH_COOKIE}`, `{AUTH_HINT_COOKIE}` | e.g. `oc_session`, `oc_auth` |
| `{PORT}` | One per verifier: 3101, 3102, and so on. Never 3000. |
| `{BROWSE_HOST}` | `localhost`, or the container's own IP if Playwright can't reach localhost through the proxy (see the server rule) |

**Build (one agent only)**

````text
Task: integration build (you are the ONLY agent allowed to build now). In {REPO_DIR}: run "npx prisma db push --skip-generate && npx prisma generate", "npm run typecheck", "npm run lint", "npm test", then "npx next build" (capture to {WS}/build.log). If anything fails, fix the smallest thing that makes it pass and say exactly what you changed.
Then prepare QA identities WITHOUT printing tokens: write {WS}/qa-users.ts (run it from the repo root with "set -a; . ./.env; set +a; npx tsx <copy-in-repo-root>.ts", deleting the copy afterwards; module resolution needs the repo root) that upserts qa-free, qa-plus, qa-premium and qa-admin users (emails qa-<k>@example.com), and signs session tokens with the app's own secret from .env the same way the app does; write them to {WS}/qa-tokens.json. Cookie names: {AUTH_COOKIE}=<token> and {AUTH_HINT_COOKIE}=1.
Report: build result, routes added, and the command each verifier uses to start its own server: "cd {REPO_DIR} && npx next start -p <PORT>".
````

**Shared server rule (append to every verifier)**

````text
Start your own server: "cd {REPO_DIR} && npx next start -p {PORT}" with run_in_background, wait until http://localhost:{PORT}/robots.txt answers, and STOP it when you finish (kill that process only; find its PID with "ss -ltnp | grep :{PORT}"; never pkill/pgrep patterns that could match your own shell). Use the QA cookies in {WS}/qa-tokens.json without printing them. For Playwright: first try http://localhost:{PORT} directly. If the browser cannot reach it (in the 2026-10-03 cloud sandbox, localhost answered 405 through the egress proxy), find the container's own IP with "hostname -I", launch chromium with proxy {server: process.env.HTTPS_PROXY, bypass: '<that IP>'} and --ignore-certificate-errors, and browse http://<that IP>:{PORT} ({BROWSE_HOST}). Save screenshots to absolute paths under {WS}/. Report issues with evidence (commands, HTTP codes, screenshot paths) as {severity, where, problem, evidence, fix}. Do not fix code yourself.
````

**Verifier angles.** Write one prompt per angle and adapt it to the feature.

- **Security.** Request every gated page and API route as each of: anonymous,
  free, plus, premium, admin, and a wrong bearer token. Only the right tier may
  succeed.
  - Try state-changing routes with GET, cross-origin `Origin` headers,
    malformed and huge bodies, and other users' ids.
  - Try the public forms that feed admin queues for spam and abuse (honeypot,
    throttle, length caps, HTML rendered back in admin pages).
  - Check that admin pages are noindex, disallowed in robots and absent from
    the sitemap.
- **Parity.** Compare with RiftCompare's implementation (`{RIFT_DIR}/...`) and
  the spec. Cross-check every number shown against the local DB.
- **Functional.** Exercise every control end to end as the right QA user and
  confirm the effect, for example via `/api/me`. Take screenshots at 1440 px
  and 390 px and LOOK at them. Restore anything changed.
- **Visual (share images).** Fetch every OG image and look at each one. Check:
  - it is legible at 50% size (render a 600×315 downscale);
  - key content sits inside the central safe area;
  - the brand fonts actually loaded;
  - real data is shown and nothing is clipped.
- **Technical (share metadata).** Every page needs absolute https `og:*` and
  `twitter:*` tags. Each image must be 1200×630 PNG, under 1 MB, load in under
  about 3 s warm, and fall back cleanly for a missing slug.

**Lessons these encode, all from OP Compare:**

- Build once.
- Give each verifier its own port. `pkill` patterns killed the wrong process.
- Localhost was unreachable through that sandbox's proxy, so the session used
  the container's IP (`192.0.2.2` there) with a proxy bypass. Check before
  assuming either.
- Mint QA sessions from the repo root.
- Verifiers report and do not fix.
- Apply fixes one track at a time.

**Workflow-script pitfalls** (when these prompts run inside a workflow script):

- No backticks inside a JavaScript template-literal prompt. One unescaped
  backtick failed the documentation workflow with "Script parse error:
  Unexpected token (24:139)" at 10:52.
- To resume after a usage limit, the script path must be one the tool can
  read. Resuming with paths under `~/.claude/projects/-home-user-OpCompare/…`
  was refused four times at 12:22 ("scriptPath must be a script path this tool
  returned, or a file you can already read"). Copying the scripts into the
  scratchpad and passing that path with `resumeFromRunId` worked; finished
  agents replayed from cache.
- A usage limit can end a workflow with partial results while its
  notification still says "completed". Read the result for `null` phases
  before trusting it.

---

## 8. Port a RiftCompare subsystem: Map, Spec, Implement

**When to use it.** Use it for a RiftCompare system with several separable
areas, such as admin, or for two independent features that must land together
without two agents editing the same files. It runs as a workflow: parallel
mappers, one spec writer, then implementers with disjoint file ownership, then
prompt 7's single build and verifiers, then sequential fixes.

**Inputs**

| Placeholder | Example | Notes |
|---|---|---|
| `{RIFT_DIR}`, `{REPO_DIR}`, `{WS}` | | `{WS}` outside any repo |
| `{SITE_NAME}`, `{GAME}`, `{DOMAIN}` | | |
| `{SUBSYSTEM}` | RiftCompare's admin tools | |
| `{AREAS}` | auth-landing, accounts-billing, data-health, user-feedback, other | One mapper per area. Each mapper gets one `{AREA}` and its `{AREA_PATHS_AND_QUESTIONS}`: the RiftCompare paths to read and what to answer (OP Compare's are listed below). |
| `{MAP_RESULTS}` | | The mappers' structured output, pasted into the spec prompt as JSON |
| `{SHARE_IMAGE_HERO}` | "the price guide, with real top cards and prices" | From prompt 1 |
| `{WHAT_SITE_HAS}` | "Google/Discord OAuth, Plus/Premium via Stripe, ImportRun with per-store results in JSON, no email sending, no decks" | So mappers can judge fit |
| `{ADMIN_EMAILS}` | the owner's address | Fill in only in the live session |
| `{OWN_A}`, `{OWN_B}` | see below | Disjoint file lists for the two implementers |

**Shared context (prepend to every agent).** It states the repo, RiftCompare
as read-only, the site's CLAUDE.md rules, what the site already has, and:

````text
Rules: Do NOT run git commands that change state (no commit/checkout/reset/stash/push). Never touch {RIFT_DIR}. Do NOT run "next build", "next dev" or "next start" unless your task explicitly says so: one integration build is shared, and concurrent builds corrupt .next. Never print or write secret values. Write working notes under {WS}/.
````

**Map (one agent per area, structured output).** Require this schema for
every item: `name`, `riftcompareFiles`, `whatItDoes`, `dataModels`,
`authCheck` (exactly how access is checked: session admin, `ADMIN_TOKEN`,
CSRF), `publicSurface` (non-admin UI that feeds it, and its anti-abuse
measures), `dependsOn`, `opCompareFit` (`port` | `adapt` | `skip`) and
`reason`.

````text
Task: map {SUBSYSTEM} area "{AREA}" for porting to {SITE_NAME}. {AREA_PATHS_AND_QUESTIONS}
For every item, say whether {SITE_NAME} should port it as-is, adapt it, or skip it, given what {SITE_NAME} has: {WHAT_SITE_HAS}. Default to skip, with a reason, for anything that depends on a system {SITE_NAME} lacks, unless it is cheap and useful.
````

OP Compare's five areas: auth-landing (the admin list, how `isAdmin` flows
through auth, every place admin status changes behaviour, the dashboard, how
`/api/admin/*` authenticates, robots and sitemap treatment); accounts-billing
(accounts, premium, subscriptions, grant/revoke, reconcile); data-health
(store health, clicks, rising, demand); user-feedback (support, messages,
price reports, store suggestions, and the public forms that feed them);
other (consulting, decks, loyalty, partners, win-back).

**Design brief (in parallel with Map, for share images).**

````text
Task: audit {SITE_NAME}'s link thumbnails (Open Graph / Twitter / Reddit / Discord previews). The owner wants them to feature {SHARE_IMAGE_HERO}.
1. Read every opengraph-image / twitter-image route in {REPO_DIR}/src/app and how metadata sets openGraph/twitter. List which pages have their own image, which fall back to the default, and which tags Next emits.
2. Read the hero page and its components, the theme (tailwind config, globals.css), the logo component, and the cached loaders and image helpers that can supply real data.
3. Look at RiftCompare's share images for comparison ({RIFT_DIR}/src/app/**/opengraph-image.tsx).
4. Platform requirements: 1200×630 PNG, file size, absolute https URLs on {DOMAIN}, cropping on Reddit/Facebook/X/Discord/Slack/iMessage (keep key content in a central safe area), alt text, fonts in satori, runtime (edge vs nodejs: Prisma needs nodejs), caching, and the empty-database fallback.
Write {WS}/og-brief.md: a new default image featuring the hero with real data, a dedicated image for the hero page, images for set and sealed pages, which other pages need their own, and polish for existing images. Give exact layout (px), typography, colours, data, fallbacks, and the files to create or change.
````

**Spec (one agent, after Map).**

````text
Task: write the {SUBSYSTEM} port spec for {SITE_NAME}. The mappers produced this (JSON): {MAP_RESULTS}
Write {WS}/spec.md: the plan an implementer follows without guessing.
- Admins: {ADMIN_EMAILS} is the built-in fallback list; the ADMIN_EMAILS env var replaces it when set. Admins count as Premium.
- For every item judged port/adapt: files to create or change (respect CLAUDE.md: database access through src/lib modules, never @/lib/db from src/app), Prisma models and fields, routes (method, auth, inputs, outputs), pages (what they show, controls), tests.
- Access control: ONE helper (e.g. requireAdmin) used by EVERY admin page (redirect or 404, as RiftCompare does) and EVERY admin API route (401/403 JSON). An optional ADMIN_TOKEN bearer for API routes: fails closed when unset, constant-time compare, minimum length. State-changing routes are POST-only with a same-origin check. /admin is noindex, disallowed in robots and absent from the sitemap. The admin link shows only for admins.
- Public surfaces that feed admin queues (report a wrong price, suggest a store, feedback): a sign-in requirement or anti-abuse (honeypot, per-IP throttle with a hashed IP, length caps), mirroring RiftCompare; privacy-page wording; no email sending unless the site has a mailer.
- Reuse the site's existing UI components and theme tokens.
- List what is deliberately skipped, and why.
````

**Implement (two agents in parallel, disjoint files, no builds).** Each
implementer gets its spec and a file-ownership line. OP Compare's:

- `{OWN_A}` (admin): `prisma/schema.prisma`, `src/lib/admin*.ts` and new
  `src/lib` modules for admin and feedback, `src/app/admin/**`,
  `src/app/api/admin/**`, new public feedback routes and components,
  `src/components/NavUser.tsx`, `src/app/robots.ts`, `src/app/sitemap.ts`,
  `src/app/privacy/page.tsx`, `tests/admin*.test.ts`. Not: any
  `opengraph-image`/`twitter-image` file, `src/app/layout.tsx`, or docs.
- `{OWN_B}` (share images): every `opengraph-image.tsx`/`twitter-image.tsx`,
  `src/lib/og*` helpers, `src/app/layout.tsx` metadata only, `tests/og*.test.ts`.
  Not: the schema, admin files, robots, sitemap, NavUser, privacy, or docs.

````text
Task: implement {WS}/spec.md in {REPO_DIR}. {OWN_A}
Then run "npx prisma db push --skip-generate && npx prisma generate", "npm run typecheck", "npm run lint" and "npm test"; all must pass (fix your own code until they do). Do not build. Write a short report to {WS}/impl.md (files, models, routes, tests, anything deferred).
````

For share images, add: render each image without a Next build (a small tsx
script under `{WS}/` that calls `ImageResponse` and writes a PNG), LOOK at the
renders, and iterate at least twice.

**Then:** prompt 7's single Build agent and verifiers; a Fix agent per track,
run one after the other (each may rebuild, each re-checks its fixes on its own
port); and a single Docs agent last (README, SETUP, the Chrome prompt,
CLAUDE.md, two DECISIONS entries), as the only writer of docs.

**How it went for OP Compare.**

- **Right: the mappers' fit judgement.** The five areas were mapped before the
  usage limit (11:36) and reused from cache on the resume. The port/adapt/skip
  field with a reason made the spec's skip list mechanical.
- **Right: disjoint ownership and one build.** The two tracks wrote different
  files, and only the Build agent ran `next build`.
- **Wrong: the limit.** At 11:36:37 the workflow ended with 10 of 16 agents
  failed and `build: null`, `docs: null`, while its notification said
  "completed". It was resumed at 12:22:34 (`wbnfgz2t4`) from a copy of the
  script in the scratchpad.
- **Unverified.** At about 13:08 the resumed run was in its Fix phase. Nothing
  is committed, and the verifier findings were not read for this file. The
  admin work is uncommitted in `/home/user/OpCompare`; do not copy it from
  there (PLAYBOOK §2.1).
- **Worth knowing.** The owner's address went into the code's built-in admin
  list because he asked for it (U14). In a committed prompt use
  `{ADMIN_EMAILS}`.

---

## 9. eBay Browse port map

**When to use it.** Use it before giving a sister site its own eBay Browse
API keyset. It is read-only: it produces a port spec, it does not implement.
Implement only after any other workflow editing the repo has finished.

**Inputs**

| Placeholder | Example | Notes |
|---|---|---|
| `{RIFT_DIR}`, `{REPO_DIR}` | | Both read-only for this workflow |
| `{OUT}` | {SCRATCHPAD}/ebay | Copy the results into a repo before the session ends |
| `{SITE_NAME}`, `{MARKETS}` | OP Compare; US AU UK SG CA EU | |
| `{SITE_FACTS}` | "7,255 printings + 420 sealed; Offer table (productId, source, market, priceCents, …); matcher src/lib/match.ts; import at 07:07/19:07 UTC; affiliate customid oc-<market>-…" | What the spec must fit |
| `{OWNER_ASK}` | "a new 5000 API quota which we can split by region and allocate based on card price like riftcompare" | The owner's words |

**Map (four agents in parallel, read-only).** Each writes
`{OUT}/map-<area>.md` with file:line references:

1. **client-quota:** `src/lib/ebay.ts` (OAuth token and caching, the Browse
   search call and every query parameter, marketplace and affiliate headers),
   how the live remaining quota is read, `EBAY_QUOTA_RESERVE` /
   `EBAY_MAX_CALLS` spend logic, 429/5xx handling, timeouts.
2. **allocation:** how the 5,000/day is split by market and by card value
   (`src/lib/price-import.ts`, the refresh scripts and workflows), and how the
   Pokémon section shares the same quota. Quantify calls per run, runs per
   day, cards covered per market per day.
3. **matching-storage-ui:** query construction per card, title matching and
   exclusions, plausibility, shipping, which listing wins, how rows are
   stored and shown, and the affiliate URL per item.
4. **compliance-setup:** the marketplace-account-deletion route, API License
   and EPN display rules, the developer-portal setup order, maintenance
   scripts, auctions, and every DECISIONS entry on eBay quota incidents.

**Spec (one agent, after Map).**

````text
Task: write the port spec {OUT}/ebay-spec.md for {SITE_NAME}, from {OUT}/map-*.md. It must let an implementer build it without reopening RiftCompare. The owner asked for: {OWNER_ASK}. Site facts: {SITE_FACTS}. Cover:
1. Env vars: exact names (mirror RiftCompare's), where each is set (GitHub secret, GitHub variable or Vercel), defaults, and the rule "everything is off until EBAY_CLIENT_ID and EBAY_CLIENT_SECRET are set". Values come from the site's OWN new keyset.
2. Allocation: how 5,000/day splits across {MARKETS}; prioritising cards and sealed by value with a minimum; refresh intervals by value tier; how runs fit the existing import schedule; the reserve; the partial-run safety rule. Show the arithmetic.
3. Matching: reuse the site's matcher and plausibility on eBay titles; query construction; exclusions; storage as Offer rows with their own source; freshness.
4. UI: how eBay rows appear next to the existing eBay search link; labels; affiliate URLs with the site's sub-ids.
5. Compliance: the marketplace-deletion route, and the setup order (deletion endpoint live before production keys).
6. Files, tests (how tests/no-ebay-api.test.ts changes: the API allowed ONLY in src/lib/ebay*.ts and the deletion route), and docs (SETUP.md, the Chrome prompt's eBay section, CLAUDE.md, a DECISIONS reversal entry).
7. Risks, and what RiftCompare learned the hard way (from its DECISIONS).
````

**Challenge (one agent, after Spec).**

````text
Task: adversarially review {OUT}/ebay-spec.md against the notes in {OUT}/ and RiftCompare's code. Find anything wrong (misread code, wrong env names or defaults, arithmetic errors), missing (a RiftCompare safeguard not carried over, a quota-sharing hazard, a compliance step), or risky (a design that could exhaust the quota, misprice printings, or break the "off until configured" rule). Edit the spec directly to correct it, and append a "Review" section listing what you changed and why.
````

**How it went for OP Compare.**

- **Right: the Challenge step.** The run was stopped by the usage limit after
  Map, resumed at 12:22:09 (`wwtrchc3s`) and finished at 12:36:37. The
  challenger made 17 changes to the spec, among them: the run's wall clock was
  about 40 minutes, not 25, against a 45-minute timeout (now 60); the product
  counts were TCGCSV products, not printings; a configured but refused keyset
  now fails the run instead of staying green forever; a log line naming
  `EBAY_CLIENT_ID` in `scripts/` would have failed the rewritten guard test;
  and the smoke test would have spent about 1,600 calls without a new
  dispatch-only cap.
- **Worth knowing: a default changed.** At 11:18 the session told the owner
  `EBAY_MIN_VALUE_CENTS` defaults to 500 (US$5). The challenged spec sets 2000
  (US$20; EU uses at least 5000). Give the owner the default the code actually
  ships.
- **Not built.** No eBay code existed at 13:00. The spec and the four notes
  were only in the session scratchpad (`ebay/ebay-spec.md`, 1,385 lines), which
  is deleted when the session ends: copy them into a repo first.
