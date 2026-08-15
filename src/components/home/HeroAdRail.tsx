"use client";

import { useEffect, useState } from "react";
import { OutboundLink } from "@/components/OutboundLink";
import { AffiliateDisclosure } from "@/components/AffiliateDisclosure";
import { usePremium } from "@/components/PremiumProvider";
import { useCountry } from "@/components/CountryProvider";
import { affiliateUrl, ebayLabel, ebaySearchUrl } from "@/lib/affiliate";
import type { Country } from "@/lib/country";

// The two vertical affiliate rails either side of the homepage hero. Replaced
// the floating chase-card showcase that used to sit in these exact slots: the
// showcase was a decorative flourish that cost a serial Prisma round-trip on an
// ISR-cached page and earned nothing, and the geometry it had already proved out
// (240px wide, ~400px tall, 32px in from each edge, ≥1400px only) is the best
// above-the-fold inventory on the site sitting idle.
//
// ── WHAT RENDERS WHERE ──────────────────────────────────────────────────────
//   AU / NZ  →  eBay on BOTH sides (sealed left, singles right)
//   US / UK / SG / CA  →  TCGplayer left, eBay right
//   Premium subscribers  →  nothing, either side
//
// AU/NZ GET TWO eBAY UNITS, and that is a revenue decision, not a fallback.
// TCGplayer is a US marketplace: its sellers ship from the US, its prices are
// USD, and its shipping/import cost to Australia routinely exceeds the card. An
// AU or NZ visitor who clicks it lands somewhere that is almost never their
// cheapest option — a wasted click for them and a non-converting one for us.
// eBay AU is the marketplace they already shop on, New Zealand included: there
// is no eBay NZ and eBay AU ships there, which is why EBAY_DOMAIN in
// lib/affiliate.ts maps NZ onto ebay.com.au.
//
// But two identical banners either side of one hero reads as a broken template,
// so the pair is split by INTENT rather than duplicated: sealed/booster boxes on
// the left, singles on the right. Different copy, different search, and — the
// part that actually matters — a different EPN `source`, so reporting can say
// which of the two earned instead of merging both into one rc-au-…-search row.
// Both rails are /sch/ links on the same marketplace, so `source` is the ONLY
// thing that tells them apart downstream (ebayAffiliateUrl derives the customid's
// market and link-shape segments from the URL itself, and those are identical).
//
// ── WHY A LOCAL CREATIVE INSTEAD OF <EbayAd> / <TcgplayerAd> ────────────────
// Both of those are built for in-flow horizontal placements and neither can be
// made to behave in a fixed 240px rail:
//   • Their `size` union has no vertical entry, and adding one is a trap:
//     `const wide = size !== "rect"` would classify it wide, gating it at md
//     (768px) AND rendering the 320×100 MOBILE creative below that — the rails
//     must never appear on a phone or tablet at all. Those three lines are also
//     pinned byte-for-byte by tests/ad-responsive.test.ts, so the responsive
//     logic cannot be reshaped around a new variant.
//   • `size="rect"` clamps to 240 wide but keeps height:280 (maxWidth:100% only
//     caps width), and still emits its own sm:/md: visibility classes that fight
//     this wrapper's min-[1400px]:block.
//   • TcgplayerAd resolves its Impact creative id by EXACT width+height and
//     silently falls back to the 728×90 leaderboard id for anything unmatched,
//     so a 240-wide unit would report itself to Impact as a leaderboard — and
//     those click links carry no sharedid at all.
// So the panel below is a first-party portrait creative, and every URL it links
// to is built by the shared helpers in lib/affiliate.ts. Nothing here hand-rolls
// an affiliate URL.

// The ONE user-facing TCGplayer search/browse URL this repo has ever verified —
// the Riftbound product-line page (PartnersStrip links to the same string).
// TCGplayer's keyword-search query format appears nowhere in this codebase, so a
// hand-built `?q=…` link would be a guess that lands on an empty result page.
// The www host is load-bearing: affiliateUrl only rewrites hosts matching
// /(?:^|\.)tcgplayer\.com$/, so a partner.tcgplayer.com URL would pass straight
// through untagged.
const TCG_SEARCH_URL = "https://www.tcgplayer.com/search/riftbound-league-of-legends-trading-card-game/product";

// Height of the creative PANEL. The rail's TOTAL height is this plus the
// disclosure that flows underneath it, and the total is what has to match the
// ~400px band the chase-card showcase occupied — the clearance table further
// down describes that band, not this box.
//
// The disclosure is ~122 characters at text-[11px]/leading-snug (15.1px a line)
// in a 240px column, which greedy-wraps to three lines (~630px of text) and
// four if the rendered face runs wider than the estimate. So the unit lands at
// 340 + 4 + 45 = ~389px, or ~404px at four lines. Deliberately biased to the
// short side of 400–420: erring short pulls the band AWAY from the H1, erring
// long pushes it up toward the headline's first and longer line, which is the
// one the clearance table does not cover.
//
// Declared on the panel, NOT on the positioning wrapper. The showcase's first
// cut pinned the wrapper to h-[380px] with its content as `absolute inset-0`,
// and the content quietly overflowed — the price rendered below the bordered
// panel it belonged to. Here the panel is the fixed box and the disclosure is an
// ordinary sibling under it, so nothing can render outside its own border.
const PANEL_H = 340;

type RailUnit = {
  partner: "ebay" | "tcgplayer";
  href: string;
  // Separate retailer keys so the two placements are distinguishable in the
  // Vercel Analytics buy_click event; `kind` separates the two AU/NZ eBay rails
  // from each other there, the same way `source` does in EPN's reports.
  retailer: string;
  kind: "single" | "sealed";
  headline: string;
  destination: string;
  points: readonly string[];
  cta: string;
};

function ebaySinglesUnit(country: Country): RailUnit {
  return {
    partner: "ebay",
    href: ebaySearchUrl(country, "Riftbound TCG cards", "hero_rail_singles"),
    retailer: "ebay_hero_rail",
    kind: "single",
    headline: "Riftbound singles",
    // ebayLabel(), not a local map. Four components once kept private copies of
    // the eBay domain/label table and they had already drifted — EbayAd's was
    // missing SG and CA, so both markets were being sent to eBay Australia. The
    // label also knows why Singapore says a plain "eBay" (its clicks reroute
    // onto ebay.com; there is no EPN program for SG).
    destination: `on ${ebayLabel(country)}`,
    points: ["Every set, common to chase", "New, used & graded slabs", "Buy It Now or auction"],
    cta: "Search eBay →",
  };
}

function ebaySealedUnit(country: Country): RailUnit {
  return {
    partner: "ebay",
    href: ebaySearchUrl(country, "Riftbound booster box", "hero_rail_sealed"),
    retailer: "ebay_hero_rail",
    kind: "sealed",
    headline: "Sealed booster boxes",
    destination: `on ${ebayLabel(country)}`,
    // Every bullet has to be true of what `_nkw=Riftbound booster box` actually
    // RETURNS. eBay ANDs the keywords in a /sch/ query (see ebaySearchUrl), so
    // this search cannot surface a bundle or a starter deck — the earlier copy
    // promised "Bundles & starter decks" and the headline promised "bundles",
    // and the click landed on a result page without them. Broadening the query
    // to match the copy would have been the other fix, but it would blunt the
    // one thing that differentiates this rail from the singles rail beside it.
    points: ["Booster boxes & displays", "Factory-sealed, unopened", "Compare live seller prices"],
    cta: "Search eBay →",
  };
}

// Placement copy only — every fact that decides WHERE a click lands (the eBay
// domain, the marketplace rotation, the SG→US reroute, the Impact deep link)
// comes from lib/affiliate.ts. Only US/UK/SG/CA can reach this line at all,
// because AU and NZ get two eBay rails instead of a TCGplayer one. Wording is
// kept identical to TcgplayerAd's own tagline map so the site never makes two
// different shipping claims about the same partner in the same market.
function tcgShipping(country: Country): string {
  if (country === "US") return "Fast US shipping";
  if (country === "UK") return "Ships to the UK";
  return "Ships worldwide";
}

function tcgplayerUnit(country: Country): RailUnit {
  return {
    partner: "tcgplayer",
    // affiliateUrl(), never TcgplayerAd's click() helper — see the note at the
    // top of this file. This is also the only path that attaches a `sharedid`,
    // which is what makes this rail separable from the partners strip further
    // down the page. Arg 2 is the sub-id; arg 3 is the PAGE the link sits on and
    // affiliateUrl keeps only its first path segment, so "/" resolves to "home"
    // and the final sharedid is `tcgplayer_hero_rail-home`.
    href: affiliateUrl(TCG_SEARCH_URL, "tcgplayer_hero_rail", "/"),
    retailer: "tcgplayer_hero_rail",
    kind: "single",
    headline: "Riftbound singles & sealed",
    destination: tcgShipping(country),
    points: ["Every set, every rarity", "Seller ratings & conditions", "One cart, many sellers"],
    cta: "Shop TCGplayer →",
  };
}

// The portrait creative. Structurally the same house banner EbayAd/TcgplayerAd
// render — wordmark, headline, market line, CTA pill, "Ad" badge — laid out for
// a tall narrow box instead of a wide short one, with room for three supporting
// lines that a 90px leaderboard has no space for.
function RailPanel({ unit, country }: { unit: RailUnit; country: string }) {
  const ebay = unit.partner === "ebay";
  return (
    <div
      className={[
        "relative overflow-hidden rounded-2xl border shadow-[0_24px_60px_rgba(0,0,0,0.55)] backdrop-blur",
        ebay
          ? "border-[#e53238]/30 bg-gradient-to-b from-ink-900 via-[#1a1012] to-ink-900"
          : "border-sky-500/30 bg-gradient-to-b from-ink-900 via-[#0d1828] to-ink-900",
      ].join(" ")}
      // Fixed box = zero CLS, and an explicit height rather than a
      // content-derived one because the hero's absolute slots have no flow to
      // push against. Width comes from the w-[240px] wrapper below so there is
      // exactly one source of truth for it.
      style={{ height: PANEL_H }}
    >
      <OutboundLink
        href={unit.href}
        retailer={unit.retailer}
        country={country}
        kind={unit.kind}
        className={`absolute inset-0 flex flex-col items-center justify-center gap-4 px-4 text-center transition-colors ${
          ebay ? "hover:bg-white/[0.03]" : "hover:bg-sky-500/5"
        }`}
      >
        {/* Everything inside the anchor is a <span>: OutboundLink renders a real
            <a>, and keeping its interior to phrasing content means this panel
            stays valid markup wherever it is dropped. Same reason EbayAd's
            banner interior is spans rather than divs. */}
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Riftbound TCG</span>

        <span className="text-2xl font-extrabold leading-none tracking-tight">
          {ebay ? (
            <>
              <span className="text-[#e53238]">e</span>
              <span className="text-[#0064d2]">b</span>
              <span className="text-[#f5af02]">a</span>
              <span className="text-[#86b817]">y</span>
            </>
          ) : (
            <span className="text-white">
              TCG<span className="text-sky-400">player</span>
            </span>
          )}
        </span>

        <span aria-hidden className="h-px w-8 bg-white/10" />

        <span className="leading-tight">
          <span className="block text-[13px] font-semibold text-slate-200">{unit.headline}</span>
          <span className="mt-1 block text-[11px] text-slate-400">{unit.destination}</span>
        </span>

        <span className="flex flex-col gap-1 text-[11px] text-slate-400">
          {unit.points.map((p) => (
            <span key={p} className="flex items-center justify-center gap-1.5">
              <span
                aria-hidden
                className={`h-1 w-1 shrink-0 rounded-full ${ebay ? "bg-[#e53238]/70" : "bg-sky-400/70"}`}
              />
              {p}
            </span>
          ))}
        </span>

        <span
          className={`rounded-md px-3 py-1.5 text-[11px] font-bold ${
            ebay ? "bg-[#0064d2]/20 text-sky-300" : "bg-sky-500/15 text-sky-300"
          }`}
        >
          {unit.cta}
        </span>
      </OutboundLink>

      {/* Outside the anchor so it can never be mistaken for part of the offer,
          and pointer-events-none so it never eats a click. Same badge markup the
          other two house creatives carry. */}
      <span className="pointer-events-none absolute left-1 top-1 rounded bg-ink-950/70 px-1 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
        Ad
      </span>
    </div>
  );
}

export function HeroAdRail({ side }: { side: "left" | "right" }) {
  // EVERY HOOK BEFORE EVERY EARLY RETURN, deliberately.
  //
  // usePremium() is a useContext whose value flips false → true one render after
  // /api/me resolves (PremiumProvider defaults the context to false so SSR and
  // the first client render agree). A component that returned null on premium
  // BEFORE calling useCountry/useState/useEffect would call four hooks on the
  // first render and one on the next, and React throws "Rendered fewer hooks
  // than expected" — a crashed page for every subscriber, not a misrender.
  // EbayAd and TcgplayerAd get away with `if (usePremium()) return null` only
  // because it is the first and only hook either of them calls; this follows
  // AdSlot's pattern instead: all hooks, then the gates.
  const { country } = useCountry();
  const premium = usePremium();
  // HYDRATION: nothing market-specific may exist in the cached HTML.
  //
  // page.tsx is ISR-cached (revalidate = 3600) and layout.tsx mounts
  // <CountryProvider initial={DEFAULT_COUNTRY}> with a literal constant, so the
  // server render and the first client render both compute country === "US" for
  // every visitor on earth. Branching on country there is not a hydration
  // MISMATCH — both sides agree on "US" — it is worse in practice: an Australian
  // visitor would get a TCGplayer rail baked into the cached HTML and watch it
  // become an eBay rail a frame later, on the one placement whose entire premise
  // is that AU/NZ never see TCGplayer.
  //
  // So the rail renders nothing until it has mounted, and it costs nothing to do
  // so: the wrapper is position:absolute and display:none below 1400px, so a
  // pre-mount null shifts no layout and produces no CLS. For a returning visitor
  // the country cookie is read synchronously inside CountryProvider's own mount
  // effect and React batches both effects' state updates into one re-render, so
  // the first rail ever painted is already the correct one. The one case that
  // still resolves late is a first-EVER visitor with no cookie, who is on the US
  // default until /api/geo answers — that fetch backfills the cookie, so it can
  // only happen once per browser, and it is the same deferral every other
  // localised surface on this page already has.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (premium) return null; // ad-free for Premium subscribers
  if (!mounted) return null;

  const dualEbay = country === "AU" || country === "NZ";
  // The right rail is always eBay singles; only the left one changes hands.
  const unit = side === "right" ? ebaySinglesUnit(country) : dualEbay ? ebaySealedUnit(country) : tcgplayerUnit(country);
  const isLeft = side === "left";

  // 1400px, and it is a MEASURED threshold inherited from the chase-card
  // showcase this replaced — not a guess, and not something to re-derive from
  // the container. The naive bound is the H1's own container, a centred
  // max-w-4xl (896px) block, which would force the cut to 2xl (1536px) and hide
  // the rails from every 1440px laptop and every 1512px MacBook Pro. But the
  // container is not what collides: the H1's actual rendered text is 874px
  // across two lines, each rail's vertical band is only ~400px tall and centred
  // on the SEARCH BAR, and the only H1 line inside that band is the second,
  // shorter one.
  //
  // Measured horizontal gap from that line to the nearer rail edge, forcing the
  // rails visible at each width (Chromium, Range.getClientRects over the H1's
  // text nodes, so glyph extents rather than box edges). The composition is
  // symmetric, so both sides clear by the same amount:
  //
  //   1280 →  27px    1366 →  67px    1400 →  87px    1440 → 107px
  //   1512 → 143px    1600 → 187px    1920 → 347px
  //
  // Nothing intersects even at 1280; the cut is at 1400 so the clearance is
  // comfortable rather than a near-miss. Subheadline and search bar are max-w-2xl
  // (672px) and never come close at any width. Keep the width at 240px and the
  // inset at 32px — change either and this table stops describing the page.
  //
  // The breakpoint is written as a LITERAL. Tailwind's JIT only emits classes it
  // can see in the source, and min-[1400px]:block exists in exactly this one
  // place repo-wide; built by interpolation it would never be generated and the
  // rails would render at every width, phones included.
  return (
    <div
      // No consumer today — the showcase's equivalent attribute had none either
      // — but the 1400px geometry above can only be re-verified by selecting
      // these elements in a real browser, so the handle stays.
      data-rc-hero-rail={side}
      className={[
        // top-1/2 + -translate-y-1/2 centres the WHOLE rail (panel + disclosure)
        // on the shell's midline, the same anchor the showcase used. Because the
        // disclosure hangs below the panel, the panel's own centre now sits
        // ~25px above that midline — so the visible creative reaches slightly
        // less far down than the old card did and about the same distance up.
        "pointer-events-none absolute top-1/2 hidden -translate-y-1/2 min-[1400px]:block",
        // 32px rather than 16px. Inherited from the showcase, where it was
        // calibrated against a ghost stack that fanned outward (rotated 6° and
        // pushed 18px out, widening its effective half-width to ~140px and
        // pushing the outer corner 14px past the viewport edge at a 16px inset).
        // These rails are flat and unrotated, so 32px is now a full 32px of true
        // edge clearance — kept because it is what makes the symmetric clearance
        // table above valid, not because the overflow maths still applies. Do
        // not add rotation or an outward transform here without redoing it.
        isLeft ? "left-8" : "right-8",
      ].join(" ")}
      // ABOVE the hero's text column (z-10), and that is a hit-testing
      // requirement, not a cosmetic preference.
      //
      // This was zIndex 5 — inherited verbatim from the chase-card showcase —
      // and at 5 the rails were unclickable. The foreground column at
      // CinematicHero.tsx is `container-app relative z-10`, i.e. `mx-auto w-full
      // max-w-[1400px]` (globals.css), and it is the shell's only in-flow child,
      // so its border box runs from max(0,(vw−1400)/2) to min(vw,(vw+1400)/2)
      // and spans the shell's full height — taller and wider than the rail band
      // in the same containing block. It has no background, but a transparent
      // HTML element still hit-tests across its whole border box (that is what
      // pointer-events:none exists to opt out of, which is why the decorative
      // background layer next to it sets exactly that). So at 1400px the column
      // covered 100% of both rails, and the click landed on the column: no
      // pointer cursor, no hover state, no navigation, no buy_click event, no
      // EPN click. Full coverage to 1464px, the centred CTA pill and wordmark
      // still covered to ~1704px, some overlap all the way to 1944px — i.e.
      // every 1440/1512/1536/1600/1680 laptop the clearance table below was
      // measured for.
      //
      // 20 is safe precisely BECAUSE of that table: the rails clear the nearest
      // H1 glyph by ≥87px at every width they render at, and the hero's own
      // interactive children (SearchBar and its z-50 dropdown, chips, stat
      // links, CTAs, region toggle) are all max-w-2xl-or-narrower and centred,
      // so they never reach the 240px gutters the rails occupy. Nothing is
      // obscured and no hero control loses a click. The shell itself is
      // `-translate-x-1/2`, and a transform creates a stacking context, so this
      // 20 is scoped to the hero and can never rise above site chrome.
      // Inline because Tailwind's default scale has no z-20 arbitrary need.
      style={{ zIndex: 20 }}
    >
      {/* pointer-events-auto is load-bearing but NOT sufficient on its own: the
          wrapper above disables hit testing, and without re-enabling it here the
          banners would render perfectly and be completely unclickable. The
          zIndex note above is the other half of the same invariant — both are
          required, and neither is visible to the build, lint, the tests or the
          adsense guard. */}
      <div className="pointer-events-auto w-[240px]">
        <RailPanel unit={unit} country={country} />
        {/* Each rail carries its OWN disclosure. The two sides are ~1100px apart
            at 1400px, so one shared line could not sit "clear and prominent" next
            to both (EPN Participation Requirements I.G. — see AffiliateDisclosure's
            header for the July 2026 flag that made this a rule rather than a
            preference). It renders on first paint, for every visitor who sees the
            link, and is never collapsed or hover-gated. */}
        <AffiliateDisclosure partner={unit.partner} tight />
      </div>
    </div>
  );
}
