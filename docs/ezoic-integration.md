# Ezoic integration — riftcompare.com

Branch: `claude/domain-transfer-vercel-ezoic-hbgair`

Scope confirmed for this pass: **DNS/domain only**. Ezoic becomes the
nameserver-level reverse proxy in front of the site (their "Ezoic Cloud"
product); the Next.js app, its cron jobs, database and Vercel Analytics all
keep running on Vercel exactly as before — only the routing layer changes.
Ezoic also replaces direct Google AdSense as the ad network.

---

## ⛔ MANUAL ACTIONS FOR THE OWNER

*Nothing in this list has been done for you — these need your actual Ezoic
account, which this session has no access to.*

### 1. Connect the domain — BLOCKING for everything else

Ezoic dashboard → Integrate Your Site → copy the custom Ezoic nameservers it
generates for riftcompare.com, then update the domain's nameservers at your
registrar to point to them. Allow up to 24h for propagation. Until this is
done, none of the code changes in this branch have any visible effect — they
were written to work correctly once traffic starts flowing through Ezoic, not
to trigger the switch themselves.

### 2. Get the real Ezoic ads.txt line(s) and paste them into the codebase

Ezoic → Settings/Integration → ads.txt gives you the exact record(s) your
account needs. Paste them into `src/app/ads.txt/route.ts`, inside the
`PARTNER_RECORDS` array, exactly as Ezoic publishes them (one string per
record, unedited — the file has a marked spot for this).

**This is a real blocker, not a nice-to-have**: Google will not let Ezoic
monetise the site via AdSense mediation while its record is missing from
`/ads.txt`, and it takes Google 24–48h to recrawl the file after a change. Do
this as early as possible, not after everything else.

### 3. AdSense review — DECIDED: abandoned in favour of Ezoic

`docs/adsense-remediation.md` records that this account was **rejected twice**
and a **third review was in progress** (requested 27 Jul 2026) when this branch
was written. Owner decision (2026-08-15): stop pursuing that review — Ezoic is
the ad network going forward, full stop. `NEXT_PUBLIC_AD_NETWORK` defaults to
`ezoic`, which stops rendering the direct AdSense loader script and ownership
meta tag (`src/components/AdSenseLoader.tsx`, gated in `src/lib/ezoic.ts`); no
action needed to make that take effect, and no further AdSense review follow-up
is expected. The `adsense` value/code path is left in place only as a possible
future fallback (e.g. if Ezoic's AdSense-mediation wants the direct loader
present too), not because anyone is still waiting on Google.

### 4. Set `NEXT_PUBLIC_AD_NETWORK` in Vercel once you've decided

Vercel → project → Settings → Environment Variables, Production + Preview:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_AD_NETWORK` | `ezoic` (or `adsense` — see #3) |

The code already defaults to `ezoic` if this is unset, so setting it
explicitly is about making the choice visible, not required for it to work.

### 5. Pick a geo-IP replacement, or accept the US-default degradation

Ezoic's reverse-proxy means Vercel's `x-vercel-ip-country` header (this site's
only geo-detection signal, used for AU/NZ/US/UK/SG/CA pricing/currency) will
generally reflect Ezoic's proxy location, not the visitor's — see the comment
in `src/lib/get-country.ts`. **Explicitly deferred for this pass**: most
first-time, signed-out visitors will silently default to the US market instead
of being geo-routed to their real one.

Mitigated only for **signed-in** visitors: this branch adds
`User.preferredCountry`, persisted via `POST /api/account/country` and
reconciled in `CountryProvider` (see #6 below), so a returning signed-in user
still lands on their real market regardless of what the geo header says.
Anonymous visitors get no such correction until a geo-IP lookup service is
chosen and wired into `/api/geo`, resolving the visitor's real IP (available
via `x-middleton-ip` or `x-forwarded-for`, same as `rate-limit.ts` now reads)
to a country. Deliberately not built in this pass — it's a real ongoing
cost/ToS decision (which provider, rate limits, pricing) — and is worth
revisiting once real traffic volume through Ezoic is known.

### 6. Verify the ad script renders once DNS has actually cut over

Once nameservers have propagated, load the site through Ezoic and confirm:
`view-source:` shows the Ezoic header script tags (`cmp.gatekeeperconsent.com`,
`www.ezojs.com`, `ezoicanalytics.com`) in `<head>`, and the browser console has
no CSP violations for those origins (the CSP is currently Report-Only —
`Content-Security-Policy-Report-Only` in `next.config.js` — so nothing would
actually be blocked yet, but a clean report matters before ever promoting it
to enforcing).

---

## What this branch already did (no action needed)

- **`src/lib/rate-limit.ts`** — `clientIp()` now prefers Ezoic's
  `x-middleton-ip` header (the real visitor IP, unaffected by the proxy hop),
  falling back to `x-forwarded-for` then `x-real-ip`.
- **`next.config.js`** — added Ezoic's confirmed script-src origins
  (`cmp.gatekeeperconsent.com`, `the.gatekeeperconsent.com`, `www.ezojs.com`,
  `ezoicanalytics.com`) to the Report-Only CSP, alongside the existing Google
  AdSense allow-list (kept, not removed — `NEXT_PUBLIC_AD_NETWORK=adsense`
  still works with no other changes).
- **`src/lib/ezoic.ts` + `src/components/EzoicLoader.tsx`** — the Ezoic
  standalone header script, gated by `NEXT_PUBLIC_AD_NETWORK`, mirroring the
  existing `lib/adsense.ts` / `AdSenseLoader.tsx` structure so the two networks
  can be swapped by env var alone.
- **`src/components/AdSenseLoader.tsx`** — now gated off when
  `NEXT_PUBLIC_AD_NETWORK !== "adsense"` (previously unconditional). The
  underlying AdSense integration (client id validation, CSP origins, ads.txt
  derivation) is untouched — flipping the env var back is the entire rollback.
- **Signed-in country persistence** — `prisma/schema.prisma` gained
  `User.preferredCountry`; `POST /api/account/country` persists it;
  `/api/me` returns it; `CountryProvider` adopts it on load and backfills it
  the first time a signed-in account is seen with none set. Requires a
  `prisma db push` (additive) before the field is usable in production — see
  `.github/workflows/maintenance.yml`'s `db-push` task.
