# Growth playbook, October 2026

Written 2026-10-16, after the owner asked: "I need more people to register …
I'm not getting anyone register for premium … be my marketing specialist …
if I use Meta ads … my customer acquisition cost is more than … how much a
customer pays in a lifetime." The decision record is DECISIONS.md, "Growth:
meet readers where they are".

## What the numbers say (2026-10-16)

| | Value | Source |
|---|---|---|
| Real accounts | 480 | audit-users |
| Active Premium (paid + comped) | 16 | audit-users |
| MRR | US$46.59 | funnel-report |
| New accounts a week | 55 → 56 → 40 → 31 → 35 → 39 → 23 (Aug 24 → Oct 5) | funnel-report |
| Google clicks a day | 204 (12 Sep–8 Oct) → 130 (9–15 Oct) | impact-report |
| Accounts per 100 Google clicks | 2.4 → 2.6 (steady) | impact-report |
| Activation in 7 days | 100% for price-alert sign-ups, 26–30% header/login, **12% for the old popup** | funnel-report |
| Trialists who cancel | 13% with an alert or binder card, 38% without | DECISIONS 2026-10-12 |

**Four in five search visits are readers, not shoppers.** The top pages are the
Radiance spoilers (733 clicks in 28 days), the leaked mechanics (359), the
Deploy / Disarm / Show Off explainers (643 together) and the Radiance card list
(292). Price searches ("riftbound card prices", "riftbound prices") brought 41
clicks in 28 days. The site asked readers to compare prices; they came to
follow a set.

**Sign-ups follow traffic, at a steady rate.** The fall since September is
Google traffic (down about a third) plus the popup's removal on 30 Sep, which
had been the biggest single source (122 of 290 accounts), though the least
active one.

**Paid ads do not pay.** At US$4.99 a month and a handful of paying members, a
customer is worth tens of dollars, and earlier ads "produced barely any clicks
at a cost that didn't pencil" (MARKETING-PLAN). This playbook spends nothing.

## What was built (2026-10-16)

1. **"Follow Radiance's chase cards"** (`components/ChaseWatchCta.tsx`). On
   every Radiance post (after the intro, in place of the email box), on
   `/sets/radiance` and on its gallery. One Google or Discord click makes a free
   account that is already watching eight chase cards, with an email when each
   gets its first price and when it drops. It turns a spoiler reader into the
   most active kind of member. Source `radiance_watch`; event
   `chase_watch_all`. It also brings a free member to eight of their ten free
   watches, so the upgrade panel arrives sooner, with no change to price, trial
   or pitch.
2. **The pull tracker** (`/tools/pull-tracker/<set>`). Tap what you pulled from
   a box, see what it is worth against what you paid, save it to your binder
   (source `pull_tracker`), or share a link whose preview reads
   "Radiance pulls: US$X from a US$Y buy". Every share is a visit by someone who
   opens packs. Pre-Rift events (17–20 Oct) and release day (23 Oct) are when
   everyone opens boxes. Events `pull_add`, `pull_save`, `pull_share`.

## How to read whether it worked

Run `maintenance.yml` → `impact-report` with `CHANGE_DATES=2026-10-17` around
28 October, and `funnel-report`:
- **New accounts by source:** `radiance_watch` and `pull_tracker` rows.
- **Activation by source:** these should sit near the alert sources' 100%, not
  the popup's 12%.
- **Accounts per 100 Google clicks:** the headline. 2.5 today.
- **GA4:** `chase_watch_all`, `pull_share` (each share is distribution) and
  `pull_save`.

## Your list — only you can do these

In order of value per minute. Each Chrome prompt below is written to paste into
the Claude in Chrome extension; it pauses for your approval before anything is
sent.

### 1. Post the pull tracker where box-openers are (10 min, this weekend)

Pre-Rift weekend and release day are the moment. One genuine post each, not a
blast, in **r/riftboundtcg** and the main Riftbound Discords you are in. Post
it as a tool you made for your own box, show your own pulls, and link your
share result rather than the homepage. Draft:

> **I made a free tracker for what your Radiance box pulled**
>
> Opened my pre-rift kit and wanted to know what I'd actually pulled versus
> what I paid, so I built this: tap your cards, it values them at the cheapest
> in-stock store price in your country, and gives you a link to share.
> Here's mine: <your share link>. No sign-up needed. Tell me what's
> wrong with it.

Add `?utm_source=reddit` to the tracker link (the site reads it as the entry
source).

### 2. Turn on the Discord price bot (15 min)

`docs/OWNER-CHECKLIST.md`, step 5. Until `NEXT_PUBLIC_DISCORD_APP_ID` is set,
`/embed` hides the bot's install link. That is the one built channel where
other people's communities carry RiftCompare for free.

### 3. Tell the stores they are listed (Chrome prompt, ~1 hour for the first 30)

224 stores are tracked, 59 of them added today. A store that learns it is
listed, and gets a badge and its own repricing report, has every reason to
link to us. Those stores' customers are exactly our audience. The contact list
is the file `store-contacts.csv` sent with this playbook (not committed: it
holds store emails).

**Chrome prompt:**

> You're helping me (the owner of riftcompare.com, a Riftbound card price
> comparison site) tell card stores we track that they're listed. I'll give
> you a CSV of stores (name, website, contact page, email). Work through them
> one at a time, starting with the stores added most recently. For each
> store:
> 1. Open https://riftcompare.com/admin/store-partners (I'm signed in as
>    admin). Create a report link for this store and copy it.
> 2. Open https://riftcompare.com/stores/<key> and confirm the store page
>    shows their listings.
> 3. Draft this message, filling in the store name and report link, and
>    show it to me before sending:
>    "Hi <store>, I run RiftCompare (riftcompare.com), a free price
>    comparison for Riftbound singles. Your store is now listed, so people
>    searching for a card can find your price next to other shops'. Here's a
>    private report of your listings and where another shop is cheaper,
>    which you're welcome to use for repricing: <report link>. Under it is
>    a 'Prices tracked on RiftCompare' badge you can add to your site if
>    you'd like. If anything about your listing is wrong, reply and I'll fix
>    it. Thanks, <my name>"
> 4. When I approve, send it through their contact form if they have one,
>    otherwise from my Gmail to their listed email. Never send without my
>    approval, never send twice to one store, and stop if a site asks for a
>    login or a payment.
> 5. Keep a running list of who was contacted and how.

### 4. Recruit three creators for codes (Chrome prompt, 30 min)

The creator code programme is built (20% off for their audience, 20% to them)
and has no creators yet.

**Chrome prompt:**

> Find Riftbound content creators on YouTube and TikTok who post pack
> openings, deck techs or price talk, with roughly 1k to 50k followers and a
> post in the last two weeks. List 15 with their channel, follower count,
> latest Riftbound video and a contact (business email from their About page,
> or Instagram). Don't contact anyone. Show me the list first. Then, for the
> ones I pick, draft a short message: "I run RiftCompare, a free Riftbound
> price comparison. We have a creator code programme: your audience gets 20%
> off Premium and you get 20% of what they pay, every month they stay. Apply
> here: riftcompare.com/creators/apply. Happy to set up your code today."
> Show me each message before sending.

### 5. Brevo "Authorised IPs" (3 min, if not already done)

`docs/OWNER-CHECKLIST.md`, step 1. The admin promo emails (the trial offer to
free members) only reach everyone once it is off. Price alerts go through
Resend and are unaffected.

## What not to do

- **No paid ads** at this price. Revisit if lifetime value passes US$60.
- **No popup back on the landing page.** It brought sign-ups that did nothing
  (12% active), and Google treats a first-page phone popup as intrusive.
- **No change to Premium price, trial or pitch before late November,** when
  two 14-day cohorts have matured (DECISIONS 2026-10-12). The levers above all
  work on the top of the funnel and on activation, which is what feeds
  Premium.
- **No posting the same link to many subreddits or Discords at once.** One
  real post where box-openers are, by a person, is worth more than a blast
  that gets the domain filtered.
