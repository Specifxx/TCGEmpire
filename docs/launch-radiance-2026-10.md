# Launch and marketing plan: Radiance, October 2026

For the owner. Written 2026-09-29 as part of the personas pass (DECISIONS.md,
"Personas: the set tracker, Finish this set, minimum condition, six-hourly
sealed watches"). It is a plan for what to say and when, not a task list for
the code: everything below describes features that are built and committed, and
each one only goes into the world after it is live on production.

## The idea in one paragraph

We sell to people who already use RiftCompare and are doing a chore by hand: the
collector cross-checking a binder against a set, the player assembling a deck
order across stores, and the sealed buyer refreshing tabs for restocks. The site
already knew what you own; the new thing is that it now also knows what you are
missing. That is the free front door: a signed-out visitor sees a set page, signs
up to tick their cards, meets Plus at the 51st card ("no limit, so a whole set
fits") and Premium at "where do I buy the rest" (the store-by-store plan). The
hero line on /premium says it: "Know what you're missing. Buy it for less."

## Rules for every post, email and reply

1. Helpful first. Say we make the site. Say what is free before what is paid.
2. No discounts, no coupons, no launch passes, no countdowns, no "sells out",
   "grab it", "don't miss" wording. The prices are fixed (Plus $2.99 a month or
   $23.99 a year, Premium $4.99 a month or $39.99 a year) and are not part of
   launch messaging.
3. No flipping, investing, "before it spikes", "worth" or prediction language. We
   do not say when to buy. We show what stores charge today and tell people when
   their own number is met.
4. The only saving figure we ever quote is Best Basket's own computed saving on
   the viewer's own list. No "save X%" claims in posts or emails until measured.
5. "Cost to finish" is always "the cheapest listing today, before postage".
6. Radiance: always say "N revealed", never a fixed total, until the set is
   complete. The printed total is unsettled.
7. Sealed alerts: say "about every six hours" and "up to twice a day for a
   restock", never "instant" or "first in line". Say a Discord stock bot may be
   faster. RRP alerts exist only where we publish an RRP (Australia, the US, the
   UK).
8. Nobody loses anything: the free limits are 10 watched cards and 50 portfolio
   cards, only new cards are refused, and existing cards are kept.
9. Check each community's self-promotion rules before posting. Where tools are
   not allowed, answer questions instead of posting.
10. Nothing uses the deploy marker in a commit subject. Features ride the daily
    08:00 UTC release. Anything meant for launch week must be on main at least a
    day before it is announced, and a feature is announced only after it is live.
    Anything not on main by about 16 October is at risk for the 23 October
    release.

## Timeline

Now to 6 October. The sealed "at RRP" honesty fix is already on main (a pre-order
box never says "at RRP"); the minimum-condition floor goes live with the next
daily release. Post where tools are allowed, plain and factual: "Best Basket now
lets you set a minimum condition, so the cheapest plan can't include a played copy
you didn't want."

6 to 13 October. The set tracker and the printing-aware CSV import are live.
Post: "A free set tracker: tick what's in your binder, see what's missing and the
cheapest listing in your country, free for up to 50 cards. Known limits:
printings we track, no foil tracking yet, prices before postage. What would make
it more useful?" Answer every comment and say what changed because of it. Send
one email to signed-in accounts (draft below).

13 to 15 October. Finish this set and the six-hourly sealed check are live. The
sealed cadence goes out only if the weekly egress audit is clean. Short post for
Finish this set: "You can now plan the rest of a set as one order: which stores,
with postage counted, up to 200 cards at a time." Short post for sealed: "Sealed
watches are now checked about every six hours, and every email says when the
store was last read."

16 to 22 October (prerelease). Add one line to the existing Radiance
release-alert emails and to /radiance-preorders: "Tick what you pull and see
what's left to buy." One "how to use the site during prerelease" post: compare
pre-orders, watch the cards you need. On 16 October re-check the alert budget
(see the risks note in DECISIONS.md) and decide whether to raise it.

23 October (release day). The release-day email links to /sets/radiance. Nothing
new ships that day except fixes. One factual comment that Radiance singles are
priced in stores in AU, NZ, US, UK, SG, CA and the EU.

After 6 November. Set watch, if it is built, announced to Plus members and to free
accounts that hit the 50-card limit. A retention note for launch-week Plus members
pointing them at the tracker. Do not push annual plans at launch buyers; expect
some to cancel after they buy their deck, and plan for it.

Discord. A pinned "what's free" message that names the set tracker, the
watchlist and the price comparison before it mentions Plus.

## Email: "See what your binder is missing"

To signed-in accounts, once, in the 6 to 13 October window, after the set tracker
is live on production. Sent from the site's usual address, with the usual
one-line footer.

Subject: See what your binder is missing

Preheader: Tick what you own, see what's left and the cheapest listing for each card.

Body:

Hi {first name},

We've added a set checklist to RiftCompare. Tick the cards in your binder and it
shows how far through a set you are, what's missing, and the cheapest listing for
each missing card in your country, before postage.

What stays free: the checklist, the missing list, the cost to finish and the CSV
export are free for your first 50 cards. You can import a CSV of your binder, with
the printing kept, at no cost. If you already have more than 50 cards you keep
every one of them; only adding a new card past the limit needs Plus.

What Plus adds: no card limit, so a whole set fits. What Premium adds: Finish this
set turns the missing list into an order, with the stores chosen and each store's
postage counted, in the condition you'll play.

Known limits: it counts the printings we track, it doesn't track foils yet, and
prices are the cheapest listing today before postage. Tell us what would make it
more useful.

[Open the set checklist]

RiftCompare

Do not add any figure, saving claim or deadline to this email.

## Email: one line for the Radiance release-alert emails

"Once the set is out, tick what you pull and see what's left to buy." Link to
/sets/radiance. It is one line in an email that already exists, not a new send.

## Post drafts

Minimum condition (now to 6 October): "Best Basket now lets you set a minimum
condition: Near Mint only, Lightly Played or better, or anything. The plan and the
deck price watch only use listings at or above it, and a card with nothing at that
grade is shown as not covered rather than filled with a played copy. It's a
Premium setting; your own total is still free."

Set tracker (6 to 13 October): the wording in the timeline above.

Prerelease (16 to 22 October): "Radiance is out on 23 October. Until then:
pre-order prices for boxes are side by side on /radiance-preorders, and you can
watch the cards you need (10 free) to get an email the first time a store lists
one. We don't predict prices or tell you when to buy; we show what stores charge
today."

Reply to the "too greedy" criticism with the free tracker, not a defence: name what
is free, say nobody loses cards they already have, and point at the tracker.

## How to measure it

Compare cohorts by PREMIUM_COPY_VERSION (personas-2026-09-29 from the day this
pass goes live). Look at three funnels: sign-ups that came from a set page (the
set_tracker source), views of the 51st-card panel to Plus purchases, and views of
the Finish-this-set preview to Premium purchases. With about 13 payers and about
30 new accounts a week the numbers are small, so judge over several weeks by
inline-prompt views to purchases, and publish no conversion or savings claims
until they are measured. Expect a handful of upgrades a month, not a step change.
The tracker is the acquisition bet.

## What the owner has to decide

1. By 16 October: whether to raise the daily alert budget and the Resend allowance
   for release week (a cost). Do not add a set watch between 16 October and 6
   November without it.
2. Whether Plus should get "unlimited" set watches rather than 3 sets, when the set
   watch is built.
3. Whether the sealed cadence stays at about six hours after the first egress audit
   that includes it.
