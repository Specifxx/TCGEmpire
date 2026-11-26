# Store vetting: how a store gets onto a Compare Empire site, and stays there

Owner, 2026-11-02, after a visitor asked how we keep buyers away from fake shops.
Applies to every site (RiftCompare, OP, MTG, DexCompare, Gundam, Lorcana, YGO,
Cyberpunk, Wargame, Figure, KaeYoung, CamCompare, Compare Empire). Each site has a
public `/how-we-pick-stores` page saying the same in plain words.

## Before a store is added (by hand, in the PR that adds it)

Every store is a line in its site's registry, added in a reviewed PR after a probe
from an Actions runner. The PR description answers each of these:

1. **Established domain.** Look the domain up (RDAP, `https://rdap.org/domain/<domain>`).
   Under a year old: list it only with a second sign below (reviews, community) and a
   real contact page. Under three months: don't list it yet.
2. **A business you can reach.** A business or trading name, a real email or phone
   (a physical address for a local game store), and its own refund and shipping
   policies. Where the country has a public register, check it: Australia's ABN
   Lookup (abr.business.gov.au), the UK's Companies House, NZBN, Canada's
   corporations search.
3. **Known to other buyers.** Reviews on Trustpilot or Google with a fair rating, or
   known in the community: an official store locator (the Riftbound UVS registry,
   Wizards' store locator, Bandai/Ravensburger/Konami/Games Workshop stockists),
   another sister site's list, or players recommending it.
4. **We can read its prices from its own shop**, in its own country's currency, and
   its listings match exactly (each site's matcher; a wrong match is worse than none).
5. **Never:** open marketplaces' sellers, drop-shippers, copycat stores (same stock and
   prices under another name), sites that only take bank transfer or crypto, and
   anything on `data/store-vetting/banned.json`.

## After it is listed (automatic)

- **Weekly outside check** (`scripts/store-vetting.mjs`, `store-vetting.yml`, Mondays
  03:41 UTC): reads every site's registry from its repo and checks every store domain.
  RED (the run fails and GitHub emails the owner): banned, dead (does not resolve,
  refuses or answers 404/410/500, and still does after a pause, with neither its
  `/products.json` nor its robots.txt answering; 2026-11-18; a gateway 502/504/52x from
  the shop's CDN is "unknown", never dead, 2026-11-26), parked or for sale, or a domain under a year old
  whose home page shows no contact or policy link and whose usual contact and policy
  pages (`/pages/contact`, `/contact`, `/policies/refund-policy`…) do not exist either. LOOK (one "Store vetting" issue
  here): redirects to a different domain, young domain, no contact link, no domain
  of its own (a myshopify.com address). Bot protection is never worked around: a
  store that blocks the check is "unknown", never failed. Trustpilot refuses
  automated checks, so reviews stay a hand check.
- **Too-cheap prices are dropped at import, on every site** (each site's own rule):
  - RiftCompare: a store single under 25% of TCGplayer's US market (from US$2,
    damaged copies exempt, `lib/price-sanity.ts`); sealed floors (`sealedFloorCents`).
  - OP Compare: singles under 30% of TCGplayer's market (from US$3), sealed under 50%.
  - Gundam, Lorcana, YGO, Cyberpunk: under a quarter (or over four times) TCGplayer's.
  - MTG Compare, DexCompare: in-stock prices under 25% of the other stores' median
    (3+ stores); a store with 5+ prices under half the market is written as sold out.
  - WargameCompare: under 40% of RRP or 45% of the stores' median.
  - FigureCompare, KaeYoung: under 40% of the median of 3+ stores; barcode matching only.
  - CamCompare: a new item under 40% of its launch price.
  - Compare Empire: under 55% of the median of 3+ stores.
- **Visitor reports:** every site's "Report a wrong price" form has "I don't trust this
  store / had a problem ordering" (`store-problem`; `STORE_UNTRUSTED` on Rift and OP),
  and `/how-we-pick-stores` has a "Report a store" form. The daily `reports-triage.yml`
  puts these first.

A store a person has checked by hand (a young domain with a strong second sign, or a
custom shop whose contact details load in the browser) goes on
`data/store-vetting/verified.json` with the date and the reason.

## When a store fails

Remove it from every site that lists it (the issue names them) in one PR per repo.
A store that took money and didn't ship, or is a copy of another shop, also goes on
`data/store-vetting/banned.json` (and, on MTG and DexCompare, `BLOCKED_STORES`).
A store that moved to a new domain is re-checked under the new name before its
registry entry is updated.

## Scam sweep: scoring, AI reading and the shared denylist (owner, 2026-11-16)

Started by a visitor finding TCGShopUK (Trustpilot 2.2, 86% one-star, non-delivery) on MTG Compare. `scripts/scam-sweep.mjs`
(`scam-sweep.yml`, Mondays 04:41 UTC) scores every store host on every site (13 registries plus TCG Prices and
WaxCompare): banned list, visitor reports (`store-problem` issues), review evidence (`data/store-vetting/review-evidence.json`,
entered by hand or an agent browser because Trustpilot refuses runners), domain age, no contact, WhatsApp/crypto/gift-card
payment, fees after checkout, and an AI reading of the shop's home page (secret `SCAM_AI_KEY`, Haiku, at most 60 pages a run,
riskiest first; no key = no AI points). A store is hidden at score 70 or more WITH two independent signal groups; one noisy
signal only ever puts it on watch. A verified store (verified.json) never goes above watch.

- `denylist.json` is the file sites read: banned + auto-hidden - overrides. `scam-scores.json` has every score and reason;
  `scam-log.jsonl` logs every hide, restore and change. This repo is public: domains and reasons only.
- Rollback: repository variable `SCAM_AUTOHIDE=0` (report only; banned stays), or a domain in `overrides.json`
  (a banned store is never overridden).
- Sites consume the denylist at import (follow-up per site; MTG, Dex and TCG Prices also keep their own blocklists).
