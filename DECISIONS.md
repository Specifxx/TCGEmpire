# SEO backlog closeout — 2026-08-17

One autonomous pass over the open items from `GROWTH-AUDIT.md` (2026-08-10) /
`GROWTH-SUMMARY.md`. Per the brief: those docs' own numbers were not trusted —
both instruments were re-run against **live production** first, and every fix
below is scoped to what that fresh run actually showed, not to stale figures
in either doc.

---

## 1. Fresh-vs-committed diff (the actual task list)

```
npx tsx scripts/content-quality.ts   --url https://riftcompare.com
npx tsx scripts/template-seo-check.ts --url https://riftcompare.com
```

`template-seo-check.ts`: **passed clean**, all 15 templates (exit 0) — canonical,
complete OpenGraph and required structured data on every one, 1,403-page card
template included. Nothing to fix here; the OpenGraph work described in
`GROWTH-SUMMARY.md`'s commit 5 is genuinely live.

`content-quality.ts`: 1,759 URLs crawled (up from the committed run's 1,698 —
the sitemap has grown), **130 rows flagged** vs. 84 in the committed CSV.
Diffed key-for-key (path × issue) against the committed `content-quality-report.csv`:

- **53 new rows**, **6 resolved rows**, rest unchanged.
- Every new row was individually investigated against production (not assumed) —
  see §2. None required a code change.
- The 6 resolved rows (2 Poppy printings' near-duplicates, and `THIN_EDITORIAL`
  clearing on `/browse`, `/keywords`, `/marketplace`, `/sealed`) needed no action —
  they're improvements already live, not regressions to chase.

The refreshed `content-quality-report.csv` in this repo **is** this run — same
convention `GROWTH-SUMMARY.md` established.

## 2. What the new rows actually were, and why none needed a fix

| New rows | Count | Verdict |
|---|---:|---|
| `/keywords/*` `THIN_EDITORIAL` | 21 | **Same already-documented, human-blocked issue, at new scale.** The keyword template grew from 3 pages (audit time) to 30 — same "definition + card grid" shape, same fix requirement: `lib/keywords.ts`'s DATA-ACCURACY RULE forbids writing rules content without verified official source text. Still needs a human to supply it or sign off. |
| Rune-card & promo `NEAR_DUPLICATE_DESCRIPTION` (`body/chaos/fury/mind/order-rune-{sfd,unl}-r0Na`/`b`, `blade-twirler-ven-002` base/promo) | 24 | **Verified, not assumed, still true.** Fetched live descriptions for several pairs. Rune `a`/`b` variants: `printingKind()` in `card-narrative.ts` deliberately maps both variant codes `a` and `b` to the same `"alternate-art"` kind (`VARIANT_LABELS`) — there's no distinct human-readable name for "which alt-art", so the near-dup detector (which drops digits, and single-char tokens after the collector-number suffix is stripped) sees identical words. Blade Twirler base/promo: the description quotes the card's own rules text verbatim (must, for accuracy) — the word "Promo" IS present and differentiating, just not enough of the sentence to clear the 0.9 Jaccard bar. Padding either would mean inventing print-variant names that don't exist, or altering quoted game text — both wrong. Left alone, matching the brief's own instruction and the doc's prior conclusion. |
| `marketplace/seller` `THIN_EDITORIAL` + `EMPTY_SECTION` (2 new sellers) | 4 | **Expected shape for tiny inventory, plus a detector limitation.** Both sellers have real, personalized titles/descriptions (the 2026-08-12 fix is live and correct) — one has 7 listings, one has 1. `THIN_EDITORIAL` is the same accepted shape as a low-inventory `/stores/[slug]` page (already documented as "thin, but deliberately gated"). `EMPTY_SECTION` flagged the seller-name `<h1>` because the shipping/rating info directly under it is marked up as `<span>` chips, not `<p>/<li>/<dd>` or `<a href>/<img>` tiles — the same class of detector false-positive `GROWTH-SUMMARY.md` already documents for 19 other rows ("mostly detector limits"). |
| `/guides/best-riftbound-cards`, `/browse`, `/sealed` `EMPTY_SECTION` | 4 | **Detector limitation, confirmed by inspecting live HTML.** A section-title heading immediately followed by another heading at the SAME level (not nested) owning the real content — the tool's own "container" exemption only looks for a nested sub-heading *within* the slice, but here the slice is ~0 chars because the next same-level heading starts immediately. `/sealed`'s "Secret Garden Box" is a product-tile `<h3>` whose wrapping `<a>`/`<img>` precede the heading rather than follow it, so the tile-counter (which only scans forward from the heading) undercounts. Real content exists in both cases; nothing is missing for a reader. |
| `/stores/suggest`, `/contact`, `/support`, `/marketplace/faq` `THIN_EDITORIAL` | 4 | **Correctly thin tool/form pages** — same accepted class as `/browse`, `/market` in the original audit ("filter interfaces... which is correct for what they are"). `/stores/suggest` is additionally mis-templated as `store` by content-quality.ts's own `test()` regex (`/stores/` prefix match), which is a pre-existing classification quirk, not a content defect. |

**Not touched, per the brief's explicit instruction**: `/sets/[set]` and
`/sets/[set]/gallery` near-duplicate descriptions — `SETS` still carries only
`{code, name, slug}`, no new differentiating data source exists, and the brief
was explicit not to pad copy to clear a linter.

## 3. What actually changed

1. **Verified the production deploy pipeline is healthy.** (Not part of the SEO
   backlog itself, but blocking — see the session's earlier deploy investigation:
   a stuck Preview-only deployment for a prior commit was diagnosed and resolved
   with a re-trigger push before this work started.)

2. **`src/components/nav-groups.ts` / `FooterNav.tsx` / `CinematicNavMenu.tsx` /
   `CommandLauncher.tsx` / `src/app/llms.txt/route.ts`** — Discord reachability.
   `Navbar.tsx`'s tablet-overflow fix (already in the code, comment intact) made
   the header's Discord icon `lg:grid` (desktop-only, ≥1024px) and claimed
   *"Discord is in the footer, so no link is lost."* **That claim was false**:
   `DISCORD_URL` was never actually added to `NAV_GROUPS`, which is what feeds
   the footer, the ⌘K launcher, and the phone/tablet overlay menu. Below 1024px
   — every phone and the entire 640-1023px tablet band the fix targets — Discord
   was reachable from nowhere. Fixed by adding a real `NAV_GROUPS` entry
   (`external: true`), and updating all three renderers plus the command
   launcher's keyboard handler to open an external link in a new tab instead of
   routing through `next/link`/`router.push` (which can't handle an absolute
   external URL). Also fixed `llms.txt`'s `abs()` helper, which would otherwise
   have mangled the new external href into
   `https://riftcompare.comhttps://discord.gg/...`.
   Verified empirically (Playwright, local dev server, real production data):
   **no horizontal overflow at 640/720/790px**, and the Discord link is present,
   visible and `target="_blank"` inside the overlay at all three widths.

3. **`scripts/mobile-check.ts`** — extended with a 640/720/790px tablet
   horizontal-overflow sweep (`TABLET_WIDTHS`), narrower in scope than the full
   375px audit (tap-target sizing is a phone concern; the regression that
   actually bit this site was overflow, not tap targets). Two representative
   pages (`/`, `/browse`) are checked per width, since the header that caused
   the original bug is a global component. `tests/ad-responsive.test.ts`'s
   comment referencing the old "375px only" gap was updated to stay accurate.

4. **`.github/workflows/seo-preview-gate.yml`** (new) — wires
   `content-quality.ts` and `template-seo-check.ts` into CI against the Vercel
   **preview** deploy for a PR. `ci.yml` stays exactly as documented (DB-free,
   network-free); this is a separate workflow because both instruments need a
   live running server to crawl, which `ci.yml`'s own header explicitly rules
   out. Triggers on GitHub's `deployment_status` event — the same Deployments
   API `probe-deploy.yml` already reads from — so no Vercel API token or new
   secret is needed; Vercel's GitHub App posts this automatically once a
   preview build finishes. `template-seo-check.ts` gates the check (exits
   non-zero on a real template defect); `content-quality.ts` stays report-only
   per its own header ("not a gate") — it only fails the job if the crawl
   itself errors, and its CSV is uploaded as a build artifact.
   **Caveat**: this reacts to a real `deployment_status` webhook, which cannot
   be fired synthetically from this environment — the field names
   (`deployment.environment`, `deployment_status.state`,
   `deployment_status.environment_url`/`target_url`) follow GitHub's
   documented, widely-used contract for this exact pattern, but should be
   confirmed against the workflow's actual first run on a real PR.

5. **`tests/nav-discord-reachability.test.ts`** (new, 4 tests) — locks in the
   `external` flag on the Discord entry, the three renderers' branching, the
   launcher's `window.open` path, and `llms.txt`'s `abs()` guard.

## 4. Ship gate

- `tsc --noEmit`: clean.
- `eslint` (changed files): clean, zero warnings.
- `npm test`: 669 tests, 668 passing — the one failure (`ads-txt.test.ts`) is
  pre-existing and unrelated (reproduces identically on a clean checkout;
  an env-var artifact of this sandbox, not this change).
- `npm run build`: **passed, exit 0**, no warnings anywhere in the log — every
  route in the manifest built, including `/tools/best-basket`,
  `/keywords/[slug]` (30 pages incl. `/keywords/empower`), `/marketplace/*`.
- Tablet fix verified with a real headless-Chromium run against the local dev
  server (Playwright): **no horizontal overflow at 640/720/790px** on `/` or
  `/browse`, and the Discord link is present, visible, `target="_blank"`
  inside the phone/tablet overlay at all three widths.
- **Committed (`2891c0b`) and pushed to `main`.** This repo had multiple other
  sessions pushing to `main` concurrently during the ship window (3 unrelated
  commits landed within ~15 minutes of this one) — `2891c0b` is confirmed a
  strict ancestor of the current `main` HEAD, and a diff of every file this
  change touched between the commit right before it and the current HEAD
  shows zero overlap, so nothing here was reverted or clobbered.
- **Vercel deploy confirmed live** — not by matching this exact commit SHA to
  a deployment record (the rapid concurrent pushes meant Vercel's build queue
  moved past individual SHAs faster than `probe-deploy.yml` could catch one),
  but by direct evidence the new code is actually rendering: the literal link
  text "Join our Discord" (which only this change's `NAV_GROUPS` entry
  produces — the pre-existing header icon has no text, only an `aria-label`)
  appears **exactly 3 times** in production's homepage HTML, matching the 3
  places it should now render (`FooterNav`'s mobile accordion + desktop grid,
  `CinematicNavMenu`'s always-mounted overlay).
- **Smoke test**: `/`, `/keywords/empower`, `/card/jinx-loose-cannon-ogn-251-298`,
  `/browse`, `/sets/origins`, `/champions/jinx` — all **200**, no
  `Application error`/server-side-exception markers in any response body.
  Console-error verification against production itself was blocked by this
  environment's outbound-proxy rules for a Chromium-driven browser (curl
  through the same proxy works fine — a sandbox networking limit, not a site
  issue); this exact commit's client code was already verified console-clean
  via a real Chromium run against a local server serving the identical build
  before it shipped (see the tablet-overflow verification above), so this is
  corroborating rather than sole evidence.
- **No revert needed.**

## 5. Restated for the human: `GSC_SA_KEY`

Unchanged from `GROWTH-SUMMARY.md`: `.github/workflows/gsc-coverage.yml` is a
daily Search Console monitor that **no-ops until the `GSC_SA_KEY` repo secret
is set**. No exported Search Console data is committed, so no per-template
traffic ranking can be produced from the repo as it stands. One-line unblock:
set that secret and the existing workflow starts collecting — no code change
needed, and none was made here.

---

## What shipped, what didn't, what's left

**Shipped and live on production** (`2891c0b`, verified via direct content
fingerprint and a clean smoke test, no revert needed): a real Discord-
reachability bug found while re-verifying the tablet-overflow fix (Discord
was reachable from nowhere below 1024px despite a comment claiming otherwise
— now fixed in all three nav renderers plus `llms.txt`); a
640/720/790px overflow assertion added to `scripts/mobile-check.ts`; a new
`seo-preview-gate.yml` CI workflow wiring both audit instruments into PR
previews; the refreshed `content-quality-report.csv` from a live production
crawl; and one new test file locking in the Discord fix (4 tests, all
passing alongside the existing 665).

**Didn't change, on purpose**: no page content or template copy — every row
in the fresh `content-quality.ts` diff (§2) traced to either an
already-documented, human-blocked issue at greater scale, a genuinely
non-differentiable printing (verified fresh, not assumed), a detector
limitation in the instrument itself, or an expectedly-thin utility page.
Padding any of these to clear a linter would have made the copy worse, not
better, which the brief explicitly warned against.

**Left for a human**: the `GSC_SA_KEY` secret (§5) — one setting, unlocks
per-template traffic data for the next audit. The new `seo-preview-gate.yml`
workflow's exact GitHub `deployment_status` payload fields are standard and
well-documented, but untested against a real firing (no live PR+preview
cycle was available in this session) — worth a glance at its first real run.
The `content-quality.ts` `EMPTY_SECTION` false-positive pattern found on
`/guides/best-riftbound-cards`, `/sealed` and the new `marketplace/seller`
pages (adjacent same-level headings; a tile whose link precedes its heading)
is a real, reproducible gap in the instrument itself — not touched here to
keep this pass scoped, but worth a dedicated correction pass the same way the
instrument's own history describes three earlier ones.
