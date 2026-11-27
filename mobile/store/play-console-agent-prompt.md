# Claude for Chrome — the "get RiftCompare onto Google Play" prompt

Paste the block below into **Claude for Chrome** (Sonnet is fine — the prompt is
written as explicit numbered steps precisely so a mid-size model doesn't have to
infer anything).

## Before you paste it

1. **Grant the extension site access** to `play.google.com`, `admob.google.com`
   and `console.cloud.google.com`. It cannot act on a site it can't see.
2. **Be signed in** to the Google account you want to own the app. The agent
   uses your existing session — it will never be asked for a password.
3. **Have this folder open** in a file manager, for the two upload handoffs:
   `mobile/store/assets/`
4. Expect the agent to stop **4–6 times**. Those stops are designed in, not
   failures — see "Why it stops" below.

## Why it stops

| Stop | Why it cannot be automated |
| --- | --- |
| Play Console $25 registration | Payment. You asked for a pause here. |
| Play identity verification | Google requires a government ID and address; some accounts also need a D-U-N-S number. |
| Uploading 6 screenshots + feature graphic + icon | A browser agent cannot put a file into an **OS-level file picker**. It will open the dialog and wait. |
| Rebuilding the `.aab` with the real AdMob App ID | That's a local Gradle build, not a web page. |
| Uploading the `.aab` | Same file-picker limitation. |
| AdMob payment/tax profile | Payment. Only needed before you get *paid*, not before you ship. |

Everything else — creating the AdMob app and ad unit, creating the Play app,
every field of the store listing, all nine App content declarations, the Data
safety form and the content-rating questionnaire — the agent does itself.

---

## THE PROMPT — copy everything between the lines

---

You are operating my browser to publish an Android app to the Google Play Store.
I am already signed in to the Google account that should own this app. Use that
existing session. Never ask me for a password.

## Operating rules

1. **Work in one pass. Do not ask me clarifying questions.** Every value you
   need is in this prompt. If something is genuinely ambiguous, pick the option
   most consistent with the values below, do it, and note the choice in your
   final report.
2. **Stop only for the five reasons in the STOP list.** When you stop, print a
   single line starting with `>>> ACTION NEEDED:` saying exactly what I must do,
   then wait. When I say "done", continue from where you were without restarting.
3. **Never enter payment details, and never submit an identity verification
   form.** Navigate to the page, then stop.
4. **Never click a final "Send for review", "Submit", "Publish" or "Roll out"
   button.** Save everything as a draft and stop at that point. I do the final
   submit myself.
5. **Copy the text below verbatim.** Do not improve, shorten, rephrase or add
   emoji to any of it. Every field is already inside Google's character limits;
   editing breaks that.
6. **Record every ID you are shown.** They go in your final report.
7. If a page label differs from what I describe, the Play Console UI has moved —
   find the equivalent section by its meaning and carry on. Do not stop for this.
8. If a page won't load or a control won't respond, retry once, then move to the
   next task and list the skipped item in your final report. Do not stall the
   whole run on one field.

## STOP list

Stop and print `>>> ACTION NEEDED:` for exactly these:

- A payment or billing form (the $25 Play registration fee; AdMob payment/tax).
- An identity or address verification form.
- An OS file-picker dialog for uploading an image or a bundle.
- The point where I must rebuild the app locally (Phase B, step 4).
- A final submit/publish/roll-out button.

---

# PHASE A — AdMob

Go to https://admob.google.com

**A1.** If there is no AdMob account yet, create one. Country: Australia.
Time zone: the account default. Currency: AUD. If it asks whether you want
customised help or email updates, decline both.

**A2.** Apps → **Add app**.
- Platform: **Android**
- Is the app listed on a supported app store? → **No** (it isn't published yet)
- App name: `RiftCompare`
- Enable user metrics: **Yes**

**A3.** When the app is created, find and record its **App ID**. It looks like
`ca-app-pub-0000000000000000~0000000000` (note the **tilde**).

**A4.** Ad units → **Add ad unit** → **Banner**.
- Ad unit name: `RiftCompare Android Banner`
- Leave the advanced settings at their defaults.

**A5.** Record the **Ad unit ID**. It looks like
`ca-app-pub-0000000000000000/0000000000` (note the **slash**).

**A6.** Go to Apps → RiftCompare → **App settings** and find the **app-ads.txt**
section. Record the exact line it tells me to publish. It looks like
`google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0`.

**A7.** Do **not** set up a payment or tax profile. If AdMob pushes you toward
one, skip it — it is only needed before payout, not before shipping.

---

# PHASE B — the handoff back to me

**B1.** Print this block, filled in with the values you recorded:

```
ADMOB_APP_ID      = ca-app-pub-...~...
ADMOB_BANNER_UNIT = ca-app-pub-.../...
APP_ADS_TXT_LINE  = google.com, pub-..., DIRECT, f08c47fec0942fa0
```

**B2.** Then print, verbatim:

```
>>> ACTION NEEDED: Put ADMOB_APP_ID into
mobile/android/app/src/main/res/values/strings.xml (replace the admob_app_id
string), set NEXT_PUBLIC_ADMOB_BANNER_ANDROID=<ADMOB_BANNER_UNIT> in the Vercel
project env, publish APP_ADS_TXT_LINE at https://riftcompare.com/app-ads.txt,
then run `cd mobile && npm run build:aab` and tell me "done".
```

**B3.** Wait. While waiting, continue to Phase C — the Play Console listing does
not need the bundle yet. Only the *release* (Phase F) does.

---

# PHASE C — Play Console: create the app

Go to https://play.google.com/console

**C1.** If there is no developer account, start registration. Account type:
**Personal** unless the account is already an organisation. When you reach the
$25 fee or any identity verification, **STOP** per the rules.

**C2.** **Create app**.
- App name: `RiftCompare: Riftbound Prices`
- Default language: **English (United States) – en-US**
- App or game: **App**
- Free or paid: **Free**
- Tick both declarations (Developer Programme Policies, US export laws).

**C3.** Record the app's package name once visible. It must be
`com.riftcompare.app`. If the Console shows anything else, note it loudly in
your final report — it means the wrong bundle would be uploaded.

---

# PHASE D — Play Console: the store listing

Go to **Grow users → Store presence → Main store listing**.

**D1. App name** (max 30):

```
RiftCompare: Riftbound Prices
```

**D2. Short description** (max 80):

```
Compare live Riftbound card prices across every store and find the cheapest.
```

**D3. Full description** (max 4000) — paste exactly, keeping the blank lines and
the bullet characters:

```
Stop overpaying for Riftbound cards.

RiftCompare checks what every store is charging for a card and shows you the
cheapest one, side by side — so a single tap takes you to the best price
instead of the first shop you happened to open.

WHAT IT DOES

• Compare prices across every store we track, ranked cheapest first
• Search the complete Riftbound card database by name, set, rarity, domain and
  card type
• See the real delivered cost — postage is included in the comparison, not
  hidden until checkout
• Track price history so you know whether today's price is actually a good one
• Watch the cards you're hunting and check back on what's moved
• Follow the biggest risers and fallers of the week
• Price sealed product — boxes, bundles and cases — on what a pack really costs
• Value your collection as prices move
• Switch between Australian, US, UK, Canadian, Singaporean and European
  pricing, each in its own currency

BUILT FOR THE WAY PEOPLE ACTUALLY BUY

Prices come from public store listings and are refreshed daily. Every listing
shows whether it's in stock and what condition it's in before you commit, and
out-of-stock shops are collapsed out of your way rather than padding the list.

FAST, AND IT STAYS OUT OF YOUR WAY

Jump straight to search, this week's movers, or your watchlist by holding the
app icon. Tapping a riftcompare.com link anywhere on your phone opens it right
here. Buy links open in a proper browser tab with a close button, so you never
lose your place.

FREE

RiftCompare is free and supported by ads. A Premium tier is available on the
website if you'd rather browse without them.

HOW WE MAKE MONEY

Some store links are affiliate links, which means we may earn a commission on a
purchase — at no extra cost to you. It never changes the ranking: the cheapest
price is always shown first, whether or not we earn anything on it. Our full
methodology is published at riftcompare.com/methodology.

A NOTE ON PRICES

Prices are collected from public store listings and can change at any time.
Always confirm the final price on the retailer's own site before you buy.

RiftCompare is an independent price-comparison service. It is not affiliated
with, endorsed by, or sponsored by Riot Games. Riftbound and League of Legends
are trademarks of Riot Games, Inc.
```

**D4. Graphics.** For each upload, click the control, and when the OS file
picker opens, **STOP** and print:

```
>>> ACTION NEEDED: select <exact filename> from mobile/store/assets/
```

Do them in this order, and wait for "done" between each:

1. **App icon** → `icon-512.png`
2. **Feature graphic** → `feature-graphic.png`
3. **Phone screenshots**, in this order — the order is the pitch, do not shuffle:
   `phone-1.png`, `phone-2.png`, `phone-3.png`, `phone-4.png`, `phone-5.png`,
   `phone-6.png`

If Play warns that there are no tablet screenshots, **ignore it** — it is a
warning, not a blocker, and we are publishing without them.

**D5.** Save.

---

# PHASE E — Play Console: App content

Go to **Policy and programmes → App content**. Complete every section below.

**E1. Privacy policy**

```
https://riftcompare.com/privacy
```

**E2. App access** → select **All functionality is available without special
access**. (Search, price comparison, movers, sealed and sets all work signed
out.) Save.

**E3. Ads** → **Yes, my app contains ads.** Save. This is mandatory — the app
ships an AdMob banner.

**E4. Content rating** → start the questionnaire.
- Email: the account's own address.
- Category: **Utility, Productivity, Communication, or Other**
- Violence: **No** to every question
- Sexuality: **No** to every question
- Language: **No**
- Controlled substances: **No**
- Miscellaneous / crude humour / horror: **No**
- Does the app share the user's location? **No**
- Does the app allow users to interact or exchange content? **No**
- Does the app allow users to purchase digital goods? **No**
  (Premium is sold on the website, never in-app.)
- Gambling or simulated gambling: **No**
- Submit the questionnaire. Expect **Everyone / PEGI 3**.

**E5. Target audience and content**
- Target age groups: tick **18 and over** and **13–17** only.
- **Do NOT tick any age group under 13.** That would put the app under Families
  policy, which forbids the ad configuration it uses. This is the single most
  damaging wrong click in this whole run.
- Does the app appeal to children? **No**
- Save.

**E6. Data safety** → **Start**.

Does your app collect or share any of the required user data types? → **Yes**

Then declare exactly these five types, and nothing else:

| Data type | Collected | Shared | Purpose | Optional for the user |
| --- | --- | --- | --- | --- |
| Personal info → **Email address** | Yes | No | Account management | **Yes** |
| Personal info → **Name** | Yes | No | Account management | **Yes** |
| App activity → **App interactions** | Yes | **Yes** | Analytics; Advertising or marketing | No |
| Device or other IDs → **Device or other IDs** | Yes | **Yes** | Advertising or marketing | No |
| App info and performance → **Crash logs** | Yes | No | Analytics | No |

Then the security section:
- Is all of the user data encrypted in transit? → **Yes**
- Do you provide a way for users to request that their data is deleted? → **Yes**,
  and give the URL `https://riftcompare.com/privacy`
- Has your app's data collection been independently verified? → **No**

Save and submit the section.

> Getting "Device or other IDs" wrong here fails the review automatically: the
> app's manifest declares `com.google.android.gms.permission.AD_ID`, Play reads
> that directly, and a mismatch between the manifest and this form is caught by
> a bot, not a human.

**E7. Advertising ID** → **Yes, my app uses advertising ID.** Purposes: tick
**Advertising or marketing** and **Analytics**. Save.

**E8.** Answer **No** and save for each of these sections:
- Government apps
- Financial features (comparing retail prices is not a financial product, and
  the app takes no payments)
- Health apps
- News app
- COVID-19 contact tracing and status apps
- Social features / UGC, if present

**E9.** Set the app **Category** to **Shopping** under *Store settings*, and add
up to five tags from: Price Comparison, Deals & Coupons, Collectibles,
Card Games, Shopping Tools. Contact details:
- Email: `riftcompare@gmail.com`
- Website: `https://riftcompare.com`

Save.

---

# PHASE F — the release (only once I've said "done" to B2)

**F1.** Go to **Test and release → Production → Create new release**.

**F2.** If offered **Play App Signing**, **accept it** (it is the default and it
makes a lost upload key recoverable).

**F3.** Click to upload the app bundle. When the file picker opens, **STOP**:

```
>>> ACTION NEEDED: select app-release.aab from
mobile/android/app/build/outputs/bundle/release/
```

**F4.** Release name: leave Play's default (it derives it from the version).

**F5.** Release notes — paste exactly:

```
<en-US>
First release.

Compare live Riftbound card prices across every store, see the real delivered
cost, track price history, and get straight to the cheapest listing.
</en-US>
```

**F6.** Save as draft. **Do not click "Review release" → "Start roll-out".**
Print:

```
>>> ACTION NEEDED: the release is saved as a draft. Review and roll it out
yourself when you're ready.
```

**F7.** Go to **Test and release → Setup → App signing** and record the
**SHA-256 certificate fingerprint of the App signing key** (NOT the upload key).

---

# FINAL REPORT

Print exactly this, filled in:

```
=== RIFTCOMPARE PLAY SUBMISSION ===

AdMob
  App ID              : ...
  Banner unit ID      : ...
  app-ads.txt line    : ...

Play Console
  Package name        : ...
  App signing SHA-256 : ...

Completed
  [ ] Store listing (name, descriptions, graphics)
  [ ] App access
  [ ] Ads declaration
  [ ] Content rating          -> rating received: ...
  [ ] Target audience
  [ ] Data safety
  [ ] Advertising ID
  [ ] Other declarations
  [ ] Production release draft

Skipped or failed
  ...

Still on you
  - Roll out the production release
  - Put the App signing SHA-256 into public/.well-known/assetlinks.json
    (template: mobile/store/assetlinks.json.template) so App Links verify
  - If this is a personal developer account: run a closed test with 12 testers
    for 14 continuous days before production will unlock
```

---

## One thing to check the agent on

When it reports the **App signing SHA-256**, make sure it took it from *App
signing key certificate* and not *Upload key certificate*. Using the upload
fingerprint in `assetlinks.json` is the single most common reason App Links
silently fail to verify, and nothing visibly breaks when you get it wrong —
links just keep opening in the browser forever.
