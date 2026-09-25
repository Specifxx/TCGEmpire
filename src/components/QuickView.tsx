"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { CardTileData } from "./CardTile";
import { CardImage } from "./CardImage";
import { DomainBadge, RarityBadge, VariantBadge, OvernumberedBadge, PromoBadge, SignatureBadge, CrystalRoseBadge } from "./Badge";
import { PriceWatchButton } from "./PriceWatchButton";
import { isFallbackRetailer, displayRarity, isUltimate, isOvernumbered, isSignature, isCrystalRose, normaliseCondition, CONDITIONS, cardmarketRetailerFor } from "@/lib/constants";
import { COUNTRIES } from "@/lib/country";
import { tcgReferenceRows } from "@/lib/tcg-reference";
import { TcgMarketPrice } from "./TcgMarketPrice";
import { CardmarketPrice } from "./CardmarketPrice";
import { cardHref } from "@/lib/card-url";
import { cardDisplayName, cardSearchName } from "@/lib/card-name";
import { effectiveShippingCents, shippingPolicyUrl } from "@/lib/retailers";
import { affiliateUrl, ebayLabel, ebaySearchUrl as buildEbaySearchUrl, outboundRel, isPaidLink } from "@/lib/affiliate";
import { OutboundLink } from "./OutboundLink";
import { ReportPriceButton } from "./ReportPriceButton";
import { EbayAdCarouselLive, type AdListing } from "./EbayAdCarouselLive";
import { EbayTabs, type EbayTab } from "./EbayTabs";
import { EbayGradedLive, type GradedRow } from "./EbayGradedLive";
import { AffiliateDisclosure, PaidLinkTag } from "./AffiliateDisclosure";
import { timeAgo } from "@/lib/format";
import { buyButtonClass, buyButtonLabel } from "./CardMarketSection";
import { useCountry } from "./CountryProvider";
import { PriceChart } from "./PriceChart";
import type { PricePoint } from "@/lib/price-history";
import { Dialog } from "./ui/Dialog";
import { Spinner } from "./ui/Skeleton";
import { pushRecentCard } from "@/lib/recently-viewed";
import { cardImageSrc } from "@/lib/card-image-url";

interface RetailerPrice {
  id: string;
  retailer: string;
  retailerName: string;
  priceCents: number;
  shippingCents: number | null;
  condition: string | null;
  url: string;
  inStock: boolean;
  country: string;
  isFoil: boolean;
  lastSeen?: string;
}

const Ctx = createContext<{ open: (card: CardTileData) => void }>({ open: () => {} });
export const useQuickView = () => useContext(Ctx);

export function QuickViewProvider({ children }: { children: React.ReactNode }) {
  const [card, setCard] = useState<CardTileData | null>(null);
  const pushedRef = useRef(false);
  // The last card shown, kept around through a close so the panel still has
  // something to render WHILE Dialog's exit transition plays — `card` itself
  // goes null the instant close() runs, but the fade-out needs a frame or two
  // of real content behind it, not a blank panel.
  const lastCardRef = useRef<CardTileData | null>(null);
  if (card) lastCardRef.current = card;
  const displayCard = card ?? lastCardRef.current;

  // Open the modal AND give it a shareable address: the URL bar becomes /card/slug
  // (via history, no navigation = no slow page load), so users can copy/share it,
  // the browser Back button closes the modal, and visiting that URL directly still
  // renders the full card page.
  const open = useCallback((c: CardTileData) => {
    setCard(c);
    const url = cardHref(c);
    if (typeof window !== "undefined" && window.location.pathname !== url) {
      window.history.pushState({ quickView: true }, "", url);
      pushedRef.current = true;
    }
    // Fired from every CardTile on the site, so this is a genuinely high-volume
    // event by design — it's the main engagement signal for "which cards do
    // people actually stop to look at", distinct from search/view counts
    // (which mix quickview opens with full page loads and API traffic).
    trackEvent("quickview_open", { card: c.slug ?? c.id });
    // The other writer of the recently-viewed rail — see CardViewBeacon for
    // the card page's own call and why imageSrc must go through the helper.
    pushRecentCard({
      id: c.id,
      slug: c.slug,
      name: c.name,
      setCode: c.setCode,
      collectorNumber: c.collectorNumber,
      imageSrc: cardImageSrc(c),
    });
  }, []);

  const close = useCallback(() => {
    setCard(null);
    if (pushedRef.current) {
      pushedRef.current = false;
      window.history.back(); // restore the previous URL
    }
  }, []);

  // Back/forward button: just close the modal (the URL has already changed).
  useEffect(() => {
    const onPop = () => {
      pushedRef.current = false;
      setCard(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return (
    <Ctx.Provider value={{ open }}>
      {children}
      <Dialog open={!!card} onClose={close} size="3xl" z="overlay" labelledBy="quickview-title">
        {/* Keyed by card so switching cards remounts the modal (resets
            collection state, prices and chart instead of leaking them across
            cards) — displayCard, not card, so the key stays stable through
            the close animation instead of unmounting mid-fade. */}
        {displayCard && <QuickViewModal key={displayCard.id} card={displayCard} onClose={close} />}
      </Dialog>
    </Ctx.Provider>
  );
}

function QuickViewModal({ card, onClose }: { card: CardTileData; onClose: () => void }) {
  const [prices, setPrices] = useState<RetailerPrice[] | null>(null);
  const [adListings, setAdListings] = useState<AdListing[]>([]);
  const [graded, setGraded] = useState<GradedRow[]>([]);
  const [ebayCheckedAt, setEbayCheckedAt] = useState<string | null>(null);
  const [history, setHistory] = useState<PricePoint[] | null>(null);
  const [coll, setColl] = useState<"idle" | "saving" | "added" | "signin" | "error">("idle");
  const [collFoil, setCollFoil] = useState(false);
  // Which eBay tab the visitor has picked, null until they pick one. Controlled
  // for the same reason EbayCardPanelLive is — see that file's header: `graded`
  // arrives from a fetch, so the uncontrolled default would already have seeded
  // itself from the only tab that existed at first render (Listings), and a
  // chase card whose only live copies in this market are slabs would open on
  // the generic "search eBay" CTA as if we had found nothing.
  const [ebayTab, setEbayTab] = useState<string | null>(null);
  const href = cardHref(card);
  const { country, currency, fmt, price } = useCountry();
  const lowest = price(card);

  async function addToCollection() {
    setColl("saving");
    try {
      const res = await fetch("/api/collection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: card.id, isFoil: collFoil }),
      });
      if (res.status === 401) return setColl("signin");
      if (!res.ok) return setColl("error");
      setColl("added");
      trackEvent("collection_add", { card_id: card.id, is_foil: collFoil });
    } catch {
      setColl("error");
    }
  }

  useEffect(() => {
    let alive = true;
    const ref = card.slug ?? card.id;
    // A different card (or market) is a different tab question; the previous
    // card's pick must not carry over.
    setEbayTab(null);
    // Record the view (popularity signal) — fire-and-forget.
    fetch(`/api/card/${ref}/view`, { method: "POST", keepalive: true }).catch(() => {});
    fetch(`/api/card/${ref}`)
      .then((r) => r.json())
      .then((d) => { if (alive) { setPrices(d.retailerPrices ?? []); setAdListings(d.ebayAdListings ?? []); setGraded(d.ebayGradedListings ?? []); setEbayCheckedAt(d.ebayCheckedAt ?? null); } })
      .catch(() => { if (alive) setPrices([]); });
    // Region-specific price history (its own currency), keyed by URL for clean caching.
    fetch(`/api/card/${ref}/history?country=${country}`)
      .then((r) => r.json())
      .then((d) => { if (alive) setHistory(d.points ?? []); })
      .catch(() => { if (alive) setHistory([]); });
    return () => {
      alive = false;
    };
  }, [card, country]);

  // Rank by ITEM price — the cheapest card price is the "lowest price". Known postage
  // (eBay) is shown for transparency but must not change which listing is cheapest;
  // it only breaks ties. Unknown postage shows "at checkout" (never fabricated).
  const countryRows = (prices ?? []).filter((p) => p.inStock && p.country === country);
  // Converted reference prices (TCGplayer-UK/AU/SG, Cardmarket) are never shown as a
  // buyable "store" here, even when they're the only source for this market — they
  // aren't real local retailers, so presenting them as one is misleading (mirrors
  // lib/market-rows.ts's computeMarket, which the full card page uses).
  const inStock = countryRows
    .filter((p) => !isFallbackRetailer(p.retailer))
    .map((p) => {
      const ship = effectiveShippingCents(p.shippingCents); // number | null (null = unknown)
      return { ...p, ship, delivered: p.priceCents + (ship ?? 0) };
    })
    .sort((a, b) => a.priceCents - b.priceCents || a.delivered - b.delivered);

  // One entry per STORE for the report picker — in-stock and out-of-stock alike,
  // since "you list it as available and it isn't" is one of the issue types and
  // those are precisely the rows it applies to. Deduped by retailer: a store can
  // hold several rows (condition and foil are part of RetailerPrice's key) and
  // the picker asks which STORE is wrong, not which row.
  const reportable = (() => {
    const byRetailer = new Map<string, { listingId: string; retailer: string; retailerName: string }>();
    // NOT countryRows — that one is filtered to in-stock rows for the buy list.
    const all = (prices ?? []).filter((r) => r.country === country && !isFallbackRetailer(r.retailer));
    for (const p of all) {
      if (!byRetailer.has(p.retailer)) {
        byRetailer.set(p.retailer, { listingId: p.id, retailer: p.retailer, retailerName: p.retailerName });
      }
    }
    return [...byRetailer.values()];
  })();

  // TCGPLAYER REFERENCE PRICE. Asked for directly: the popup is where most
  // visitors actually compare prices, and it was the one surface carrying no
  // TCGplayer figure at all — the full card page has had this block for months.
  //
  // NOT a comparison row, and that distinction is a standing product rule rather
  // than a styling choice (constants.ts, "THE RULE"): TCGplayer's AU/UK/SG/CA
  // prices are its USD market price through an FX rate, so they must never sit in
  // the list above where they could undercut the real local stores this site
  // exists to compare. `inStock` still filters them out, untouched. This is the
  // labelled reference block, below the comparison, exactly as on the page.
  //
  // The selection rule is shared with CardMarketSection (lib/tcg-reference.ts)
  // instead of copied — see that file's header for the bug a second copy caused.
  // Costs no request: the USD row is already in the /api/card response the modal
  // fetches for the comparison list.
  const tcgRef = (() => {
    const ref = tcgReferenceRows(prices ?? [], country);
    if (!ref) return null;
    const src = ref.std ?? ref.foil;
    if (!src) return null;
    return {
      usdCents: ref.std?.priceCents ?? null,
      usdCentsFoil: ref.foil?.priceCents ?? null,
      // Raw url here, unlike the card page's pre-wrapped buyHref — same call the
      // comparison rows' buy buttons make.
      href: affiliateUrl(src.url, src.retailer),
    };
  })();

  // CARDMARKET REFERENCE PRICE, UK/EU only. Same reasoning as the TCGplayer block
  // above and the same shape, added for the same reason: "I'd use the app to check
  // faster on CardMarket prices" (user, 2026-09-19) — and the popup IS the fast
  // path, the surface a browse-page visitor compares on without ever loading a
  // card page. It carried a TCGplayer figure and no Cardmarket one, which for a
  // European visitor is the less useful of the two.
  //
  // Which retailer key belongs to which market comes from constants.ts rather
  // than being inlined here; see cardmarketRetailerFor's own comment for the
  // duplication bug that rule exists to prevent.
  //
  // Unlike TCGplayer there is no "already shown natively" suppression to do:
  // Cardmarket is always a fallback retailer, so it is never a row in the list
  // above. Costs no request — the row is already in the /api/card response.
  const cardmarketRef = (() => {
    const retailer = cardmarketRetailerFor(country);
    if (!retailer) return null;
    const row = (prices ?? []).find((p) => p.retailer === retailer && p.country === country);
    if (!row) return null;
    return { priceCents: row.priceCents, href: affiliateUrl(row.url, row.retailer), isEu: country === "EU" };
  })();

  // eBay quota fallback — mirrors the full card page (src/app/card/[id]/page.tsx).
  // Whenever this market has no live eBay row for the card, offer an
  // affiliate-tagged eBay search — a thin market must never be a dead end.
  // (Domain/label come from lib/affiliate.ts, not a local copy — this map
  // used to lack a CA entry, silently dropping the fallback for CA visitors
  // specifically.)
  const ebayMkt = { label: ebayLabel(country) };
  const gradedHere = graded.filter((g) => g.country === country);
  // The same filter EbayAdCarouselLive applies before falling back to the
  // generic CTA — "the Listings tab has nothing of its own in this market".
  const adListingsHere = adListings.some((l) => l.country === country);
  const hasEbay = (prices ?? []).some((p) => p.retailer.startsWith("ebay") && p.inStock && p.country === country);
  const ebaySearchUrl =
    prices !== null && !hasEbay
      ? buildEbaySearchUrl(country, `${cardSearchName(card.name, card)} Riftbound`, "quickview")
      : null;

  return (
    <div className="max-h-[88vh] overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 shadow-2xl">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-20 tap-icon  rounded-full bg-ink-950/80 text-slate-300 hover:text-white"
        >
          ✕
        </button>

        <div className="grid max-h-[88vh] gap-0 overflow-y-auto sm:grid-cols-[260px_1fr]">
          {/* Card image — shows instantly from the tile data. Capped on phones so the
              price comparison sits closer to the top (less scrolling on mobile). */}
          <div className="bg-ink-950/40 p-4">
            <CardImage card={card} full className="mx-auto aspect-[5/7] w-full max-w-[190px] sm:max-w-none" />
            {/* Plain anchor = a real navigation to the full page (the URL is already
                /card/slug via history, so this loads the full server-rendered page). */}
            <a href={href} className="btn-ghost mt-3 flex w-full justify-center text-sm">
              View full page →
            </a>
          </div>

          {/* Details + live prices */}
          <div className="min-w-0 p-5">
            <div className="flex flex-wrap items-center gap-1.5">
              <DomainBadge domain={card.domain} />
              <RarityBadge rarity={displayRarity(card)} />
              <span className="chip bg-ink-800 text-slate-300">{card.type}</span>
              <VariantBadge variant={card.variant} />
              <SignatureBadge show={isSignature(card.collectorNumber)} />
              <OvernumberedBadge show={isOvernumbered(card.collectorNumber) && !isUltimate(card.setCode, card.collectorNumber)} />
              <CrystalRoseBadge show={isCrystalRose(card.setCode, card.collectorNumber)} />
              <PromoBadge show={card.isPromo} />
            </div>
            {/* The title WRAPS and never ellipsises (2026-09-23; was `truncate`):
                the part that was cut is the printing qualifier — "(Showcase,
                Signature)" read "Showcas…" even at 1440 — and that is the only
                thing telling the Ahri printings apart. The row wraps too: the
                11rem basis lets the labelled Watch button drop under the title
                in the 640–767 band, where the details column is only ~346px
                (the modal goes side by side at sm), instead of squeezing the
                title to ~150px. Below sm the button is a 48px heart square. */}
            <div className="mt-2 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
              <div className="min-w-0 flex-1 basis-44">
                <h2 id="quickview-title" className="break-words text-lg font-extrabold text-white sm:text-xl">{cardDisplayName(card.name, card)}</h2>
                <p className="font-mono text-xs text-slate-500">{card.setName} ({card.setCode}) · {card.collectorNumber}</p>
              </div>
              <PriceWatchButton cardId={card.id} variant="responsive" />
            </div>

            <div className="mt-3 rounded-lg bg-ink-950/50 p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Cheapest price</div>
              <div className="text-2xl font-extrabold text-accent">
                {lowest != null ? fmt(lowest) : "—"}
              </div>
            </div>

            {/* Always-present eBay buy-path — the widest singles inventory in every
                market and our commission source; sits above the local comparison.
                Real live listings (image/price/free-shipping) when we have cached
                ones for this market, falling back to the generic search CTA
                otherwise (same behaviour as the full card page's carousel). */}
            {/* Tabs appear only for what this card actually has in this market,
                so an ordinary card shows exactly the compact carousel it always
                did with no tab chrome (EbayTabs hides the tablist for one tab).
                Chase cards gain a Graded tab.

                marketCents is derived here from the card's own price column
                rather than sent by the API: `price(card)` is already the
                visitor-market figure the modal displays above, so deriving it
                guarantees the "× raw" multiple cites the same number the user
                is looking at. */}
            <EbayTabs
              className="mt-3"
              label={`eBay listings for ${card.name}`}
              active={ebayTab ?? (!adListingsHere && gradedHere.length > 0 ? "graded" : "listings")}
              onActiveChange={setEbayTab}
              tabs={[
                {
                  key: "listings",
                  label: "Listings",
                  content: (
                    <EbayAdCarouselLive
                      listings={adListings}
                      query={cardSearchName(card.name, card)}
                      compact
                      bare
                    />
                  ),
                },
                ...(gradedHere.length > 0
                  ? [
                      {
                        key: "graded",
                        label: "Graded",
                        count: gradedHere.length,
                        content: (
                          <EbayGradedLive
                            listings={graded.map((g) => ({ ...g, marketCents: lowest ?? null }))}
                          />
                        ),
                      } satisfies EbayTab,
                    ]
                  : []),
              ]}
            />
            {/* One disclosure for the whole panel — every tab is affiliate-tagged
                and each inner component is rendered `bare` for that reason. */}
            <AffiliateDisclosure partner="ebay" tight />

            {/* Add to collection — track & value your whole collection in your profile */}
            <div className="mt-3 flex items-center gap-2">
              {coll === "signin" ? (
                <a href={`/login?next=${encodeURIComponent(cardHref(card))}&src=quickview`} className="btn-ghost flex-1 justify-center text-sm">Sign in to track your collection</a>
              ) : coll === "added" ? (
                <div className="flex flex-1 items-center justify-between rounded-lg border border-brand-500/30 bg-brand-500/10 px-3 py-2 text-sm">
                  <span className="font-semibold text-brand-300">✓ Added to your collection</span>
                  <button onClick={addToCollection} className="text-xs text-slate-300 hover:text-white">Add another +1</button>
                </div>
              ) : (
                <>
                  {/* btn-ghost, not btn-primary: the in-stock retailer buy buttons
                      above are the page's only primary (filled) CTA — this is a
                      secondary action and shouldn't compete with them visually. */}
                  <button onClick={addToCollection} disabled={coll === "saving"} aria-busy={coll === "saving"} className="btn-ghost flex-1 justify-center gap-1.5 text-sm">
                    {coll === "saving" && <Spinner size="sm" />}
                    {coll === "saving" ? "Adding…" : coll === "error" ? "Try again" : "＋ Add to collection"}
                  </button>
                  {/* The shared .btn base (2026-09-23) so the toggle gets the
                      same 44px / 48px-on-touch floor as the "Add to collection"
                      button beside it — it measured 65x36 next to a 48px one.
                      Its own px-3 and colour utilities still win over .btn;
                      aria-pressed says which state it is in. */}
                  <button
                    onClick={() => setCollFoil((f) => !f)}
                    title="Mark as foil"
                    aria-pressed={collFoil}
                    className={`btn shrink-0 px-3 ${collFoil ? "bg-gold/20 text-gold ring-1 ring-gold/40" : "bg-ink-800 text-slate-400 hover:text-slate-200"}`}
                  >
                    ✦ Foil
                  </button>
                </>
              )}
            </div>

            <div className="mt-4">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Price comparison</div>
              {prices === null ? (
                <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
                  <Spinner size="sm" />
                  Loading live prices…
                </div>
              ) : inStock.length === 0 ? (
                <div className="py-4 text-sm text-slate-500">
                  <p>No in-stock listings right now.</p>
                  {/* Never a dead end: a zero-stock modal still offers the
                      affiliate eBay search. */}
                  {ebaySearchUrl && ebayMkt && (
                    <>
                      <a
                        href={ebaySearchUrl}
                        target="_blank"
                        rel={outboundRel(ebaySearchUrl)}
                        className="btn-primary mt-3 inline-flex text-xs"
                      >
                        Search {ebayMkt.label} →
                      </a>
                      <AffiliateDisclosure partner="ebay" tight />
                    </>
                  )}
                </div>
              ) : (
                <ul className="divide-y divide-ink-800">
                  {inStock.slice(0, 6).map((p, i) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2 md:flex-nowrap">
                      {/* Wraps below md, with the buy button on its own
                          full-width line (2026-09-23): an inline button squeezed
                          store names to 51px at 390, and eBay's to 0px at 320.
                          md, not sm: the modal goes side by side at sm, so its
                          details column is only ~346px at 640–767, narrower
                          than a phone's, and with sm:flex-nowrap names there
                          measured 41–124px and truncated. The name row wraps
                          as well, so the shrink-0 "Cheapest" chip drops under a
                          long name instead of squeezing it to 0px. */}
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5 gap-y-0.5">
                          <span className="min-w-0 truncate text-sm font-semibold text-white">{p.retailerName}</span>
                          {i === 0 && inStock.length > 1 && (
                            <span className="chip shrink-0 bg-brand-500/20 text-[9px] font-bold uppercase tracking-wide text-brand-300">
                              Cheapest
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-slate-500">
                          {p.isFoil && <span className="font-semibold text-gold">✦ Foil</span>}
                          {(() => {
                            const grade = normaliseCondition(p.condition);
                            return grade ? (
                              <span title={p.condition ? `Store listed as "${p.condition}"` : undefined}>{CONDITIONS[grade].label}</span>
                            ) : (
                              p.condition && <span>{p.condition}</span>
                            );
                          })()}
                          {p.lastSeen && <span>updated {timeAgo(p.lastSeen)}</span>}
                          {isPaidLink(affiliateUrl(p.url, p.retailer)) && <PaidLinkTag />}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-bold ${i === 0 ? "text-accent" : "text-white"}`}>{fmt(p.priceCents)}</div>
                        <div className="text-[10px] text-slate-500">
                          {p.ship == null ? (
                            shippingPolicyUrl(p.retailer) ? (
                              <a href={shippingPolicyUrl(p.retailer)!} target="_blank" rel="sponsored nofollow noopener noreferrer" className="underline decoration-dotted hover:text-slate-300">
                                + postage ↗
                              </a>
                            ) : (
                              "+ postage"
                            )
                          ) : p.ship === 0 ? (
                            "free post"
                          ) : (
                            `≈ ${fmt(p.delivered)} del.`
                          )}
                        </div>
                      </div>
                      <OutboundLink
                        href={affiliateUrl(p.url, p.retailer)}
                        retailer={p.retailer}
                        country={country}
                        cardId={card.id}
                        cardName={cardDisplayName(card.name, card)}
                        price={p.priceCents / 100}
                        positionInList={i + 1}
                        pageType="card_detail"
                        inStock
                        variant={p.isFoil ? "foil" : "nonfoil"}
                        condition={p.condition}
                        surface="modal"
                        className={`${buyButtonClass(p.retailer)} order-last w-full basis-full justify-center px-3 py-1.5 text-xs md:order-none md:w-auto md:basis-auto`}
                      >
                        {buyButtonLabel(p.retailer)}
                      </OutboundLink>
                    </li>
                  ))}
                </ul>
              )}
              {prices && inStock.length > 6 && (
                <a href={href} className="mt-2 block text-center text-xs text-brand-400 hover:underline">
                  See all {inStock.length} stores →
                </a>
              )}
              {/* Same control the full card page carries, on the surface most
                  people actually compare prices on — the popup is where a
                  browse-page visitor sees our number without ever loading the
                  card page, so a report link only on the page would miss them.
                  Reports the FULL fetched list, not the six rows rendered above:
                  the store with the wrong price may be the seventh. */}
              {reportable.length > 0 && (
                <div className="mt-2 text-center">
                  <ReportPriceButton
                    compact
                    subject={{ kind: "card", cardId: card.id, name: cardDisplayName(card.name, card) }}
                    listings={reportable}
                  />
                </div>
              )}
              {/* The comparison rows' buy buttons are affiliate-tagged wherever the
                  retailer is a partner (eBay, TCGplayer) — disclose right here,
                  under the list, not only in the page footer. */}
              {prices && inStock.length > 0 && <AffiliateDisclosure partner="both" tight />}
            </div>

            {/* Below the comparison, never inside it — see the tcgRef comment
                above. Renders its own affiliate disclosure (the default) rather
                than leaning on the list's: the disclosure above belongs to the
                rows above it, and this block can appear when that list is empty,
                which is in fact the case it matters most in. */}
            {/* Cardmarket first, above TCGplayer, exactly as on the card page —
                see CardMarketSection's note on that ordering. */}
            {cardmarketRef && (
              <CardmarketPrice
                priceCents={cardmarketRef.priceCents}
                // The MARKET's native currency, not useCountry()'s display
                // currency: the stored row is already GBP (UK) or EUR (EU), so
                // an EU-display visitor on the UK market would otherwise see a
                // GBP figure labelled in euro.
                currency={COUNTRIES[country].currency}
                href={cardmarketRef.href}
                isEu={cardmarketRef.isEu}
                compact
              />
            )}

            {tcgRef && (
              <TcgMarketPrice
                usdCents={tcgRef.usdCents}
                usdCentsFoil={tcgRef.usdCentsFoil}
                href={tcgRef.href}
                compact
              />
            )}

            {/* Shown whenever this market has no live eBay row for the card
                (`!hasEbay`) — which now includes every Common/Uncommon base
                print, since those are no longer searched on eBay at all (see
                eBayWorthSearching). They keep the buy path; only the listing
                data goes away. The old comment here claimed this appeared only
                for cards we failed to reach; the gate above has never checked
                that, and after the rarity change it is emphatically not true.

                Tracked rather than a bare anchor: this is the only eBay path
                those cards have, so its click rate is the evidence for whether
                skipping them was the right call. */}
            {ebaySearchUrl && ebayMkt && (
              <OutboundLink
                href={ebaySearchUrl}
                retailer="ebay_no_listing"
                country={country}
                cardId={card.id}
                cardName={cardDisplayName(card.name, card)}
                pageType="card_detail"
                surface="modal"
                className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.05] p-3 hover:border-amber-500/45"
              >
                <span className="min-w-0 text-xs text-slate-300">
                  <span className="font-semibold text-white">No live {ebayMkt.label} price right now</span> — search eBay for it directly.
                </span>
                <span className="shrink-0 text-xs font-semibold text-amber-300">Search {ebayMkt.label} →</span>
              </OutboundLink>
            )}
            {ebaySearchUrl && ebayMkt && <AffiliateDisclosure partner="ebay" tight />}

            {/* Price history — free for everyone, right in the preview (viewer's
                market). With <2 points (new markets still accumulating) PriceChart
                renders a "still collecting" note rather than the section vanishing. */}
            {history && (
              <div className="mt-5 border-t border-ink-800 pt-4">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Price history <span className="font-normal normal-case text-slate-600">· {country}</span>
                </div>
                {/* nowOverrideCents: the same "Now disagrees with the header
                    cheapest price" fix as the full card page — history is a
                    daily import snapshot, inStock[0] is this modal's own
                    live cheapest row, already sorted price-ascending above. */}
                <PriceChart points={history} currency={currency} compact nowOverrideCents={inStock[0]?.priceCents ?? null} />
              </div>
            )}

            {/* AI Tips is gated off every purchase surface (this modal has a
                buy button above) — same reasoning as the full card page. */}
          </div>
        </div>
    </div>
  );
}
