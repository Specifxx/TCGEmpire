"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CardTileData } from "./CardTile";
import { CardImage } from "./CardImage";
import { DomainBadge, RarityBadge, VariantBadge, OvernumberedBadge, PromoBadge, SignatureBadge } from "./Badge";
import { WishlistButton } from "./WishlistButton";
import { isOvernumbered, isSignature } from "@/lib/constants";
import { cardHref } from "@/lib/card-url";
import { effectiveShippingCents } from "@/lib/retailers";
import { useCountry } from "./CountryProvider";

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
      {card && <QuickViewModal card={card} onClose={close} />}
    </Ctx.Provider>
  );
}

function QuickViewModal({ card, onClose }: { card: CardTileData; onClose: () => void }) {
  const [prices, setPrices] = useState<RetailerPrice[] | null>(null);
  const href = cardHref(card);
  const { country, fmt, price } = useCountry();
  const lowest = price(card);

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
      .then((d) => { if (alive) setPrices(d.retailerPrices ?? []); })
      .catch(() => { if (alive) setPrices([]); });
    return () => {
      alive = false;
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [card, onClose]);

  // Rank by delivered cost (item + shipping) so eBay's $0-postage listings don't
  // jump to the top. Matches the full card page.
  const inStock = (prices ?? [])
    .filter((p) => p.inStock && p.country === country)
    .map((p) => {
      const ship = effectiveShippingCents(p.retailer, p.shippingCents);
      return { ...p, ship, delivered: p.priceCents + ship };
    })
    .sort((a, b) => a.delivered - b.delivered);

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
                <h2 className="truncate text-xl font-extrabold text-white">{card.name}</h2>
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

            <div className="mt-4">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Price comparison</div>
              {prices === null ? (
                <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-600 border-t-brand-400" />
                  Loading live prices…
                </div>
              ) : inStock.length === 0 ? (
                <p className="py-4 text-sm text-slate-500">No in-stock listings right now.</p>
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
                        <div className="text-[10px] text-slate-500">≈ {fmt(p.delivered)} del.</div>
                      </div>
                      <a href={p.url} target="_blank" rel="nofollow sponsored noopener noreferrer" className="btn-primary px-3 py-1.5 text-xs">
                        View →
                      </a>
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
          </div>
        </div>
      </div>
    </div>
  );
}
