"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getWishlist, toggleWishlist } from "@/lib/wishlist-client";
import { cardHref } from "@/lib/card-url";
import { formatAUD } from "@/lib/format";

interface MiniCard {
  id: string;
  slug: string | null;
  name: string;
  setCode: string;
  collectorNumber: string;
  imageThumbUrl: string | null;
  lowestPriceCents: number | null;
}

const Ctx = createContext<{ open: () => void; close: () => void }>({ open: () => {}, close: () => {} });
export const useWishlistDrawer = () => useContext(Ctx);

export function WishlistDrawerProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  return (
    <Ctx.Provider value={{ open, close }}>
      {children}
      <WishlistDrawer open={isOpen} onClose={close} />
    </Ctx.Provider>
  );
}

function WishlistDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [cards, setCards] = useState<MiniCard[] | null>(null);

  const load = useCallback(async () => {
    const ids = getWishlist();
    if (!ids.length) {
      setCards([]);
      return;
    }
    try {
      const res = await fetch(`/api/cards?ids=${encodeURIComponent(ids.join(","))}`, { cache: "no-store" });
      const data = await res.json();
      const order = new Map(ids.map((id, i) => [id, i]));
      const sorted = (data.cards as MiniCard[]).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      setCards(sorted);
    } catch {
      setCards([]);
    }
  }, []);

  // Load when opened, and keep in sync as hearts are toggled anywhere.
  useEffect(() => {
    if (open) load();
  }, [open, load]);
  useEffect(() => {
    const onChange = () => {
      // drop removed immediately, refetch for additions
      const ids = getWishlist();
      setCards((prev) => {
        if (!prev) return prev;
        const keep = prev.filter((c) => ids.includes(c.id));
        if (keep.length !== ids.length) load();
        return keep;
      });
    };
    window.addEventListener("wishlist-change", onChange);
    return () => window.removeEventListener("wishlist-change", onChange);
  }, [load]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    if (open) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", onKey);
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const total = (cards ?? []).reduce((n, c) => n + (c.lowestPriceCents ?? 0), 0);

  return (
    <>
      {/* backdrop */}
      <div
        className={`fixed inset-0 z-[70] bg-black/60 transition-opacity duration-200 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
      />
      {/* drawer */}
      <aside
        className={`fixed right-0 top-0 z-[71] flex h-full w-full max-w-sm flex-col border-l border-ink-700 bg-ink-900 shadow-2xl transition-transform duration-200 ${open ? "translate-x-0" : "translate-x-full"}`}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-ink-700 p-4">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-white">
            ♥ Wishlist
            {cards && cards.length > 0 && (
              <span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs text-white">{cards.length}</span>
            )}
          </h2>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:text-white">✕</button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {cards === null ? (
            <div className="flex justify-center py-16">
              <span className="h-7 w-7 animate-spin rounded-full border-2 border-ink-600 border-t-brand-400" />
            </div>
          ) : cards.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">
              <p className="font-semibold text-white">Your wishlist is empty</p>
              <p className="mt-1">Tap the ♥ on any card to track its price.</p>
              <Link href="/browse" onClick={onClose} className="btn-primary mt-4 inline-block">Browse cards</Link>
            </div>
          ) : (
            <ul className="divide-y divide-ink-800">
              {cards.map((c) => (
                <li key={c.id} className="flex items-center gap-3 p-3">
                  <Link href={cardHref(c)} onClick={onClose} className="flex min-w-0 flex-1 items-center gap-3">
                    {c.imageThumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.imageThumbUrl} alt="" className="h-14 w-10 shrink-0 rounded object-cover" loading="lazy" />
                    ) : (
                      <div className="h-14 w-10 shrink-0 rounded bg-ink-800" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{c.name}</div>
                      <div className="text-[11px] text-slate-500">{c.setCode} · {c.collectorNumber}</div>
                      <div className="text-sm font-bold text-accent">
                        {c.lowestPriceCents != null ? formatAUD(c.lowestPriceCents) : "No price yet"}
                      </div>
                    </div>
                  </Link>
                  <button
                    onClick={() => toggleWishlist(c.id)}
                    aria-label="Remove from wishlist"
                    title="Remove"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-ink-800 hover:text-red-400"
                  >
                    🗑
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {cards && cards.length > 0 && (
          <div className="border-t border-ink-700 p-4">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="text-slate-400">Total (cheapest)</span>
              <span className="text-lg font-extrabold text-accent">{formatAUD(total)}</span>
            </div>
            <Link href="/wishlist" onClick={onClose} className="btn-primary w-full text-center">
              Open full wishlist →
            </Link>
          </div>
        )}
      </aside>
    </>
  );
}
