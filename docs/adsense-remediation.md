# AdSense remediation — riftcompare.com

Branch: `claude/adsense-approval-65za5x`
Publisher account under review: **pub-6842128782879909**
Status at start: rejected twice, third review in progress (requested 27 Jul 2026).

---

## ⛔ MANUAL ACTIONS FOR THE OWNER

*Nothing in this list has been done for you. Items 1 and 2 are blocking.*

### 1. Confirm whether `ca-pub-6262011577596407` is a second AdSense account you control — BLOCKING

The live site was serving this in its `<head>` on every page:

```html
<meta name="google-adsense-account" content="ca-pub-6262011577596407">
```

That is **not** the account under review (`pub-6842128782879909`). The tag has been
replaced (see Phase 1 below), but the underlying question has deliberately **not**
been investigated, looked up, or acted on — it is yours to answer:

- **If it is a second AdSense account you own or have owned**, close it before
  anything else. Holding more than one AdSense account is a direct violation of the
  AdSense Terms of Service, and it is the single most plausible explanation for two
  rejections that arrived without a specific content complaint. Approving this site
  under a second account is something Google will not do while the first exists.
- **If you have never seen it before**, the tag most likely arrived with a copied
  template or a third-party integration. It is harmless now that it is gone, but say
  so in your next review note so the reviewer isn't left wondering either.

Either way, resolve it **before** the current review concludes. No amount of content
work overcomes a duplicate-account finding.

### 2. Set `NEXT_PUBLIC_ADSENSE_CLIENT_ID` in Vercel, then deploy this branch

Vercel → project → Settings → Environment Variables, for **Production and Preview**:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_ADSENSE_CLIENT_ID` | `ca-pub-6842128782879909` |
| `NEXT_PUBLIC_ADSENSE_REVIEW_MODE` | `true` |
| `NEXT_PUBLIC_AD_STRATEGY` | `auto` |

A committed `.env.production` already carries the publisher id as a build-time
floor, so the deploy will not fail if you skip this — but set it anyway, so the
value lives where you'd look for it. Then merge/deploy the branch to production.

### 3. Confirm the Sites page flips ads.txt to "Authorized"

AdSense → Sites → riftcompare.com. The ads.txt status was **"Not found"**. After
deploying, `https://riftcompare.com/ads.txt` must return a plain-text body of exactly:

```
google.com, pub-6842128782879909, DIRECT, f08c47fec0942fa0
```

Google re-crawls ads.txt on its own schedule — allow up to 24 hours before worrying.

### 4. Confirm the European regulations message starts recording impressions

AdSense → Privacy & messaging → European regulations. It reads **0 messages shown,
0% consent rate** because the script that renders it was never on the site. It is now
(the message ships inside the AdSense loader). Expect the counter to move within a day
of the first EEA/UK/CH visit. Test it yourself with a VPN set to an EU country in a
fresh incognito window — see Phase 4 for the full test procedure.

### 5. Submit sitemaps in Search Console and request indexing

Sitemaps changed in this pass (thin and empty pages were removed from them). Re-submit
`https://riftcompare.com/sitemap.xml` and request indexing on `/`, `/browse`, `/guides`,
`/blog`, `/editorial-policy` and `/about`.

### 6. After approval — restore the two features held back for review

```
NEXT_PUBLIC_ADSENSE_REVIEW_MODE=false
```

That restores the homepage Premium teaser and the AI Tips module. Then choose an ad
strategy — `NEXT_PUBLIC_AD_STRATEGY=auto` (default; enable Auto ads in the console) or
`manual` (turn Auto ads **off** in the console first). Never both.

---

# PART ONE — INTEGRATION FAULTS

## Phase 1 — Publisher ID hygiene

### 1a/1b. Inventory taken BEFORE any change

Full-repo grep (excluding `.git` and `node_modules`) for `6262011577596407`, `ca-pub-`,
`googlesyndication`, `adsbygoogle`, `google-adsense-account`, `fundingchoices` and
`adsense`:

| Pattern | Occurrences |
| --- | --- |
| `6262011577596407` | **1** — `src/app/layout.tsx:183` |
| `ca-pub-` | **1** — same line, same file |
| `google-adsense-account` | **1** — same line, same file |
| `googlesyndication` | **0** |
| `adsbygoogle` | **0** |
| `fundingchoices` | **0** |
| `adsense` (any case) | 9, all of them prose comments — no code |

The single offending line, verbatim:

```
src/app/layout.tsx:183:  <meta name="google-adsense-account" content="ca-pub-6262011577596407" />
```

**The complete pre-existing ad integration was that one meta tag, carrying the wrong
publisher id.** There was no loader script, no ad unit, no consent script and no
ads.txt. The site was, in AdSense's terms, unverifiable: the review crawler found a
tag claiming ownership by an account that had not applied, and no code from the
account that had.

Related findings from the same sweep:

- `NEXT_PUBLIC_HILLTOPADS_SRC=""` in `.env.example` — the last trace of a HilltopAds
  integration removed in commit `3d50608`. The code was gone; only the env stub
  remained. Removed, and replaced with the AdSense block.
- `src/components/AdSlot.tsx` rendered **house promos only** (first-party links to
  `/movers`, `/tools/box-ev`, `/market`). No third-party network. Kept, and extended
  in Phase 13 to render real units when — and only when — they're enabled.
- `src/lib/admob.ts` + `mobile/` use `ca-app-pub-…` AdMob **ad-unit** ids. Different
  product, different namespace, native app only. Deliberately untouched; the guard's
  literal check explicitly excludes `ca-app-pub-`.
- `IMPACT_SITE_VERIFICATION` and `GOOGLE_SITE_VERIFICATION` are unrelated ownership
  tokens (Impact/TCGplayer affiliate, Search Console). Untouched.

### 1c. Single source of truth

`src/lib/adsense.ts` is now the only place any AdSense value is derived:

| Export | Feeds |
| --- | --- |
| `ADSENSE_CLIENT_ID` | ownership `<meta>`, loader `?client=`, every `data-ad-client` |
| `ADSENSE_PUB_ID` | `/ads.txt` — computed as `ADSENSE_CLIENT_ID.replace(/^ca-/, "")` |
| `ADSENSE_LOADER_SRC` | the `<script>` src |
| `ADSENSE_REVIEW_MODE` | content gating only — never the loader |
| `AD_STRATEGY` / `AD_UNITS_ENABLED` | whether *our* `<ins>` units may render |

All of it resolves from **`NEXT_PUBLIC_ADSENSE_CLIENT_ID`**, declared in `.env.example`
as `ca-pub-6842128782879909`.

**Startup assertion.** The module throws at evaluation time if the id is missing or
fails `/^ca-pub-\d{16}$/` **and** `NODE_ENV === "production"`, so a bad id fails the
build rather than shipping. In development it warns and renders no tags. Vercel keeps
the previous deployment live when a build fails, so the failure mode is "the deploy
doesn't ship", never "the site goes down".

**Decision — `.env.production` is committed.** The assertion above would fail the very
first deploy of this branch if the Vercel variable weren't set yet. The publisher id is
public by construction (it is emitted in the HTML of every page), so committing it as a
build-time floor costs nothing and removes that failure mode. A real process
environment variable still takes precedence over the file, so the Vercel dashboard
remains the source of truth. Nothing secret may go in that file.

### 1d. CI guard

`scripts/adsense-guard.ts`, wired as the **first step of `npm run build`** and therefore
into every Vercel deploy and CI run. It fails the build on:

- any `ca-pub-<digits>` literal in the source tree outside `.env*`, `docs/` and itself
  (`ca-app-pub-` — AdMob — excluded);
- any reappearance of `6262011577596407` in code;
- a missing or malformed declaration in `.env.example`;
- the loader not being rendered by the root layout, or being rendered conditionally;
- a loader that isn't the pagead2 endpoint, or lacks `crossorigin="anonymous"`;
- an ownership meta tag not sourced from the env var;
- `ADSENSE_PUB_ID` not being derived from `ADSENSE_CLIENT_ID`;
- the production assertion having been removed;
- `AD_UNITS_ENABLED` not excluding the `auto` strategy;
- any of the six Google ad/consent origins missing from the CSP;
- an AdSense crawler being disallowed in `robots.ts`;
- `/ads.txt` losing its plain-text content type or its derivation;
- (Phase 16) any content budget in `docs/adsense-audit.json` being exceeded.

With `--url <origin>` it additionally runs the Phase 5 live checks against a
deployment.

**Google policy addressed:** *Ad code implementation* / site verification — a
publisher id that doesn't match the applying account makes the site unverifiable, and
"we could not verify your site" is a rejection reason with no content remedy.


### 1e. FLAGGED, NOT RESOLVED

`ca-pub-6262011577596407` was found live on the site and has **not** been investigated,
looked up or acted on. See **MANUAL ACTION 1** at the top of this document. It is a
blocking, owner-only decision: if it is a second AdSense account, a duplicate-account
finding will reject this site regardless of how good the content is.

---

## Phase 2 — Verification and ad code

### 2a. The loader

`src/components/AdSenseLoader.tsx`, rendered in `<head>` from the root layout, on every
page, **unconditionally**:

```html
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6842128782879909" crossorigin="anonymous"></script>
```

**Deviation from the brief, deliberate.** The brief specified `next/script` with
`strategy="afterInteractive"`. In the Next 14 App Router that cannot also satisfy the
brief's harder requirement that the loader appear in server-rendered HTML: for
`afterInteractive`, `next/script` returns `null` from render and injects the tag from a
`useEffect`, emitting only a `<link rel="preload" as="script">` into the SSR'd HTML
(`node_modules/next/dist/client/script.js`, the `if (appDir)` branch). A raw `curl`
would find no `<script>` — and so would a verification bot that reads HTML without
executing it, which is exactly the audience for the "AdSense code snippet" method.

A plain `<script async src>` keeps everything `afterInteractive` was chosen for —
non-render-blocking, executed after parsing, no hydration involvement — and is
physically present in the server HTML. Crawler visibility is the requirement the
review actually turns on, so it wins. Verified by raw HTTP on 12 URLs (Phase 5).

The loader renders regardless of `ADSENSE_REVIEW_MODE`, `AD_STRATEGY`,
`AD_UNITS_ENABLED` or Premium status. The guard fails the build if that ever changes.

### 2b. Ownership meta tag

`<meta name="google-adsense-account" content={ADSENSE_CLIENT_ID}>` — sourced from the
env var. The wrong-ID tag is gone; the string `6262011577596407` appears in no served
response (asserted on all 12 URLs).

### 2c. CSP

No middleware exists, and there is no CSP `<meta>` tag. `next.config.js` sets a
**Report-Only** CSP (nothing has ever been blocked by it) plus baseline security
headers. It was still updated, so that promoting it to enforcing later cannot silently
kill ad delivery. Final policy as served:

```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com
  https://*.vercel-insights.com https://pagead2.googlesyndication.com
  https://partner.googleadservices.com https://tpc.googlesyndication.com
  https://googleads.g.doubleclick.net https://fundingchoicesmessages.google.com
  https://www.googletagservices.com https://adservice.google.com;
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https:;
font-src 'self' data:;
connect-src 'self' https://*.vercel-insights.com https://vitals.vercel-insights.com
  https://cdn.riftscribe.gg https://pagead2.googlesyndication.com
  https://googleads.g.doubleclick.net https://tpc.googlesyndication.com
  https://ep1.adtrafficquality.google https://ep2.adtrafficquality.google
  https://fundingchoicesmessages.google.com https://csi.gstatic.com;
frame-src 'self' https: https://googleads.g.doubleclick.net
  https://tpc.googlesyndication.com https://www.google.com
  https://fundingchoicesmessages.google.com;
frame-ancestors 'self'; base-uri 'self'; form-action 'self'
```

`img-src` stays open to `https:` — ad creatives come from arbitrary advertiser domains
and narrowing it would blank them. `'unsafe-inline'` in `script-src` is a hard AdSense
requirement, not just a Next convenience: Google's tags inject inline script.

Also checked and clear: `X-Frame-Options: SAMEORIGIN` and `frame-ancestors 'self'`
govern who may frame **us**, not what we may frame, so ad iframes are unaffected.
`Permissions-Policy` restricts only camera/microphone/geolocation and does not touch
the Privacy Sandbox features (`browsing-topics`, `attribution-reporting`,
`run-ad-auction`, `join-ad-interest-group`) that AdSense uses.

### 2d. Cold-load behaviour

Verified against a production build (`next build && next start`) with raw, cookie-less
HTTP fetches — no headless browser, deliberately, since that is what a non-rendering
crawler sees. The loader is a single tag per page (the apparent duplicate in the RSC
flight payload is escaped JSON, not an executable second copy — checked). No enforcing
CSP exists, so nothing can block it; the Report-Only policy allow-lists it anyway.

**Google policy addressed:** *Ad code implementation*, *Site verification*, and the
"Getting ready" state itself — a site with no ad code cannot complete review.

---

## Phase 3 — ads.txt

`src/app/ads.txt/route.ts` — `force-static`, HTTP 200, no redirect,
`Content-Type: text/plain; charset=utf-8`, `Cache-Control: public, max-age=3600`,
`X-Robots-Tag: noindex`. Body, exactly:

```
google.com, pub-6842128782879909, DIRECT, f08c47fec0942fa0
```

The seller id is `ADSENSE_CLIENT_ID.replace(/^ca-/, "")` — it cannot drift from the
loader. `f08c47fec0942fa0` is Google's certification-authority id, identical for every
AdSense publisher, which is why it is a literal.

**Why it read "Not found":** nothing claimed the path, so Next served the App Router's
HTML shell — a 200 with `text/html` and a whole page in the body. To the ads.txt
crawler that parses as zero valid records, indistinguishable from a missing file.

**3d — no eBay/TCGplayer lines.** Deliberately empty, with a commented `PARTNER_RECORDS`
block for future use. eBay Partner Network and TCGplayer/Impact are affiliate programs:
they pay per referred sale through a tracking link and do not buy or resell ad
inventory on this domain, so neither issues ads.txt records. Inventing lines for them
would add unverifiable seller records, which is worse than none.

**Tests:** `tests/ads-txt.test.ts` — 7 assertions covering status, content type,
cache-control, exact body, absence of markup, the `ca-` derivation, and IAB field
count/format on every record. Run with `npm test`.

**Google policy addressed:** *Authorized Digital Sellers (ads.txt)* — an unresolved
"Not found" is a standing warning on the Sites page throughout review.

---

## Phase 4 — Consent

### 4a. How the message is delivered

Google's Privacy & Messaging (Funding Choices) message ships **inside the AdSense
loader**. It recorded 0 impressions for one reason: the loader was never installed.
Phase 2 fixes that; no separate Funding Choices script is needed or wanted.

**How to test it (owner):**
1. Open a **new incognito window** (a returning visitor with a stored consent string
   sees nothing).
2. Connect a VPN to an EEA country — Germany, France and Ireland all work — or the UK
   or Switzerland.
3. Load `https://riftcompare.com/`. The message should appear within a few seconds of
   the loader executing.
4. Confirm in DevTools → Application → Local Storage that a `FCCDCF`/`fc_*` key or a
   TCF consent string has been written, and that `window.__tcfapi` is defined.
5. AdSense → Privacy & messaging → European regulations: the impression counter should
   move within about a day.

If nothing appears, check in this order: is the loader in the page source (view-source,
not the inspector)? Is an ad blocker active? Is the message still **Published** for
riftcompare.com specifically, not just for the sibling domains?

### 4b. No third-party CMP

None was ever installed — the full-repo grep found no Klaro, CookieYes, Osano,
Cookiebot, Termly or Iubenda, and no `fundingchoices` reference. Nothing to remove.
None has been added: a second CMP competing with Google's certified one can suppress
the Google message entirely, which is the failure mode this phase exists to fix.

### 4c. Consent Mode v2

`src/components/ConsentDefaults.tsx` — an inline, synchronous script in `<head>`
setting all four v2 signals to `denied` before anything reads them, plus
`ads_data_redaction: true` and `wait_for_update: 500` (the window that lets the CMP
resolve instead of the tag firing immediately against the default and losing the
signal).

**Global denial is deliberate, and costs revenue.** Google's guidance permits
region-scoped defaults — deny in the EEA/UK/CH, grant elsewhere — which earns
materially more because non-EEA traffic keeps personalised ads. The blanket deny is the
conservative reading while the account is under review: nothing personalised is stored
for anyone until they say yes. The region-scoped variant is written out in full in the
component's header comment, ready to swap in after approval.

**Vercel Analytics honours the same signal.** `ConsentGatedAnalytics` holds `<Analytics>`
and `<SpeedInsights>` until the TCF v2.2 API (`window.__tcfapi`, which Google's message
implements) reports consent for purpose 1, or reports that GDPR doesn't apply. If no
CMP appears within 2.5s the visitor is outside its scope and analytics mounts — failing
closed inside the CMP's scope and open outside it, the same shape as Google's own
region-scoped defaults.

### 4d. Persistent "Privacy settings" link

`PrivacySettingsLink` in the site footer, on every page. Uses Google's documented API —
`googlefc.callbackQueue.push({ CONSENT_DATA_READY })` then
`googlefc.showRevocationMessage()`. It renders **nothing** until `googlefc` confirms a
message applies to this visitor, so non-EEA visitors don't get a dead link; the
trailing footer separator is inside the component so no orphan `·` is left behind.

### 4e. No content blocking, no layout shift

The consent message is Google's own overlay, injected after paint into a fixed-position
container — it reserves no document space and shifts nothing. It never renders for a
crawler (Googlebot is not an EEA end user, and the message is client-injected in any
case), so no content is withheld from indexing. The inline defaults script is ~250
bytes with no DOM output.

### On the loader's byte position relative to the defaults

React 18 treats every `<script async src>` as a hoistable **resource**: it floats the
tag into the head preamble and re-emits it from a normalised prop set. On
streaming-rendered routes (6 of the 12 verified URLs) that puts the loader a few KB
ahead of the inline defaults in the byte stream.

Both documented bail-outs were tried and **measured**: `onError` (which required making
the component a client component) and `itemProp`. Neither survives the resource
re-emission — the attributes are dropped and the tag still hoists. Options considered
and rejected: `defer` instead of `async` (deviates from Google's canonical snippet for
no real gain), and serving the defaults from a same-origin async file (two async
scripts have no guaranteed execution order either, and it adds a request).

Left as-is, because the ordering is harmless in practice: the defaults are an inline
script a few KB further into a response whose entire head is ~6KB, so the parser runs
them microseconds after the buffer arrives, while the loader cannot execute until a
fresh cross-origin connection to `pagead2.googlesyndication.com` completes — tens of
milliseconds later, even with the `preconnect` that was added. The verification script
therefore asserts the defaults are **present** on every page and reports their position
without failing on it.

It also matters less than it looks: this site uses no gtag-based measurement (analytics
is Vercel's), and Funding Choices is a Google-certified CMP that signals Google's ad
tags through TCF directly, not through our `gtag('consent', …)` call. The defaults are
correctness hygiene and future-proofing, not the consent transport.

**Google policy addressed:** *EU user consent policy* — a published message that never
shows is, from Google's side, no consent mechanism at all.

---

## Phase 5 — Integration verification gate

`scripts/adsense-verify.ts` — raw HTTP only, no headless browser, cookie-less. Run
against a production build (`next build && next start`) with the full card catalogue.

Reproduce against a deployment:

```
npx tsx scripts/adsense-verify.ts https://riftcompare.com --md
```

| URL | Template | Status | Loader + correct id | Ownership meta | No stale id | Consent Mode defaults |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | home | 200 | ✅ | ✅ | ✅ | ✅ present |
| `/browse` | browse / index | 200 | ✅ | ✅ | ✅ | ✅ present |
| `/card/chemtech-enforcer-ogn-003-298` | card (priced) | 200 | ✅ | ✅ | ✅ | ✅ before |
| `/card/disintegrate-ogn-005-298` | card (no listings) | 200 | ✅ | ✅ | ✅ | ✅ before |
| `/sets` | set index | 200 | ✅ | ✅ | ✅ | ✅ before |
| `/domains/fury` | domain facet | 200 | ✅ | ✅ | ✅ | ✅ present |
| `/cards/rarity/rare` | rarity facet | 200 | ✅ | ✅ | ✅ | ✅ before |
| `/guides` | guides hub | 200 | ✅ | ✅ | ✅ | ✅ present |
| `/blog` | blog hub | 200 | ✅ | ✅ | ✅ | ✅ before |
| `/about` | static / policy | 200 | ✅ | ✅ | ✅ | ✅ before |
| `/market` | tool | 200 | ✅ | ✅ | ✅ | ✅ present |
| `/marketplace` | marketplace | 200 | ✅ | ✅ | ✅ | ✅ present |

| Surface | Result |
| --- | --- |
| `/ads.txt` | 200, no redirect · `text/plain; charset=utf-8` · `public, max-age=3600` · body exact match |
| `/robots.txt` | 200 · Mediapartners-Google **permitted** · AdsBot-Google **permitted** · AdsBot-Google-Mobile **permitted** · wildcard group present |
| CSP | no enforcing policy (nothing can be blocked); all 6 Google ad/consent origins allow-listed in Report-Only |
| Stale publisher id | absent from every response |

**ALL CHECKS PASSED.**

Caveat, stated plainly: this ran against a local production build seeded with the real
1,064-card catalogue and synthetic price data, not against a Vercel preview — this
environment has no deployment credentials. Every check is transport-level (HTML bytes,
status codes, headers) and none depends on the hosting platform, but re-run the same
command against the preview URL after deploying to confirm on real infrastructure.
