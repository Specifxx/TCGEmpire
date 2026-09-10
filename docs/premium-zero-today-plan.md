# Premium: lead with "$0 today" everywhere, hold $14.99

## Context

Owner's report (2026-09-09): ~5 subscribers at $4.99, ~4 at $9.99 (fastest rate), too few since the 6 Sep raise to $14.99. Decision: **hold $14.99 for now** (DECISIONS.md's 2026-09-08 entry already set a 3-week hold with a $12.99 step-down rule; nothing here changes the price or any Stripe object). What changes is the *framing*: the number a free visitor sees first should be what they pay today, which with the 14-day card-gated trial is **$0** — not $14.99.

Today's commit `eb61697` already introduced `premiumZeroToday()` / `premiumFromLine()` (`src/lib/site.ts:84-95`), but "$0 today" only reached two places and is buried in both. Where $14.99 still leads:

| Surface | File | Today |
|---|---|---|
| Signed-out corner slide-in (largest audience) | `src/components/SignupPromoPopup.tsx:260-265` | "**$14.99**/month after your free trial · locked in for good" |
| `/premium` pricing cards | `src/app/premium/page.tsx:256-291` | Big "**$14.99** /month", tiny gold "Starts with a 14-day free trial". Signed-out visitors get no trial framing at all (`trialEligible` requires a user) and a bare "Sign in first →" CTA |
| Signed-in corner slide-in | `src/components/PremiumSlideIn.tsx:364-377` | "$0 today" exists but as an 11px grey footnote under the button |
| Gated-tool button | `src/components/PremiumButton.tsx:19` | "Upgrade now · $14.99/mo" |
| Premium dialog | `src/components/PremiumDialog.tsx:37,233-234` | **Bug:** `ZERO_DUE_TODAY = premiumZeroToday()` = "$0 today", then a second "due today" span → renders "$0 today due today" |

Honesty rules this repo enforces by test (`tests/access-tiers.test.ts`, `tests/signup-slidein.test.ts`): no fake scarcity/countdowns, a real price always visible, "card required" disclosed on the trial path, nothing grants Premium without checkout. Every change below keeps the real price in the same block as the $0.

Interpretation note: the transcript's "we just need a bursary ID" is read as "we just need to verify it" — so the plan adds a copy-version tag to the funnel events so before/after can be compared in GA4. If a Stripe coupon/price ID was meant instead, that is a separate follow-up (promo codes are already enabled at checkout: `allow_promotion_codes: true`).

**Execution model:** Sonnet, one pass, single commit, pushed directly to `main` (owner instruction; note `vercel.json` disables deploys for `claude/*` branches, so `main` is the only branch that goes live). CI on `main` runs `typecheck`, `lint`, `check-images`, `adsense-guard`, `npm test` — no build, no DB.

---

## Changes (in order)

### 1. `src/lib/site.ts` — two small additions

- `export function premiumZeroAmount(): string` → `` `${premiumCurrencySymbol()}0` `` (bare "$0" for headline numbers; `premiumZeroToday()` stays "$0 today" for inline lines). Place it next to `premiumZeroToday()` (line 93).
- `export const PREMIUM_COPY_VERSION = "zero-today-2026-09-09";` with a 2-line comment: bump when the price framing changes so GA4 funnel events can be split before/after. Attach it as `copy: PREMIUM_COPY_VERSION` to these existing `trackEvent` calls: `premium_slidein_shown` / `premium_slidein_click` (`PremiumSlideIn.tsx:199,248`), `signup_promo_shown` (`SignupPromoPopup.tsx:155`), `premium_checkout_started` (`PremiumCta.tsx:41`, `PremiumDialog.tsx:96`).

### 2. New `src/components/TrialPriceBlock.tsx` — the shared "$0 due today" headline

Presentational, no hooks (server + client safe, same rule as `AnnualPriceBlock.tsx`). Props: `plan: "monthly" | "annual"`, `trialDays: number`, `size?: "lg" | "sm"` (lg = `text-4xl`, sm = `text-3xl`, mirror AnnualPriceBlock).

Renders, centred:
```
[ $0 ] due today                      ← premiumZeroAmount(), num text-4xl font-extrabold text-white; "due today" text-sm text-slate-400
then $14.99/month after your 14-day free trial          ← monthly: `${PREMIUM_PRICE_AMOUNT}/${PREMIUM_PRICE_PERIOD}`
then $119.99/year (≈ $10.00/mo) after your 14-day free trial   ← annual: PREMIUM_ANNUAL_AMOUNT/PREMIUM_ANNUAL_PERIOD + premiumEffectiveMonthly()
[▼ Save 33%]                          ← annual only, reuse the exact badge markup from AnnualPriceBlock.tsx:30-34 (annualSavingPct())
```
Price text in the "then" line is `font-semibold text-slate-200`, rest `text-xs text-slate-400`. Do not add any countdown/scarcity text.

### 3. `src/components/PremiumDialog.tsx` — reuse the block, fix the doubled phrase

- Replace lines 230-245 (`{trialEligible ? (<div className="mb-3 text-center">…</div>) : …`) trial branch with `<div className="mb-3"><TrialPriceBlock plan={activePlan} trialDays={trialDays} /></div>`.
- Delete `ZERO_DUE_TODAY` (line 35-37) and the now-unused `premiumZeroToday` import if nothing else uses it.
- Keep the "Card required to start · cancel anytime before it converts." line (288) as is.

### 4. `src/app/premium/page.tsx` — $0 headline on both cards, and for signed-out visitors too

- Add `const trialAvailable = premiumTrialEnabled() && !already && (!user || !dbUser?.trialStartedAt);` next to `trialEligible` (line 164). Comment: a brand-new account has never trialed, so a signed-out visitor is trial-available by definition (same reasoning SignupPromoPopup.tsx:122-129 documents). Keep `trialEligible` for the signed-in checkout CTA.
- Monthly card header (lines 258-263): when `trialAvailable` render `<TrialPriceBlock plan="monthly" trialDays={PREMIUM_TRIAL_DAYS} />` instead of the `$14.99 /month` pair + "Starts with…" line; else keep the existing markup unchanged.
- Annual card header (275-277): when `trialAvailable` render `<TrialPriceBlock plan="annual" trialDays={PREMIUM_TRIAL_DAYS} />` instead of `<AnnualPriceBlock />` + "Starts with…"; else unchanged.
- Pass `trialAvailable={trialAvailable}` and `trialDays` to both `<PremiumCta>`s (see §5) so the signed-out state can pitch the trial.
- Footer note (line 439): condition on `trialAvailable` instead of `trialEligible` so signed-out visitors get the honest "needs a card and converts to $14.99/month after 14 days" sentence.
- Hero (234) already reads "Try every Premium tool free for 14 days — $0 today, then from $10.00/mo…". Leave it.
- JSON-LD `Offer.price` stays `priceNumeric` ($14.99) — schema price is the recurring price, not the trial.

### 5. `src/components/PremiumCta.tsx` — signed-out state sells the trial

Add prop `trialAvailable?: boolean` (default false). In the `!signedIn` branch:
- when `trialAvailable && trialDays > 0`: heading `Start your {trialDays}-day free trial`, link text `Create a free account →` (same `href="/login?next=/premium"`, same `btn-primary`), and a sub-line `text-[11px] text-slate-400`: `Free to sign up, no card needed · a card is required to start the trial, nothing is charged for {dayPhrase}.`
- else: existing "Ready when you are / Sign in first →" unchanged.
Signed-in branches unchanged (the disclosure at 86-89 already covers the trial).

### 6. `src/components/SignupPromoPopup.tsx` — mirror the slide-in's "$0 today" line

Replace the price `<p>` at 260-265 with the exact shape PremiumSlideIn uses (`PremiumSlideIn.tsx:364-377`):
```tsx
{PREMIUM_PRICE_AMOUNT ? (
  <p className="mt-2 text-[11px] text-slate-500">
    {trialAvailable ? (
      <><span className="text-sm font-extrabold text-white">{premiumZeroToday()}</span> · then {premiumFromLine()} · cancel anytime</>
    ) : (
      <><span className="font-bold text-white">{premiumFromLine()}</span> · {premiumLockInTail()}</>
    )}
  </p>
) : null}
```
Import `premiumZeroToday`, `premiumFromLine` from `@/lib/site`. Update the header comment (253-259) to say why: the number a signed-out visitor pays today is $0, and the real price follows in the same sentence. Keep `PREMIUM_PRICE_AMOUNT ? (` as the block opener (tests anchor on it).

### 7. `src/components/PremiumSlideIn.tsx` — promote the price above the button

Move the `{PREMIUM_PRICE_AMOUNT ? (…) : null}` block (364-377) to sit **between the chip row (331-341) and the CTA row (342-355)**, keep it centred, and make the lead number read as a price, not a footnote: trial branch `<span className="text-sm font-extrabold text-white">{premiumZeroToday()}</span>`, rest of the line unchanged (`· then {premiumFromLine()} · cancel anytime`); non-trial branch unchanged. Keep every helper call (`premiumZeroToday()`, `premiumFromLine()`, `premiumLockInTail()`) inside the block — `tests/premium-price-increase.test.ts:288-306` slices 600 chars from `{PREMIUM_PRICE_AMOUNT ? (`. Update the comment above the block (356-363) to note the 2026-09-09 move.

### 8. `src/components/PremiumButton.tsx` — trial-aware default label

Import `useMe` from `@/lib/use-me`. Default children become:
- `trialEligible && trialDays > 0` → `Start free trial <span className="font-semibold opacity-80">· {premiumZeroToday()}</span>`
- else → existing `Upgrade now · {PREMIUM_PRICE_LABEL}`.
Must still call `usePremiumDialog` and open the dialog (`tests/premium-price-increase.test.ts:239-252` pins this). Callers passing `children` (Navbar, CinematicNavMenu) are unaffected.

### 9. Tests

Update the two assertions that pin the old popup wording, and add one new file.

- `tests/access-tiers.test.ts:133` and `tests/premium-price-increase.test.ts:284`: replace the `trialAvailable \? " after your free trial" : ""` match with `assert.match(block, /premiumZeroToday\(\)/)` and `assert.match(block, /premiumFromLine\(\)/)`; keep the `premiumLockInTail()` match (it is still in the non-trial branch). Update the comment text accordingly.
- New `tests/premium-zero-today.test.ts` (same `read()`/regex style as `tests/premium-conversion.test.ts`):
  1. `premiumZeroAmount()` equals `` `${premiumCurrencySymbol()}0` ``.
  2. `TrialPriceBlock.tsx` has no `"use client"` and no `useState|useEffect|useMe` (must stay server-renderable) and uses `premiumZeroAmount()`, `PREMIUM_PRICE_AMOUNT`, `PREMIUM_ANNUAL_AMOUNT`, `premiumEffectiveMonthly()`.
  3. `PremiumDialog.tsx` renders `<TrialPriceBlock` and no longer contains `ZERO_DUE_TODAY` (the doubled "today due today" bug).
  4. `src/app/premium/page.tsx` defines `trialAvailable` with `(!user || !dbUser?.trialStartedAt)`, renders `<TrialPriceBlock plan="monthly"` and `<TrialPriceBlock plan="annual"`, and passes `trialAvailable={trialAvailable}` to `PremiumCta`.
  5. `PremiumCta.tsx` signed-out branch contains `Create a free account` and `no card needed`; no `premiumFromLine`-free "$0" claim without "card is required" in the same branch.
  6. `PremiumSlideIn.tsx`: the index of `{PREMIUM_PRICE_AMOUNT ? (` is **less than** the index of `onClick={accept}` (price now precedes the CTA).
  7. `PremiumButton.tsx` contains `premiumZeroToday()` and `usePremiumDialog`.
  8. `PREMIUM_COPY_VERSION` appears in `PremiumSlideIn.tsx`, `SignupPromoPopup.tsx`, `PremiumCta.tsx`, `PremiumDialog.tsx`.
  9. Honesty: none of the five touched components match `/only \d+ (left|spots|seats)/i` or `/expires? in/i`.

### 10. `DECISIONS.md` — append after the 2026-09-08 entry

`## Premium framing: "$0 today" leads everywhere (2026-09-09)` — 10-15 lines: owner's numbers ($4.99→5, $9.99→4, $14.99 lagging), price held per the existing 3-week rule, the five surfaces changed and why a signed-out visitor counts as trial-available, the dialog bug fixed, `PREMIUM_COPY_VERSION` as the before/after key, and what to read in a week: `premium_slidein_click` / `signup_promo_shown` → `sign_up` → `premium_checkout_started` split by `copy`, plus trial starts on `/admin/subscriptions`.

---

## Files touched

`src/lib/site.ts`, `src/components/TrialPriceBlock.tsx` (new), `src/components/PremiumDialog.tsx`, `src/app/premium/page.tsx`, `src/components/PremiumCta.tsx`, `src/components/SignupPromoPopup.tsx`, `src/components/PremiumSlideIn.tsx`, `src/components/PremiumButton.tsx`, `tests/access-tiers.test.ts`, `tests/premium-price-increase.test.ts`, `tests/premium-zero-today.test.ts` (new), `DECISIONS.md`.

Not touched: any price constant, Stripe env/price IDs, `src/lib/articles.ts` blog copy, `src/lib/email.ts`, checkout/webhook routes, `AnnualPriceBlock.tsx` (still used in the non-trial branches).

## Verification (Sonnet runs all of this before pushing)

```
npx prisma generate
npm run typecheck
npm run lint
npm test            # uses the committed .env.production; all of tests/*.test.ts must pass
```
Then re-read the diff for: every "$0" sits in the same block as the real price and a card-required note; no new hardcoded "$14.99"/"$10" strings (only constants/helpers); `TrialPriceBlock` has no hooks.

Commit as one commit (e.g. `Premium: lead with "$0 today" on every surface, fix dialog's doubled "today"`), `git push -u origin main`. After Vercel deploys, spot-check signed out: `/premium` shows "$0 due today" on both cards with "Create a free account →", and the corner card shows "$0 today · then from $10.00/mo…". Signed in as a never-trialed free account: the same, with "Start 14-day free trial →".

## Follow-ups (not in this pass)

- After ~1 week compare `premium_checkout_started` and sign-ups by `copy` value in GA4 against the week before.
- If trial starts stay low, the next cheapest experiment is a Stripe-only change: an annual price near $99 ("$8.25/mo") or a first-month promotion code — checkout already accepts promo codes, no code needed.

## Provenance

Planned 2026-09-09 from the owner's report; committed here so an execution session can be started with: *"Execute docs/premium-zero-today-plan.md in one pass and push to main."*
