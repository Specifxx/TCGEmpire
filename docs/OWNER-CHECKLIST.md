# Owner checklist — what only you can do

Everything in `docs/MARKETING-PLAN.md` that needs a human, in the order it should
happen. Nothing here needs any coding. Written 2026-09-21.

Each step says roughly how long it takes. The first four one-off steps at the top
take about 25 minutes in total and are the highest-value 25 minutes in the whole
plan. The fifth (the Discord bot) can wait until the week before you start
emailing community sites.

---

## Part 1 — Five settings to change, once (~40 min total)

These are switches on accounts you already own. Each one turns on something that
is built, deployed and currently doing nothing.

### 1. Let the site send email again (3 min) — do this one first

Right now bulk email reaches **1 account out of 263**. Brevo is set to only
accept mail from a fixed list of IP addresses, and the site sends from Vercel,
whose IP addresses change constantly. Every other send is rejected.

1. Go to **brevo.com** and log in.
2. Click your **profile name**, top right → **Security**.
3. Find **Authorised IPs**.
4. **Turn it off.** (If it won't turn off entirely, delete every IP in the list.)
5. Save.

That's it. The newsletter, price-drop alerts, win-back emails and the release-day
blast all start working.

### 2. Verify the site with Bing (10 min)

Bing also powers DuckDuckGo and Yahoo — usually 3–8% of search traffic. The site
has been sending Bing update pings for 84 days through a system called IndexNow,
without ever having been verified with them.

1. Go to **bing.com/webmasters** and sign in with a Microsoft account.
2. Choose **Import from Google Search Console** if it offers it — that is the
   fastest route and skips most of what follows. If it works, jump to step 6.
3. Otherwise click **Add site** and enter `https://riftcompare.com`.
4. Choose the **HTML Meta Tag** verification option. It shows you something like
   `<meta name="msvalidate.01" content="ABC123..." />`. **Copy just the long code
   between the quotes**, not the whole line.
5. Go to **vercel.com** → the RiftCompare project → **Settings** → **Environment
   Variables**. Add:
   - Name: `BING_SITE_VERIFICATION`
   - Value: the code you copied
   - Environments: tick **all three**
   Then click **Save**.
6. The code goes live on the next deploy. Once it has deployed, go back to Bing
   and click **Verify**.
7. Still in Bing, open **Sitemaps** and submit `https://riftcompare.com/sitemap.xml`.

### 3. Add the Search Console key (10 min)

There is an automatic check that watches for pages Google has stopped indexing.
It has never run because it has no key, which means indexing problems are
currently noticed by seeing traffic drop.

1. Go to **console.cloud.google.com** and sign in with the Google account that
   owns Search Console.
2. Create a project if you don't have one. Any name.
3. In the search bar at the top, type **Search Console API** and click
   **Enable**.
4. In the search bar, type **Service Accounts** → **Create Service Account**.
   Name it `riftcompare-gsc`. Click through to the end.
5. Click the service account you just made → **Keys** tab → **Add Key** →
   **Create new key** → choose **JSON** → **Create**. A file downloads.
6. Open that file in Notepad or TextEdit and **copy everything in it**.
7. Also copy the **email address** of the service account (it looks like
   `riftcompare-gsc@something.iam.gserviceaccount.com`).
8. Go to **search.google.com/search-console** → **Settings** → **Users and
   permissions** → **Add user**. Paste that email address, give it **Full**
   permission.
9. Go to **github.com/Specifxx/TCGEmpire** → **Settings** → **Secrets and
   variables** → **Actions** → **New repository secret**. Name it exactly
   `GSC_SA_KEY` and paste the whole contents of the JSON file as the value.

### 4. Tell Google Analytics that a store click matters (2 min)

Without this, the site's *best* outcome — someone searches, finds a card, clicks
through to a shop in eight seconds and leaves happy — is recorded as a bounce,
and every engagement number is wrong.

1. Go to **analytics.google.com** → the RiftCompare property.
2. Bottom left, click **Admin** (the gear).
3. Under **Data display**, click **Events**.
4. Find `buy_click` in the list.
5. Toggle **Mark as key event** on.

### 5. Switch on the Discord price bot (15 min) — before week 7

The bot (`/price` and `/movers`) is built and deployed, but nothing on the site
offers it until you give it an application. Once you do, `/embed` shows an
**Add it to your server** button, and Template 2 in `docs/OUTREACH-KIT.md` can
mention it.

1. Go to **discord.com/developers/applications**. Reuse the app the site's
   "Log in with Discord" already uses, or click **New Application** and name it
   `RiftCompare`.
2. On **General Information**, copy the **Application ID** and the **Public Key**.
3. In **Vercel** → the project → **Settings** → **Environment Variables**, add
   `DISCORD_BOT_PUBLIC_KEY` (the Public Key) and `NEXT_PUBLIC_DISCORD_APP_ID`
   (the Application ID), both for Production. They take effect at the next daily
   release; there is no need to force a deploy.
4. On the **Bot** tab, click **Reset Token** and copy it. Then, on your own
   computer in the repo folder, run
   `DISCORD_APP_ID=… DISCORD_BOT_TOKEN=… npx tsx scripts/register-discord-commands.ts`.
   It should print `Registered 2 commands`. Don't save the token anywhere.
5. Back on **General Information**, set **Interactions Endpoint URL** to
   `https://riftcompare.com/api/discord/interactions` and save. Discord checks it
   live, so do this after the release that carries the public key.
6. Install it in the **RiftCompare Discord first** and try `/price card: irelia`
   and `/movers` there before telling anyone else about it.

---

## Part 2 — The Radiance window (from 25 September)

Riftbound Radiance preview season runs **25 September to 9 October**, and the set
releases **23 October**. This is the single biggest traffic opportunity of the
quarter, because the site's #2, #3, #5 and #6 Google queries are all people
searching for exactly this.

### Before 25 September — test the importer once (5 min)

1. Go to **github.com/Specifxx/TCGEmpire** → **Actions** tab.
2. On the left, click **Maintenance**.
3. Click **Run workflow** (right-hand side).
4. In the **Task** dropdown, choose **set-pipeline**.
5. **Tick the "Dry run" box.**
6. Click the green **Run workflow**.
7. Wait a minute, then click into the run and check it didn't error.

This proves the scraper works before the first real reveal lands. Nothing is
written to the site with Dry run ticked.

### Mon / Wed / Fri during preview season — press the button (2 min each)

Exactly the same steps as above, **but leave the Dry run box unticked**.

That is what pulls each day's officially revealed Radiance cards into the site.
The spoiler tracker page and the Radiance set page then update themselves, and
Google gets pinged automatically. This is the highest-value two minutes in the
whole plan — everything else in this section depends on it.

### On the two or three biggest reveal days — post once (15 min)

When something big is revealed (a new Legend, a whole domain, the Los Angeles
qualifier opener):

1. Post in **r/Riftbound** and in the Riftbound Discords you're already in.
2. Link **riftcompare.com/blog/riftbound-radiance-spoilers** — the tracker.
   **Not** the leaked-mechanics post.
3. One sentence is enough: *"Every official Radiance reveal so far, updating live,
   with prices as they appear."*
4. Come back once to reply to comments. Then leave it.

Two or three of these across the whole two weeks. Not one every day.

---

## Part 3 — Every week, forever (about an hour)

### Friday or Saturday — paste the promo pack (10 min)

Every Friday the site emails you a ready-made post with the week's biggest price
moves, already formatted, in three versions: Reddit, X and Discord. During the
Radiance run-up it also includes the spoiler tracker automatically.

Open the email. Copy the Reddit version. Paste it in r/Riftbound. Done.

If you're not doing this already, it's the cheapest ten minutes in the plan.

### Tuesday — send one email (25 min)

One partnership email a week. This is the one channel the site has never used,
and the one both the promo kit and the outside SEO reviewer rank first.

The full templates are in **`docs/OUTREACH-KIT.md`**. The short version:

**Weeks 1–6, email stores.** Go to `riftcompare.com/admin/store-partners`. The
bottom of that page lists the biggest tracked stores nobody has contacted yet.
Pick one, click **Create report link**, copy the link, and send Template 1 with
the link pasted in. You are giving them a free report showing every card where a
rival shop beats them on price. The ask — one sentence, near the end — is that
they paste the small "Prices tracked on RiftCompare" badge waiting under their
report; it already carries their store's link, so there's nothing to edit. Open
the report link yourself before sending: if the badge isn't there (stores with
fewer than five in-stock listings don't get one), leave that sentence out.

**Weeks 7–9, email community sites.** RiftDecks, Piltover Archive, RiftMana.
Template 2. You're offering them a free widget from `riftcompare.com/embed`, and
the Discord price bot once step 5 above is done, not asking for anything.

**Weeks 10–12, email creators.** Template 3. You're offering free price research,
not asking for a shout-out.

Keep one spreadsheet: **Who · Email · Sent · Replied · Outcome**. That's the whole
system. One follow-up after seven days if they don't reply, then stop.

**Expect most of these to go nowhere.** Ten emails producing one or two real
conversations is a good result. The target is six to eight new sites linking to
you by 20 December, and links earned in October don't show up in rankings until
November or December. That delay is normal and is not a sign it isn't working.

---

## Part 4 — Things to send me

1. ~~**A Search Console export.**~~ **Done — sent 21 September.** It changed the
   plan in three ways, all written up in `docs/MARKETING-PLAN.md`: the site is
   growing much faster than the 28-day total suggested (56 clicks/day in the
   first half of the window, 179 in the second), the guides section has a
   measurable snippet problem the blog does not, and the ban-list page turned out
   not to be the opportunity it looked like. **Send a fresh one at the end of
   October**, the same way, so the Radiance window can be measured against this
   one. To repeat it: search.google.com/search-console → **Search results** → date
   range **Last 28 days** → **Export** (top right) → **Download CSV**.
2. **Anything a store or site replies with.** Especially a "no" and the reason —
   that is worth more than a yes for working out what to send next.
3. **Anything that looks wrong on the site.** You use it differently from the way
   I test it.

---

## What not to do

- **Don't buy ads.** Already tried, the cost per click doesn't work, and this
  whole plan needs $0.
- **Don't write a pile of Radiance articles.** Of about 24 Vendetta pre-release
  articles, 13 had to be deleted within eight weeks. The ones that survived all
  had live data in them.
- **Don't post the leaked-mechanics article during preview season.** Post the
  tracker. The leak post already holds its own search traffic and doesn't need
  help.
- **Don't change prices, popups or signup prompts during the window.** There's a
  freeze on for a reason: the last popup drove bounce rate up and store clicks
  down.
- **Don't promise a store more sales.** The report is a fact. The outcome isn't.
- **Don't look at bounce rate.** It counts the site's best outcome as a failure.
  Watch store clicks and Google clicks instead.
