"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatMoney, timeAgo } from "@/lib/format";
import { cardDisplayName } from "@/lib/card-name";
import { cardHref } from "@/lib/card-url";
import { CONDITION_KEYS, RARITY_KEYS } from "@/lib/constants";
import { COUNTRIES, type Country } from "@/lib/country";
import { MARKETPLACE_LAUNCH_COUNTRIES } from "@/lib/marketplace-countries";
import { useCountry } from "./CountryProvider";
import { MarketplaceCheckout, type CheckoutItem } from "./MarketplaceCheckout";
import { MarketplaceReportBug } from "./MarketplaceReportBug";
import { cardImageAlt } from "@/lib/image-alt";

export interface MktOffer {
  id: string;
  priceCents: number;
  condition: string;
  isFoil: boolean;
  quantity: number;
  currency: string;
  sellerId: string;
  sellerName: string;
  isOfficial: boolean;
  shippingNote: string | null;
  handlingDays: number;
  ratingAvg: number | null;
  ratingCount: number;
  // The seller's shipping region for this listing, and whether it matches the
  // viewer's own market. Cross-region offers are shown (price transparency) but
  // greyed out and non-purchasable — see D6/same-region-only in the plan.
  country: string;
  inRegion: boolean;
  // When this listing was posted — shown so a buyer can judge freshness
  // themselves (a listing posted months ago is more likely to be stale/sold
  // elsewhere than one from today, since sellers self-report availability).
  createdAt: string;
}
interface MktCardInner {
  id: string;
  name: string;
  slug: string | null;
  setCode: string;
  collectorNumber: string;
  imageThumbUrl: string | null;
  variant: string | null;
  isPromo: boolean;
  rarity: string;
}
export interface MktCard {
  card: MktCardInner;
  // The site's lowest live STORE price for this card in the viewer's market —
  // the benchmark behind the "under market" badges. null = no store price yet.
  marketCents: number | null;
  offers: MktOffer[];
}

interface CartItem {
  listingId: string;
  quantity: number;
  cardName: string;
  sub: string;
  image: string | null;
  priceCents: number;
  currency: string;
  sellerId: string;
  sellerName: string;
}

const CART_KEY = "rc_mkt_cart";
const SORTS = [
  { key: "price_asc", label: "Cheapest first" },
  { key: "price_desc", label: "Dearest first" },
  { key: "deal", label: "Biggest % discount" },
  { key: "newest", label: "Newest listings" },
  { key: "name", label: "Name A–Z" },
] as const;
type SortKey = (typeof SORTS)[number]["key"];

const MIN_DISCOUNTS = [
  { key: "all", label: "Any discount" },
  { key: "10", label: "10%+ under market" },
  { key: "20", label: "20%+ under market" },
  { key: "30", label: "30%+ under market" },
] as const;

// Signed % of an offer vs the site's market price (negative = under market).
function deltaPct(offerCents: number, marketCents: number | null): number | null {
  if (marketCents == null || marketCents <= 0) return null;
  return Math.round(((offerCents - marketCents) / marketCents) * 100);
}

// Deals are the whole point of browsing offers on one card instead of just
// buying the cheapest — make them impossible to miss instead of just another
// muted chip among the rest of the row's metadata. A second, hotter tier at
// -10%+ (matching the first real rung of the MIN_DISCOUNTS filter above) gives
// genuinely steep listings an extra pop instead of flattening every discount
// into one look.
function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  if (pct <= -10)
    return (
      <span className="chip bg-brand-400 text-[11px] font-extrabold text-ink-950 shadow-sm shadow-brand-500/40">
        🔥 <span className="num">{Math.abs(pct)}%</span> under market
      </span>
    );
  if (pct <= -3)
    return <span className="chip bg-brand-500 text-[11px] font-extrabold text-ink-950"><span className="num">{Math.abs(pct)}%</span> under market</span>;
  if (pct >= 5)
    return <span className="chip bg-down/10 text-[10px] font-semibold text-down"><span className="num">{pct}%</span> over market</span>;
  return <span className="chip bg-ink-800 text-[10px] font-semibold text-slate-400">≈ market price</span>;
}

function Stars({ avg, count }: { avg: number | null; count: number }) {
  if (avg == null || count === 0) return <span className="text-[10px] text-slate-600">no reviews yet</span>;
  return (
    <span className="text-[11px] font-semibold text-gold" title={`${avg}/5 from ${count} review${count === 1 ? "" : "s"}`}>
      ★ {avg} <span className="font-normal text-slate-500">({count})</span>
    </span>
  );
}

// Cheapest offer a buyer can actually check out with (in-region); only falls back
// to a cross-region price so the card still surfaces (as reference-only) if nobody
// local sells it.
function bestOffer(offers: MktOffer[]): MktOffer {
  const inRegion = offers.filter((o) => o.inRegion);
  const pool = inRegion.length ? inRegion : offers;
  return pool.reduce((best, o) => (o.priceCents < best.priceCents ? o : best), pool[0]);
}

export function MarketplaceClient({
  cards,
  place,
  country,
  stripeEnabled = false,
  signedIn = false,
  currentUserId = null,
  offersEnabled = false,
  openCardId,
}: {
  cards: MktCard[];
  place: string;
  country: string;
  stripeEnabled?: boolean;
  signedIn?: boolean;
  // The signed-in seller's own user id, so their own listings can show an
  // inline Edit/Remove affordance right here instead of only in the seller
  // dashboard — nothing changes for anyone browsing offers that aren't theirs.
  currentUserId?: string | null;
  offersEnabled?: boolean;
  // Deep-linked from a card page's marketplace hero — auto-opens that card's
  // offers modal on load instead of making the visitor find it in the grid.
  openCardId?: string;
}) {
  const { setCountry } = useCountry();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openCard, setOpenCard] = useState<MktCard | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cond, setCond] = useState("all");
  const [foil, setFoil] = useState("all"); // all | foil | normal
  const [setCode, setSetCode] = useState("all");
  const [rarity, setRarity] = useState("all");
  const [minDiscount, setMinDiscount] = useState<(typeof MIN_DISCOUNTS)[number]["key"]>("all");
  const [inRegionOnly, setInRegionOnly] = useState(false);
  const [officialOnly, setOfficialOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("price_asc");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [offerFor, setOfferFor] = useState<{ card: MktCardInner; offer: MktOffer } | null>(null);
  const [checkoutItems, setCheckoutItems] = useState<CheckoutItem[] | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CART_KEY);
      if (raw) setCart(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch {}
  }, [cart, loaded]);
  useEffect(() => {
    if (!openCardId) return;
    const match = cards.find((c) => c.card.id === openCardId);
    if (match) setOpenCard(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openCardId]);

  const cartCount = cart.reduce((n, c) => n + c.quantity, 0);
  const cartTotal = cart.reduce((n, c) => n + c.priceCents * c.quantity, 0);
  const cartCurrency = cart[0]?.currency ?? "AUD";
  const sets = useMemo(() => [...new Set(cards.map((c) => c.card.setCode))].sort(), [cards]);

  function toast(msg: string, ms = 1800) {
    setFlash(msg);
    setTimeout(() => setFlash(null), ms);
  }

  function addToCart(card: MktCardInner, o: MktOffer, qty: number) {
    setCart((c) => {
      const i = c.findIndex((x) => x.listingId === o.id);
      if (i >= 0) {
        const next = c.slice();
        next[i] = { ...next[i], quantity: Math.min(o.quantity, next[i].quantity + qty) };
        return next;
      }
      return [
        ...c,
        {
          listingId: o.id,
          quantity: Math.min(o.quantity, qty),
          cardName: card.name,
          sub: `${card.setCode} ${card.collectorNumber} · ${o.condition}${o.isFoil ? " · Foil" : ""}`,
          image: card.imageThumbUrl,
          priceCents: o.priceCents,
          currency: o.currency,
          sellerId: o.sellerId,
          sellerName: o.sellerName,
        },
      ];
    });
    toast("Added to cart");
  }

  // Opens the shipping-address + live-estimate step (MarketplaceCheckout) inline
  // rather than posting straight to Stripe — that's where the address is
  // actually collected now (see api/marketplace/stripe/checkout/route.ts's
  // header comment for why this replaced Stripe's own address collection).
  // Carts can span multiple sellers — one Checkout Session, one card charge,
  // one shared delivery address. MarketplaceCheckout computes shipping per
  // seller (each has their own flat rate/postcode) and the server does the
  // same authoritative computation before charging.
  function openCheckout(items: CheckoutItem[]) {
    if (items.length === 0) return;
    if (!stripeEnabled) {
      toast("Card checkout isn't enabled yet", 3000);
      return;
    }
    setCartOpen(false);
    setCheckoutItems(items);
  }

  async function submitOffer(listingId: string, dollars: number, qty: number, message: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/marketplace/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, priceCents: Math.round(dollars * 100), quantity: qty, message: message || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Couldn't send the offer", 3000);
        return;
      }
      setOfferFor(null);
      toast("Offer sent — the seller has 72h to respond. Track it in My orders.", 3500);
    } catch {
      toast("Network error — try again", 3000);
    } finally {
      setBusy(false);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const minPct = minDiscount === "all" ? null : Number(minDiscount);
    let list = cards
      .map((c) => {
        // Filter offers first; a card stays visible while any offer matches.
        const offers = c.offers.filter(
          (o) =>
            (cond === "all" || o.condition === cond) &&
            (foil === "all" || (foil === "foil") === o.isFoil) &&
            (!inRegionOnly || o.inRegion) &&
            (!officialOnly || o.isOfficial) &&
            (minPct == null || (deltaPct(o.priceCents, c.marketCents) ?? 0) <= -minPct)
        );
        return { ...c, offers };
      })
      .filter(
        (c) =>
          c.offers.length > 0 &&
          (setCode === "all" || c.card.setCode === setCode) &&
          (rarity === "all" || c.card.rarity === rarity) &&
          (!q || c.card.name.toLowerCase().includes(q) || `${c.card.setCode} ${c.card.collectorNumber}`.toLowerCase().includes(q))
      );
    const cheapest = (c: MktCard) => bestOffer(c.offers).priceCents;
    const bestDelta = (c: MktCard) => {
      const inRegion = c.offers.filter((o) => o.inRegion);
      const pool = inRegion.length ? inRegion : c.offers;
      const ds = pool.map((o) => deltaPct(o.priceCents, c.marketCents)).filter((d): d is number => d != null);
      return ds.length ? Math.min(...ds) : 999;
    };
    const newest = (c: MktCard) => Math.max(...c.offers.map((o) => new Date(o.createdAt).getTime()));
    switch (sort) {
      case "price_desc": list.sort((a, b) => cheapest(b) - cheapest(a)); break;
      case "deal": list.sort((a, b) => bestDelta(a) - bestDelta(b)); break;
      case "newest": list.sort((a, b) => newest(b) - newest(a)); break;
      case "name": list.sort((a, b) => a.card.name.localeCompare(b.card.name)); break;
      default: list.sort((a, b) => cheapest(a) - cheapest(b));
    }
    return list;
  }, [cards, query, cond, foil, setCode, rarity, minDiscount, inRegionOnly, officialOnly, sort]);

  // True once no card in view has an in-region (buyable) offer — every price shown
  // would be reference-only. Surfaces a region-switch prompt instead of a page that
  // just looks broken/empty.
  const noneInRegion = filtered.length > 0 && filtered.every((c) => !c.offers.some((o) => o.inRegion));
  const otherRegions = (MARKETPLACE_LAUNCH_COUNTRIES as readonly Country[]).filter((c) => c !== country);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-extrabold text-white">Marketplace</h1>
            <MarketplaceReportBug subject="Marketplace bug: " />
          </div>
          <p className="text-sm text-slate-500">
            Buy Riftbound cards from verified sellers shipping within <span className="font-semibold text-slate-300">{place}</span>.
            {" "}
            <span className="chip bg-ink-800 text-[10px] font-bold text-slate-400" title="You can only buy from sellers shipping within your own market — no cross-border shipping surprises. Other regions' prices still show for reference.">
              Same-region delivery
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/marketplace/sell" className="btn-primary text-sm">Sell</Link>
          {signedIn && (
            <Link href="/marketplace/orders" className="btn-ghost text-sm">My orders &amp; offers</Link>
          )}
          <button onClick={() => setCartOpen(true)} className="btn-primary relative">
            Cart
            {cartCount > 0 && (
              <span className="num absolute -right-1.5 -top-1.5 grid h-5 min-w-[20px] place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-ink-950">{cartCount}</span>
            )}
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search cards…" className="input max-w-[200px] py-2 text-sm" />
        <select value={setCode} onChange={(e) => setSetCode(e.target.value)} className="input w-auto py-2 text-sm" aria-label="Set">
          <option value="all">All sets</option>
          {sets.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={rarity} onChange={(e) => setRarity(e.target.value)} className="input w-auto py-2 text-sm" aria-label="Rarity">
          <option value="all">Any rarity</option>
          {RARITY_KEYS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={cond} onChange={(e) => setCond(e.target.value)} className="input w-auto py-2 text-sm" aria-label="Condition">
          <option value="all">Any condition</option>
          {CONDITION_KEYS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={foil} onChange={(e) => setFoil(e.target.value)} className="input w-auto py-2 text-sm" aria-label="Finish">
          <option value="all">Foil + normal</option>
          <option value="normal">Normal only</option>
          <option value="foil">✦ Foil only</option>
        </select>
        <select value={minDiscount} onChange={(e) => setMinDiscount(e.target.value as (typeof MIN_DISCOUNTS)[number]["key"])} className="input w-auto py-2 text-sm" aria-label="Minimum discount">
          {MIN_DISCOUNTS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="input ml-auto w-auto py-2 text-sm" aria-label="Sort">
          {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-slate-400">
          <input type="checkbox" checked={inRegionOnly} onChange={(e) => setInRegionOnly(e.target.checked)} className="h-3.5 w-3.5 rounded border-ink-600 bg-ink-800" />
          Ships to {place} only
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-400">
          <input type="checkbox" checked={officialOnly} onChange={(e) => setOfficialOnly(e.target.checked)} className="h-3.5 w-3.5 rounded border-ink-600 bg-ink-800" />
          ★ Official sellers only
        </label>
        {(cond !== "all" || foil !== "all" || setCode !== "all" || rarity !== "all" || minDiscount !== "all" || inRegionOnly || officialOnly || query) && (
          <button
            onClick={() => {
              setQuery("");
              setCond("all");
              setFoil("all");
              setSetCode("all");
              setRarity("all");
              setMinDiscount("all");
              setInRegionOnly(false);
              setOfficialOnly(false);
            }}
            className="text-xs text-brand-400 hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {flash && (
        <div className="fixed inset-x-0 bottom-4 z-[90] flex justify-center px-4">
          <div className="rounded-lg border border-brand-500/40 bg-ink-900/95 px-4 py-2.5 text-sm font-medium text-slate-100 shadow-2xl">{flash}</div>
        </div>
      )}

      {noneInRegion && (
        <div className="card-surface mb-4 flex flex-wrap items-center justify-between gap-3 border-gold/30 bg-gold/5 p-4">
          <p className="text-sm text-slate-300">
            No sellers currently ship to <span className="font-semibold text-white">{place}</span> — prices below are shown for
            reference only. Switch region to buy from a market that does:
          </p>
          <div className="flex gap-1.5">
            {otherRegions.map((c) => (
              <button key={c} onClick={() => setCountry(c)} className="btn-ghost text-xs">
                {COUNTRIES[c].flag} {COUNTRIES[c].label}
              </button>
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card-surface grid place-items-center p-16 text-center text-slate-400">
          {cards.length === 0 ? "No cards listed yet." : "Nothing matches those filters."}
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((c) => {
            const best = bestOffer(c.offers);
            const cur = best.currency;
            const pct = deltaPct(best.priceCents, c.marketCents);
            return (
              <li key={c.card.id}>
                <button
                  onClick={() => setOpenCard(c)}
                  className={`card-surface flex w-full flex-col overflow-hidden text-left transition-colors hover:border-brand-500/50 ${
                    !best.isOfficial && pct != null && pct <= -10 ? "ring-2 ring-brand-400 shadow-lg shadow-brand-500/20" : ""
                  }`}
                >
                  <div className="relative aspect-[5/7] w-full bg-ink-900">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {c.card.imageThumbUrl ? <img src={c.card.imageThumbUrl} alt={cardImageAlt(c.card)} width={300} height={420} loading="lazy" decoding="async" className="h-full w-full object-cover" /> : null}
                    {best.isOfficial && (
                      <span className="absolute left-1.5 top-1.5 rounded-full bg-gold px-2 py-0.5 text-[10px] font-extrabold text-ink-950 shadow">
                        ★ Official
                      </span>
                    )}
                    {/* Deal badge — a hotter, larger, "🔥" treatment for 10%+ under
                        market (matches the MIN_DISCOUNTS filter's first rung) so a
                        genuinely steep listing stands out from an everyday 3-9%
                        discount instead of both looking identical at a glance. */}
                    {!best.isOfficial && pct != null && pct <= -10 && (
                      <span className="absolute left-1.5 top-1.5 rounded-full bg-brand-400 px-2 py-1 text-xs font-extrabold text-ink-950 shadow-md shadow-brand-500/40">
                        🔥 <span className="num">{Math.abs(pct)}%</span> under market
                      </span>
                    )}
                    {!best.isOfficial && pct != null && pct <= -3 && pct > -10 && (
                      <span className="absolute left-1.5 top-1.5 rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-extrabold text-ink-950 shadow">
                        <span className="num">{Math.abs(pct)}%</span> under market
                      </span>
                    )}
                    {!best.inRegion && (
                      <span className="absolute right-1.5 top-1.5 rounded-full bg-ink-950/80 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                        {best.country} only
                      </span>
                    )}
                  </div>
                  <div className={`p-3 ${!best.inRegion ? "opacity-60" : ""}`}>
                    <div className="truncate text-sm font-semibold text-white">{cardDisplayName(c.card.name, c.card)}</div>
                    <div className="num text-[11px] text-slate-500">{c.card.setCode} {c.card.collectorNumber}</div>
                    <div className="mt-1 flex items-baseline justify-between">
                      <span className="num text-base font-extrabold text-accent">from {formatMoney(best.priceCents, cur)}</span>
                      <span className="text-[11px] text-slate-500"><span className="num">{c.offers.length}</span> {c.offers.length === 1 ? "offer" : "offers"}</span>
                    </div>
                    {pct != null && pct > -3 && (
                      <div className="mt-1">
                        <DeltaBadge pct={pct} />
                      </div>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {openCard && (
        <OffersModal
          card={openCard}
          busy={busy}
          signedIn={signedIn}
          currentUserId={currentUserId}
          offersEnabled={offersEnabled}
          onClose={() => setOpenCard(null)}
          onAdd={addToCart}
          onBuyNow={(o, q) =>
            openCheckout([
              {
                listingId: o.id,
                quantity: q,
                cardName: openCard.card.name,
                sub: `${openCard.card.setCode} ${openCard.card.collectorNumber} · ${o.condition}${o.isFoil ? " · Foil" : ""}`,
                priceCents: o.priceCents,
                currency: o.currency,
                sellerId: o.sellerId,
                sellerName: o.sellerName,
              },
            ])
          }
          onMakeOffer={(o) => setOfferFor({ card: openCard.card, offer: o })}
        />
      )}
      {offersEnabled && offerFor && (
        <OfferModal
          card={offerFor.card}
          offer={offerFor.offer}
          busy={busy}
          onClose={() => setOfferFor(null)}
          onSubmit={submitOffer}
        />
      )}
      {cartOpen && (
        <CartDrawer
          cart={cart}
          total={cartTotal}
          currency={cartCurrency}
          busy={busy}
          onClose={() => setCartOpen(false)}
          onRemove={(id) => setCart((c) => c.filter((x) => x.listingId !== id))}
          onQty={(id, q) => setCart((c) => c.map((x) => (x.listingId === id ? { ...x, quantity: Math.max(1, q) } : x)))}
          onCheckout={() => openCheckout(cart)}
        />
      )}
      {checkoutItems && <MarketplaceCheckout items={checkoutItems} onClose={() => setCheckoutItems(null)} />}

      <p className="mt-6 text-center text-[11px] text-slate-600">
        🔒 Buyer protection: your payment is held until you confirm delivery.{" "}
        <Link href="/marketplace/buyer-protection" className="text-brand-400 hover:underline">How it works</Link>
        {" · "}
        <Link href="/marketplace/faq" className="text-brand-400 hover:underline">FAQ</Link>
        {" · "}
        <Link href="/marketplace/terms" className="text-brand-400 hover:underline">Marketplace terms</Link>
      </p>
    </div>
  );
}

function OffersModal({
  card,
  busy,
  signedIn,
  currentUserId,
  offersEnabled,
  onClose,
  onAdd,
  onBuyNow,
  onMakeOffer,
}: {
  card: MktCard;
  busy: boolean;
  signedIn: boolean;
  currentUserId?: string | null;
  offersEnabled: boolean;
  onClose: () => void;
  onAdd: (card: MktCardInner, o: MktOffer, qty: number) => void;
  onBuyNow: (o: MktOffer, qty: number) => void;
  onMakeOffer: (o: MktOffer) => void;
}) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const getQty = (o: MktOffer) => qty[o.id] ?? 1;
  const { setCountry } = useCountry();
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editQty, setEditQty] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  // Local, editable copy of this card's offers — lets a seller's own Edit/Save
  // update what's on screen immediately without waiting on a full server
  // round-trip. Reset whenever a different card's modal opens.
  const [offers, setOffers] = useState(card.offers);
  useEffect(() => setOffers(card.offers), [card]);
  const firstOtherIndex = offers.findIndex((o) => !o.inRegion);

  async function saveListing(id: string, priceCents: number, quantity: number) {
    const res = await fetch(`/api/marketplace/listings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priceCents, quantity }),
    });
    if (res.ok) {
      setOffers((os) => os.map((o) => (o.id === id ? { ...o, priceCents, quantity } : o)));
      router.refresh();
    }
    return res.ok;
  }

  async function removeListing(id: string) {
    const res = await fetch(`/api/marketplace/listings/${id}`, { method: "DELETE" });
    if (res.ok) {
      setOffers((os) => os.filter((o) => o.id !== id));
      router.refresh();
    }
    return res.ok;
  }

  function startEdit(o: MktOffer) {
    setEditingId(o.id);
    setEditPrice((o.priceCents / 100).toFixed(2));
    setEditQty(String(o.quantity));
  }

  async function confirmEdit(id: string) {
    setSavingId(id);
    await saveListing(id, Math.round(parseFloat(editPrice || "0") * 100), parseInt(editQty || "0", 10));
    setSavingId(null);
    setEditingId(null);
  }

  async function confirmRemove(id: string) {
    if (typeof window !== "undefined" && !window.confirm("Remove this listing?")) return;
    await removeListing(id);
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 grid max-h-[88vh] w-full max-w-2xl grid-rows-[auto_1fr] overflow-hidden rounded-lg border border-ink-700 bg-ink-900 shadow-2xl">
        <div className="flex items-center gap-3 border-b border-ink-800 p-4 pr-12">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {card.card.imageThumbUrl ? <img src={card.card.imageThumbUrl} alt={cardImageAlt(card.card)} width={48} height={64} className="h-16 w-12 rounded object-cover" /> : <div className="h-16 w-12 rounded bg-ink-800" />}
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-white">{cardDisplayName(card.card.name, card.card)}</h2>
            <p className="text-xs text-slate-500">
              {card.card.setCode} {card.card.collectorNumber}
              {card.marketCents != null && <> · market {formatMoney(card.marketCents, offers[0]?.currency ?? "AUD")}</>}
              {" · "}
              <Link href={cardHref(card.card)} className="text-brand-400 hover:underline">compare all stores</Link>
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 tap-icon  rounded-full text-slate-400 hover:bg-ink-800 hover:text-white">✕</button>
        </div>
        <ul className="divide-y divide-ink-800 overflow-y-auto">
          {offers.map((o, i) => (
            <Fragment key={o.id}>
              {i === firstOtherIndex && firstOtherIndex > 0 && (
                <li key="divider" className="bg-ink-950/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Other regions — reference price only
                </li>
              )}
              <li key={o.id} className={`flex flex-wrap items-center gap-3 p-3 ${!o.inRegion ? "opacity-60" : ""}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
                    <Link href={`/marketplace/seller/${o.sellerId}`} className="hover:text-brand-300 hover:underline">{o.sellerName}</Link>
                    {o.isOfficial && <span className="chip bg-brand-500/15 text-[10px] font-bold text-brand-300">★ OFFICIAL</span>}
                    <Stars avg={o.ratingAvg} count={o.ratingCount} />
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>{o.condition}{o.isFoil ? " · ✦ Foil" : ""} · {o.quantity} available · ⏱ ships in ~{o.handlingDays}d{o.shippingNote ? ` · ${o.shippingNote}` : ""} · listed {timeAgo(o.createdAt)}</span>
                    {o.inRegion ? (
                      <DeltaBadge pct={deltaPct(o.priceCents, card.marketCents)} />
                    ) : (
                      <span className="chip bg-ink-800 text-[10px] font-semibold text-slate-500">ships to {COUNTRIES[o.country as Country]?.label ?? o.country} only</span>
                    )}
                  </div>
                </div>
                {o.sellerId === currentUserId ? (
                  editingId === o.id ? (
                    <>
                      <input
                        type="number" min={0} step="0.01"
                        value={editPrice}
                        onChange={(e) => setEditPrice(e.target.value)}
                        className="input w-20 py-1 text-sm"
                        aria-label="Price"
                      />
                      <input
                        type="number" min={0} max={999}
                        value={editQty}
                        onChange={(e) => setEditQty(e.target.value)}
                        className="input w-14 py-1 text-sm"
                        aria-label="Quantity"
                      />
                      <div className="flex gap-1.5">
                        <button onClick={() => confirmEdit(o.id)} disabled={savingId === o.id} className="rounded bg-brand-500/20 px-2 py-1 text-[11px] font-semibold text-brand-300 hover:bg-brand-500/30 disabled:opacity-50">
                          {savingId === o.id ? "…" : "Save"}
                        </button>
                        <button onClick={() => setEditingId(null)} className="rounded bg-ink-800 px-2 py-1 text-[11px] text-slate-400 hover:bg-ink-700">Cancel</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="num text-base font-extrabold text-accent">{formatMoney(o.priceCents, o.currency)}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="chip bg-ink-800 text-[10px] font-semibold text-slate-400">Your listing</span>
                        <button onClick={() => startEdit(o)} className="rounded bg-ink-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-ink-700">Edit</button>
                        <button onClick={() => confirmRemove(o.id)} className="rounded bg-ink-800 px-2 py-1 text-[11px] text-rose-300 hover:bg-ink-700">Remove</button>
                      </div>
                    </>
                  )
                ) : (
                  <span className="num text-base font-extrabold text-accent">{formatMoney(o.priceCents, o.currency)}</span>
                )}
                {o.sellerId === currentUserId ? null : o.inRegion ? (
                  <>
                    <input
                      type="number"
                      min={1}
                      max={o.quantity}
                      value={getQty(o)}
                      onChange={(e) => setQty((q) => ({ ...q, [o.id]: Math.max(1, Math.min(o.quantity, Number(e.target.value) || 1)) }))}
                      className="input w-14 py-1 text-center text-sm"
                      aria-label="Quantity"
                    />
                    <div className="flex gap-1.5">
                      {offersEnabled && signedIn && (
                        <button onClick={() => onMakeOffer(o)} className="btn-ghost text-xs" title="Negotiate a lower price">Offer</button>
                      )}
                      <button onClick={() => onAdd(card.card, o, getQty(o))} className="btn-ghost text-xs">Add to cart</button>
                      <button onClick={() => onBuyNow(o, getQty(o))} disabled={busy} className="btn-primary text-xs disabled:opacity-50">Buy now</button>
                    </div>
                  </>
                ) : (
                  <button
                    onClick={() => { setCountry(o.country as Country); onClose(); }}
                    className="btn-ghost text-xs"
                    title={`Switch your region to buy from this ${COUNTRIES[o.country as Country]?.label ?? o.country} seller`}
                  >
                    Switch to {COUNTRIES[o.country as Country]?.label ?? o.country} to buy
                  </button>
                )}
              </li>
            </Fragment>
          ))}
        </ul>
      </div>
    </div>
  );
}

// "Make an offer" — eBay-style price negotiation on a single listing.
function OfferModal({
  card,
  offer,
  busy,
  onClose,
  onSubmit,
}: {
  card: MktCardInner;
  offer: MktOffer;
  busy: boolean;
  onClose: () => void;
  onSubmit: (listingId: string, dollars: number, qty: number, message: string) => void;
}) {
  const [dollars, setDollars] = useState("");
  const [qty, setQty] = useState(1);
  const [message, setMessage] = useState("");
  const asking = offer.priceCents / 100;
  const amount = parseFloat(dollars);
  const valid = Number.isFinite(amount) && amount > 0 && amount * 100 < offer.priceCents;

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-lg border border-ink-700 bg-ink-900 p-5 shadow-2xl">
        <h2 className="text-lg font-extrabold text-white">Make an offer</h2>
        <p className="mt-1 text-sm text-slate-400">
          {card.name} · {offer.condition}{offer.isFoil ? " · ✦ Foil" : ""} — asking{" "}
          <span className="num font-bold text-white">{formatMoney(offer.priceCents, offer.currency)}</span> from {offer.sellerName}
        </p>
        <div className="mt-4 flex gap-2">
          <label className="block flex-1">
            <span className="mb-1 block text-xs font-medium text-slate-400">Your offer ({offer.currency}, per copy)</span>
            <input
              type="number" min="0.01" step="0.01" max={asking}
              value={dollars}
              onChange={(e) => setDollars(e.target.value)}
              placeholder={`under ${asking.toFixed(2)}`}
              className="input"
              autoFocus
            />
          </label>
          <label className="block w-20">
            <span className="mb-1 block text-xs font-medium text-slate-400">Qty</span>
            <input
              type="number" min={1} max={offer.quantity}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Math.min(offer.quantity, Number(e.target.value) || 1)))}
              className="input text-center"
            />
          </label>
        </div>
        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-medium text-slate-400">Message to the seller (optional)</span>
          <input value={message} onChange={(e) => setMessage(e.target.value.slice(0, 280))} placeholder="e.g. Would you do this for the pair?" className="input" />
        </label>
        <p className="mt-2 text-[11px] text-slate-600">Offers expire after 72 hours. If the seller accepts, you complete the purchase at your offered price.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
          <button onClick={() => onSubmit(offer.id, amount, qty, message.trim())} disabled={!valid || busy} className="btn-primary text-sm disabled:opacity-50">
            {busy ? "Sending…" : "Send offer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CartDrawer({
  cart,
  total,
  currency,
  busy,
  onClose,
  onRemove,
  onQty,
  onCheckout,
}: {
  cart: CartItem[];
  total: number;
  currency: string;
  busy: boolean;
  onClose: () => void;
  onRemove: (id: string) => void;
  onQty: (id: string, q: number) => void;
  onCheckout: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-ink-700 bg-ink-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-700 p-4">
          <h2 className="text-lg font-extrabold text-white">Your cart</h2>
          <button onClick={onClose} aria-label="Close" className="tap-icon  rounded-full text-slate-400 hover:text-white">✕</button>
        </div>
        {cart.length === 0 ? (
          <div className="grid flex-1 place-items-center text-sm text-slate-500">Your cart is empty</div>
        ) : (
          <ul className="flex-1 divide-y divide-ink-800 overflow-y-auto">
            {cart.map((it) => (
              <li key={it.listingId} className="flex items-center gap-3 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {it.image ? <img src={it.image} alt="" aria-hidden="true" className="h-12 w-9 rounded object-cover" /> : <div className="h-12 w-9 rounded bg-ink-800" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white">{it.cardName}</div>
                  <div className="truncate text-xs text-slate-500">{it.sub} · {it.sellerName}</div>
                </div>
                <input type="number" min={1} value={it.quantity} onChange={(e) => onQty(it.listingId, Number(e.target.value) || 1)} className="input w-12 py-1 text-center text-sm" aria-label="Quantity" />
                <span className="num w-16 text-right text-sm font-bold text-accent">{formatMoney(it.priceCents * it.quantity, it.currency)}</span>
                <button onClick={() => onRemove(it.listingId)} aria-label="Remove" className="text-slate-600 hover:text-rose-300">✕</button>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-ink-700 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-slate-400">Subtotal</span>
            <span className="num text-xl font-extrabold text-accent">{formatMoney(total, currency)}</span>
          </div>
          <button onClick={onCheckout} disabled={busy || cart.length === 0} className="btn-primary w-full disabled:opacity-50">
            {busy ? "Redirecting…" : "Checkout securely"}
          </button>
          <p className="mt-2 text-center text-[11px] text-slate-600">+ shipping per seller. Paid via Stripe — funds held until delivery is confirmed.</p>
        </div>
      </aside>
    </div>
  );
}
