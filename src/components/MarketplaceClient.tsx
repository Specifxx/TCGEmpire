"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { cardDisplayName } from "@/lib/card-name";
import { cardHref } from "@/lib/card-url";

export interface MktOffer {
  id: string;
  priceCents: number;
  condition: string;
  isFoil: boolean;
  quantity: number;
  currency: string;
  sellerName: string;
  isOfficial: boolean;
  shippingNote: string | null;
}
interface MktCardInner {
  id: string;
  name: string;
  slug?: string | null;
  setCode: string;
  collectorNumber: string;
  imageThumbUrl: string | null;
  variant: string | null;
  isPromo: boolean;
  rarity: string;
}
export interface MktCard {
  card: MktCardInner;
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
  sellerName: string;
}

const CART_KEY = "rc_mkt_cart";

export function MarketplaceClient({ cards, place, stripeEnabled = false }: { cards: MktCard[]; place: string; stripeEnabled?: boolean }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openCard, setOpenCard] = useState<MktCard | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

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

  const cartCount = cart.reduce((n, c) => n + c.quantity, 0);
  const cartTotal = cart.reduce((n, c) => n + c.priceCents * c.quantity, 0);
  const cartCurrency = cart[0]?.currency ?? "AUD";

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
          sellerName: o.sellerName,
        },
      ];
    });
    toast("Added to cart ✓");
  }

  async function checkout(items: { listingId: string; quantity: number }[]) {
    if (items.length === 0) return;
    setBusy(true);
    try {
      // When Stripe is live, pay by card via the hosted Checkout (stock is reserved
      // server-side while the buyer pays). Otherwise settle the demo wallet.
      const endpoint = stripeEnabled ? "/api/marketplace/stripe/checkout" : "/api/marketplace/checkout";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Checkout failed", 3000);
        return;
      }
      if (stripeEnabled && data.url) {
        // Hand off to Stripe's hosted checkout.
        toast("Redirecting to secure checkout…", 4000);
        window.location.href = data.url;
        return;
      }
      setCart([]);
      setCartOpen(false);
      setOpenCard(null);
      toast(`✓ Order placed — ${formatMoney(data.totalCents, cartCurrency)}`, 2500);
      setTimeout(() => location.reload(), 900);
    } catch {
      toast("Network error — try again", 3000);
    } finally {
      setBusy(false);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter(
      (c) => c.card.name.toLowerCase().includes(q) || `${c.card.setCode} ${c.card.collectorNumber}`.toLowerCase().includes(q)
    );
  }, [cards, query]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-white">Marketplace</h1>
          <p className="text-sm text-slate-500">Buy Riftbound cards from verified sellers in {place}.</p>
        </div>
        <div className="flex items-center gap-3">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search cards…" className="input max-w-[180px]" />
          <button onClick={() => setCartOpen(true)} className="btn-primary relative">
            Cart
            {cartCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-[20px] place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-ink-950">{cartCount}</span>
            )}
          </button>
        </div>
      </div>

      {flash && (
        <div className="fixed inset-x-0 bottom-4 z-[90] flex justify-center px-4">
          <div className="rounded-xl border border-brand-500/40 bg-ink-900/95 px-4 py-2.5 text-sm font-medium text-slate-100 shadow-2xl">{flash}</div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card-surface grid place-items-center p-16 text-center text-slate-400">No cards listed yet.</div>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((c) => {
            const from = Math.min(...c.offers.map((o) => o.priceCents));
            const cur = c.offers[0].currency;
            return (
              <li key={c.card.id}>
                <button onClick={() => setOpenCard(c)} className="card-surface flex w-full flex-col overflow-hidden text-left transition-colors hover:border-brand-500/50">
                  <div className="aspect-[5/7] w-full bg-ink-900">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {c.card.imageThumbUrl ? <img src={c.card.imageThumbUrl} alt="" className="h-full w-full object-cover" /> : null}
                  </div>
                  <div className="p-3">
                    <div className="truncate text-sm font-semibold text-white">{cardDisplayName(c.card.name, c.card)}</div>
                    <div className="text-[11px] text-slate-500">{c.card.setCode} {c.card.collectorNumber}</div>
                    <div className="mt-1 flex items-baseline justify-between">
                      <span className="text-base font-extrabold text-accent">from {formatMoney(from, cur)}</span>
                      <span className="text-[11px] text-slate-500">{c.offers.length} {c.offers.length === 1 ? "offer" : "offers"}</span>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {openCard && (
        <OffersModal card={openCard} busy={busy} onClose={() => setOpenCard(null)} onAdd={addToCart} onBuyNow={(o, q) => checkout([{ listingId: o.id, quantity: q }])} />
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
          onCheckout={() => checkout(cart.map((c) => ({ listingId: c.listingId, quantity: c.quantity })))}
        />
      )}

      <p className="mt-6 text-center text-[11px] text-slate-600">
        Private beta. Purchases currently settle against a demo wallet while we finish secure payments &amp; shipping.
      </p>
    </div>
  );
}

function OffersModal({
  card,
  busy,
  onClose,
  onAdd,
  onBuyNow,
}: {
  card: MktCard;
  busy: boolean;
  onClose: () => void;
  onAdd: (card: MktCardInner, o: MktOffer, qty: number) => void;
  onBuyNow: (o: MktOffer, qty: number) => void;
}) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const getQty = (o: MktOffer) => qty[o.id] ?? 1;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 grid max-h-[88vh] w-full max-w-2xl grid-rows-[auto_1fr] overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 shadow-2xl">
        <div className="flex items-center gap-3 border-b border-ink-800 p-4 pr-12">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {card.card.imageThumbUrl ? <img src={card.card.imageThumbUrl} alt="" className="h-16 w-12 rounded object-cover" /> : <div className="h-16 w-12 rounded bg-ink-800" />}
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-white">{cardDisplayName(card.card.name, card.card)}</h2>
            <p className="text-xs text-slate-500">
              {card.card.setCode} {card.card.collectorNumber} · <Link href={cardHref(card.card)} className="text-brand-400 hover:underline">compare all stores</Link>
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-ink-800 hover:text-white">✕</button>
        </div>
        <ul className="divide-y divide-ink-800 overflow-y-auto">
          {card.offers.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  {o.sellerName}
                  {o.isOfficial && <span className="chip bg-brand-500/15 text-[10px] font-bold text-brand-300">★ OFFICIAL</span>}
                </div>
                <div className="text-xs text-slate-500">{o.condition}{o.isFoil ? " · Foil" : ""} · {o.quantity} available{o.shippingNote ? ` · ${o.shippingNote}` : ""}</div>
              </div>
              <span className="text-base font-extrabold text-accent">{formatMoney(o.priceCents, o.currency)}</span>
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
                <button onClick={() => onAdd(card.card, o, getQty(o))} className="btn-ghost text-xs">Add to cart</button>
                <button onClick={() => onBuyNow(o, getQty(o))} disabled={busy} className="btn-primary text-xs disabled:opacity-50">Buy now</button>
              </div>
            </li>
          ))}
        </ul>
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
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:text-white">✕</button>
        </div>
        {cart.length === 0 ? (
          <div className="grid flex-1 place-items-center text-sm text-slate-500">Your cart is empty</div>
        ) : (
          <ul className="flex-1 divide-y divide-ink-800 overflow-y-auto">
            {cart.map((it) => (
              <li key={it.listingId} className="flex items-center gap-3 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {it.image ? <img src={it.image} alt="" className="h-12 w-9 rounded object-cover" /> : <div className="h-12 w-9 rounded bg-ink-800" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white">{it.cardName}</div>
                  <div className="truncate text-xs text-slate-500">{it.sub} · {it.sellerName}</div>
                </div>
                <input type="number" min={1} value={it.quantity} onChange={(e) => onQty(it.listingId, Number(e.target.value) || 1)} className="input w-12 py-1 text-center text-sm" aria-label="Quantity" />
                <span className="w-16 text-right text-sm font-bold text-accent">{formatMoney(it.priceCents * it.quantity, it.currency)}</span>
                <button onClick={() => onRemove(it.listingId)} aria-label="Remove" className="text-slate-600 hover:text-rose-300">✕</button>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-ink-700 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-slate-400">Subtotal</span>
            <span className="text-xl font-extrabold text-accent">{formatMoney(total, currency)}</span>
          </div>
          <button onClick={onCheckout} disabled={busy || cart.length === 0} className="btn-primary w-full disabled:opacity-50">
            {busy ? "Placing order…" : "Checkout"}
          </button>
          <p className="mt-2 text-center text-[11px] text-slate-600">+ shipping per seller. Test mode — settles a demo wallet.</p>
        </div>
      </aside>
    </div>
  );
}
