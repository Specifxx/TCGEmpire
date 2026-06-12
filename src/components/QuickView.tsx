"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CardTileData } from "./CardTile";
import { CardImage } from "./CardImage";
import { DomainBadge, RarityBadge, VariantBadge, OvernumberedBadge, PromoBadge, SignatureBadge } from "./Badge";
import { WishlistButton } from "./WishlistButton";
import { isOvernumbered, isSignature, UK_FALLBACK_RETAILERS } from "@/lib/constants";
import { cardHref } from "@/lib/card-url";
import { cardDisplayName } from "@/lib/card-name";
import { effectiveShippingCents, shippingPolicyUrl } from "@/lib/retailers";
import { affiliateUrl, ebayAffiliateUrl, outboundRel } from "@/lib/affiliate";
import { OutboundLink } from "./OutboundLink";
import { useCountry } from "./CountryProvider";
import { PriceChart } from "./PriceChart";
import { AiInsight } from "./AiInsight";
import type { PricePoint } from "@/lib/price-history";

// eBay marketplace per country for the quota-fallback search link. NZ has no
// eBay of its own — eBay AU ships there, so NZ falls back to it.
const EBAY_MKT: Record<string, { domain: string; label: string } | undefined> = {
  AU: { domain: "ebay.com.au", label: "eBay Australia" },
  NZ: { domain: "ebay.com.au", label: "eBay AU (ships to NZ)" },
  US: { domain: "ebay.com", label: "eBay" },
  UK: { domain: "ebay.co.uk", label: "eBay UK" },
};

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
}

const Ctx = createContext<{ open: (card: CardTileData) => void }>({ open: () => {} });
export const useQuickView = () => useContext(Ctx);

export function QuickViewProvider({ children }: { children: React.ReactNode }) {
  const [card, setCard] = useState<CardTileData | null>(null);
  const pushedRef = useRef(false);

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
      {/* Keyed by card so switching cards remounts the modal (resets collection
          state, prices and chart instead of leaking them across cards). */}
      {card && <QuickViewModal key={card.id} card={card} onClose={close} />}
    </Ctx.Provider>
  );
}

function QuickViewModal({ card, onClose }: { card: CardTileData; onClose: () => void }) {
  const [prices, setPrices] = useState<RetailerPrice[] | null>(null);
  const [ebayCheckedAt, setEbayCheckedAt] = useState<string | null>(null);
  const [history, setHistory] = useState<PricePoint[] | null>(null);
  const [coll, setColl] = useState<"idle" | "saving" | "added" | "signin" | "error">("idle");
  const [collFoil, setCollFoil] = useState(false);
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
    } catch {
      setColl("error");
    }
  }

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    let alive = true;
    const ref = card.slug ?? card.id;
    // Record the view (popularity signal) — fire-and-forget.
    fetch(`/api/card/${ref}/view`, { method: "POST", keepalive: true }).catch(() => {});
    fetch(`/api/card/${ref}`)
      .then((r) => r.json())
      .then((d) => { if (alive) { setPrices(d.retailerPrices ?? []); setEbayCheckedAt(d.ebayCheckedAt ?? null); } })
      .catch(() => { if (alive) setPrices([]); });
    // Region-specific price history (its own currency), keyed by URL for clean caching.
    fetch(`/api/card/${ref}/history?country=${country}`)
      .then((r) => r.json())
      .then((d) => { if (alive) setHistory(d.points ?? []); })
      .catch(() => { if (alive) setHistory([]); });
    return () => {
      alive = false;
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [card, onClose, country]);

  // Rank by ITEM price — the cheapest card price is the "lowest price". Known postage
  // (eBay) is shown for transparency but must not change which listing is cheapest;
  // it only breaks ties. Unknown postage shows "at checkout" (never fabricated).
  const countryRows = (prices ?? []).filter((p) => p.inStock && p.country === country);
  // Converted UK reference prices (TCGplayer-UK / Cardmarket) are fallbacks only: hide
  // them when a real GBP listing exists so the cheapest shown matches the "from" price.
  const ukHasRealGbp = country === "UK" && countryRows.some((p) => !UK_FALLBACK_RETAILERS.includes(p.retailer));
  const inStock = countryRows
    .filter((p) => !(ukHasRealGbp && UK_FALLBACK_RETAILERS.includes(p.retailer)))
    .map((p) => {
      const ship = effectiveShippingCents(p.shippingCents); // number | null (null = unknown)
      return { ...p, ship, delivered: p.priceCents + (ship ?? 0) };
    })
    .sort((a, b) => a.priceCents - b.priceCents || a.delivered - b.delivered);

  // eBay quota fallback — mirrors the full card page (src/app/card/[id]/page.tsx).
  // When this market's eBay listing is missing AND the eBay pass never reached this
  // card recently (budget/quota), offer an affiliate-tagged eBay search. NZ has no eBay.
  const ebayMkt = EBAY_MKT[country];
  const hasEbay = (prices ?? []).some((p) => p.retailer.startsWith("ebay") && p.inStock && p.country === country);
  const ebayUnchecked = !ebayCheckedAt || Date.now() - new Date(ebayCheckedAt).getTime() > 28 * 60 * 60 * 1000;
  const ebaySearchUrl =
    prices !== null && ebayMkt && !hasEbay && (ebayUnchecked || country === "NZ" || inStock.length === 0)
      ? ebayAffiliateUrl(`https://www.${ebayMkt.domain}/sch/i.html?_nkw=${encodeURIComponent(`${card.name} Riftbound`)}`)
      : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 max-h-[88vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 shadow-2xl">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-20 grid h-8 w-8 place-items-center rounded-full bg-ink-950/80 text-slate-300 hover:text-white"
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
              <RarityBadge rarity={card.rarity} />
              <span className="chip bg-ink-800 text-slate-300">{card.type}</span>
              <VariantBadge variant={card.variant} />
              <SignatureBadge show={isSignature(card.collectorNumber)} />
              <OvernumberedBadge show={isOvernumbered(card.collectorNumber)} />
              <PromoBadge show={card.isPromo} />
            </div>
            <div className="mt-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-xl font-extrabold text-white">{cardDisplayName(card.name, card)}</h2>
                <p className="font-mono text-xs text-slate-500">{card.setName} ({card.setCode}) · {card.collectorNumber}</p>
              </div>
              <WishlistButton cardId={card.id} variant="full" />
            </div>

            <div className="mt-3 rounded-lg bg-ink-950/50 p-3">
              <div className="text-[11px] uppercase tracking-wide text-slate-500">Cheapest price</div>
              <div className="text-2xl font-extrabold text-accent">
                {lowest != null ? fmt(lowest) : "—"}
              </div>
            </div>

            {/* Add to collection — track & value your whole collection in your profile */}
            <div className="mt-3 flex items-center gap-2">
              {coll === "signin" ? (
                <a href="/login?next=/profile" className="btn-ghost flex-1 justify-center text-sm">Sign in to track your collection</a>
              ) : coll === "added" ? (
                <div className="flex flex-1 items-center justify-between rounded-lg border border-brand-500/30 bg-brand-500/10 px-3 py-2 text-sm">
                  <span className="font-semibold text-brand-300">✓ Added to your collection</span>
                  <button onClick={addToCollection} className="text-xs text-slate-300 hover:text-white">Add another +1</button>
                </div>
              ) : (
                <>
                  <button onClick={addToCollection} disabled={coll === "saving"} className="btn-primary flex-1 justify-center text-sm">
                    {coll === "saving" ? "Adding…" : coll === "error" ? "Try again" : "＋ Add to collection"}
                  </button>
                  <button
                    onClick={() => setCollFoil((f) => !f)}
                    title="Mark as foil"
                    className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold ${collFoil ? "bg-gold/20 text-gold ring-1 ring-gold/40" : "bg-ink-800 text-slate-400 hover:text-slate-200"}`}
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
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-600 border-t-brand-400" />
                  Loading live prices…
                </div>
              ) : inStock.length === 0 ? (
                <div className="py-4 text-sm text-slate-500">
                  <p>No in-stock listings right now.</p>
                  {/* Never a dead end: a zero-stock modal still offers the
                      affiliate eBay search (eBay AU for NZ, which has no eBay). */}
                  {ebaySearchUrl && ebayMkt && (
                    <a
                      href={ebaySearchUrl}
                      target="_blank"
                      rel={outboundRel(ebaySearchUrl)}
                      className="btn-primary mt-3 inline-flex text-xs"
                    >
                      Search {ebayMkt.label} →
                    </a>
                  )}
                </div>
              ) : (
                <ul className="divide-y divide-ink-800">
                  {inStock.slice(0, 6).map((p, i) => (
                    <li key={p.id} className="flex items-center gap-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-white">{p.retailerName}</div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                          {p.isFoil && <span className="font-semibold text-gold">✦ Foil</span>}
                          {p.condition && <span>{p.condition}</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-bold ${i === 0 ? "text-accent" : "text-white"}`}>{fmt(p.priceCents)}</div>
                        <div className="text-[10px] text-slate-500">
                          {p.ship == null ? (
                            shippingPolicyUrl(p.retailer) ? (
                              <a href={shippingPolicyUrl(p.retailer)!} target="_blank" rel="nofollow noopener noreferrer" className="underline decoration-dotted hover:text-slate-300">
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
                      <OutboundLink href={affiliateUrl(p.url, p.retailer)} retailer={p.retailer} country={country} className="btn-primary px-3 py-1.5 text-xs">
                        View →
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
            </div>

            {/* eBay quota fallback — only when we couldn't reach this card's eBay
                listings this cycle (not for cards that genuinely have none). */}
            {ebaySearchUrl && ebayMkt && (
              <a
                href={ebaySearchUrl}
                target="_blank"
                rel={outboundRel(ebaySearchUrl)}
                className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-amber-500/25 bg-amber-500/[0.05] p-3 hover:border-amber-500/45"
              >
                <span className="min-w-0 text-xs text-slate-300">
                  <span className="font-semibold text-white">No live {ebayMkt.label} price right now</span> — search eBay for it directly.
                </span>
                <span className="shrink-0 text-xs font-semibold text-amber-300">Search {ebayMkt.label} →</span>
              </a>
            )}

            {/* Price history — free for everyone, right in the preview (viewer's
                market). With <2 points (new markets still accumulating) PriceChart
                renders a "still collecting" note rather than the section vanishing. */}
            {history && (
              <div className="mt-5 border-t border-ink-800 pt-4">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Price history <span className="font-normal normal-case text-slate-600">· {country}</span>
                </div>
                <PriceChart points={history} currency={currency} compact />
              </div>
            )}

            {/* AI Tips — funny buy/hold/wait take */}
            <div className="mt-4">
              <AiInsight cardId={card.id} compact />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
