"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/format";

// The hidden marketplace back-office for buyers AND sellers: purchases (track,
// confirm delivery, review), sales (mark shipped with a tracking note), and
// offers in both directions (accept / decline / cancel / complete the buy).
type OrderRow = {
  id: string;
  role: "buyer" | "seller";
  status: string;
  quantity: number;
  totalCents: number;
  shippingCents: number;
  feeCents: number;
  createdAt: string;
  shippedAt: string | null;
  receivedAt: string | null;
  trackingNote: string | null;
  reviewed: boolean;
  rating: number | null;
  counterparty: string;
  listing: {
    id: string;
    condition: string;
    isFoil: boolean;
    currency: string;
    card: { id: string; name: string; slug: string | null; setCode: string; collectorNumber: string; imageThumbUrl: string | null };
  } | null;
};

type OfferRow = {
  id: string;
  priceCents: number;
  quantity: number;
  message: string | null;
  status: string;
  expiresAt: string;
  createdAt: string;
  listing: {
    id: string;
    priceCents: number;
    currency: string;
    condition: string;
    isFoil: boolean;
    card: { id: string; name: string; slug: string | null; setCode: string; collectorNumber: string; imageThumbUrl: string | null };
  };
  seller?: { displayName: string; sellerProfile: { shopName: string } | null };
  buyer?: { displayName: string };
};

const TABS = ["Purchases", "Sales", "Offers"] as const;
type Tab = (typeof TABS)[number];

const STATUS_STYLE: Record<string, string> = {
  PAID: "bg-gold/15 text-gold",
  SHIPPED: "bg-blue-500/15 text-blue-300",
  COMPLETED: "bg-brand-500/15 text-brand-300",
  PENDING: "bg-gold/15 text-gold",
  ACCEPTED: "bg-brand-500/15 text-brand-300",
  DECLINED: "bg-rose-500/15 text-rose-300",
  CANCELLED: "bg-ink-800 text-slate-400",
  EXPIRED: "bg-ink-800 text-slate-500",
  REFUNDED: "bg-rose-500/15 text-rose-300",
};

function StatusChip({ s }: { s: string }) {
  return <span className={`chip text-[10px] font-bold ${STATUS_STYLE[s] ?? "bg-ink-800 text-slate-400"}`}>{s}</span>;
}

function CardCell({ l }: { l: NonNullable<OrderRow["listing"]> | OfferRow["listing"] }) {
  return (
    <Link href={`/card/${l.card.slug ?? l.card.id}`} className="flex min-w-0 items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {l.card.imageThumbUrl ? <img src={l.card.imageThumbUrl} alt="" className="h-12 w-9 shrink-0 rounded-sm object-cover" loading="lazy" /> : <div className="h-12 w-9 shrink-0 rounded-sm bg-ink-800" />}
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-white">{l.card.name}</span>
        <span className="block text-[11px] text-slate-500">
          {l.card.setCode} · {l.card.collectorNumber} · {l.condition}{l.isFoil ? " · ✦" : ""}
        </span>
      </span>
    </Link>
  );
}

export function MarketplaceOrders() {
  const [tab, setTab] = useState<Tab>("Purchases");
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [made, setMade] = useState<OfferRow[]>([]);
  const [received, setReceived] = useState<OfferRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [reviewFor, setReviewFor] = useState<OrderRow | null>(null);

  function toast(msg: string, ms = 2200) {
    setFlash(msg);
    setTimeout(() => setFlash(null), ms);
  }

  async function load() {
    try {
      const [o, f] = await Promise.all([
        fetch("/api/marketplace/orders").then((r) => r.json()),
        fetch("/api/marketplace/offers").then((r) => r.json()),
      ]);
      if (o.error || f.error) {
        setError(o.error ?? f.error);
        return;
      }
      setOrders(o.orders ?? []);
      setMade(f.made ?? []);
      setReceived(f.received ?? []);
    } catch {
      setError("Couldn't load your orders — refresh to try again.");
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function act(url: string, body: unknown, okMsg: string) {
    setBusy(url);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      if (!res.ok) {
        toast(d.error ?? "Something went wrong", 3000);
        return false;
      }
      toast(okMsg);
      await load();
      return true;
    } catch {
      toast("Network error — try again", 3000);
      return false;
    } finally {
      setBusy(null);
    }
  }

  function shipOrder(o: OrderRow) {
    const tracking = window.prompt("Tracking number / note for the buyer (optional):") ?? "";
    act(`/api/marketplace/orders/${o.id}`, { action: "ship", tracking: tracking.trim() || undefined }, "✓ Marked shipped");
  }

  if (error) return <div className="card-surface p-8 text-center text-sm text-rose-400">{error}</div>;
  if (!orders) return <div className="card-surface grid min-h-[200px] place-items-center text-sm text-slate-500">Loading…</div>;

  const purchases = orders.filter((o) => o.role === "buyer");
  const sales = orders.filter((o) => o.role === "seller");
  const counts: Record<Tab, number> = {
    Purchases: purchases.length,
    Sales: sales.length,
    Offers: made.filter((x) => x.status === "PENDING" || x.status === "ACCEPTED").length +
      received.filter((x) => x.status === "PENDING").length,
  };

  return (
    <div>
      {flash && (
        <div className="fixed inset-x-0 bottom-4 z-[90] flex justify-center px-4">
          <div className="rounded-xl border border-brand-500/40 bg-ink-900/95 px-4 py-2.5 text-sm font-medium text-slate-100 shadow-2xl">{flash}</div>
        </div>
      )}

      <div className="mb-4 inline-flex rounded-lg border border-ink-700 bg-ink-900 p-0.5 text-sm">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 font-semibold transition-colors ${tab === t ? "bg-brand-500/20 text-brand-200" : "text-slate-400 hover:text-white"}`}
          >
            {t}{counts[t] > 0 && <span className="ml-1.5 text-xs text-slate-500">{counts[t]}</span>}
          </button>
        ))}
      </div>

      {tab === "Purchases" && (
        <OrderList
          rows={purchases}
          empty="No purchases yet — the marketplace grid is one tab away."
          renderActions={(o) => (
            <>
              {o.status === "SHIPPED" && (
                <button onClick={() => act(`/api/marketplace/orders/${o.id}`, { action: "receive" }, "✓ Delivery confirmed")} disabled={!!busy} className="btn-primary text-xs disabled:opacity-50">
                  📬 Got it
                </button>
              )}
              {(o.status === "SHIPPED" || o.status === "COMPLETED") && !o.reviewed && (
                <button onClick={() => setReviewFor(o)} className="btn-ghost text-xs">★ Review seller</button>
              )}
              {o.reviewed && <span className="text-[11px] text-gold">★ {o.rating}/5 left</span>}
            </>
          )}
        />
      )}

      {tab === "Sales" && (
        <OrderList
          rows={sales}
          empty="No sales yet."
          renderActions={(o) => (
            <>
              {o.status === "PAID" && (
                <button onClick={() => shipOrder(o)} disabled={!!busy} className="btn-primary text-xs disabled:opacity-50">
                  📦 Mark shipped
                </button>
              )}
              {o.trackingNote && <span className="max-w-[160px] truncate text-[11px] text-slate-500" title={o.trackingNote}>📦 {o.trackingNote}</span>}
            </>
          )}
        />
      )}

      {tab === "Offers" && (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">On your listings</h2>
            {received.length === 0 ? (
              <p className="card-surface p-6 text-center text-sm text-slate-500">No offers on your listings.</p>
            ) : (
              <ul className="card-surface divide-y divide-ink-800">
                {received.map((of) => (
                  <li key={of.id} className="flex flex-wrap items-center gap-3 p-3">
                    <CardCell l={of.listing} />
                    <div className="min-w-0 flex-1 text-xs text-slate-400">
                      <span className="font-semibold text-white">{of.buyer?.displayName}</span> offers{" "}
                      <span className="font-bold text-accent">{formatMoney(of.priceCents, of.listing.currency)}</span> ×{of.quantity}
                      <span className="text-slate-600"> (ask {formatMoney(of.listing.priceCents, of.listing.currency)})</span>
                      {of.message && <span className="block truncate italic text-slate-500">“{of.message}”</span>}
                    </div>
                    <StatusChip s={of.status} />
                    {of.status === "PENDING" && (
                      <div className="flex gap-1.5">
                        <button onClick={() => act(`/api/marketplace/offers/${of.id}`, { action: "accept" }, "✓ Offer accepted — the buyer can now complete it")} disabled={!!busy} className="btn-primary text-xs disabled:opacity-50">Accept</button>
                        <button onClick={() => act(`/api/marketplace/offers/${of.id}`, { action: "decline" }, "Offer declined")} disabled={!!busy} className="btn-ghost text-xs disabled:opacity-50">Decline</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-400">Offers you made</h2>
            {made.length === 0 ? (
              <p className="card-surface p-6 text-center text-sm text-slate-500">
                You haven&apos;t made any offers — tap 💬 Offer on any marketplace listing.
              </p>
            ) : (
              <ul className="card-surface divide-y divide-ink-800">
                {made.map((of) => (
                  <li key={of.id} className="flex flex-wrap items-center gap-3 p-3">
                    <CardCell l={of.listing} />
                    <div className="min-w-0 flex-1 text-xs text-slate-400">
                      You offered <span className="font-bold text-accent">{formatMoney(of.priceCents, of.listing.currency)}</span> ×{of.quantity} to{" "}
                      <span className="font-semibold text-white">{of.seller?.sellerProfile?.shopName ?? of.seller?.displayName}</span>
                      <span className="text-slate-600"> (ask {formatMoney(of.listing.priceCents, of.listing.currency)})</span>
                    </div>
                    <StatusChip s={of.status} />
                    {of.status === "ACCEPTED" && (
                      <button
                        onClick={() =>
                          act("/api/marketplace/buy", { listingId: of.listing.id, offerId: of.id }, "✓ Deal done — order placed at your offer price!")
                        }
                        disabled={!!busy}
                        className="btn-primary text-xs disabled:opacity-50"
                      >
                        🤝 Complete purchase
                      </button>
                    )}
                    {of.status === "PENDING" && (
                      <button onClick={() => act(`/api/marketplace/offers/${of.id}`, { action: "cancel" }, "Offer cancelled")} disabled={!!busy} className="btn-ghost text-xs disabled:opacity-50">
                        Cancel
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {reviewFor && (
        <ReviewModal
          order={reviewFor}
          busy={!!busy}
          onClose={() => setReviewFor(null)}
          onSubmit={async (rating, comment) => {
            const ok = await act("/api/marketplace/reviews", { orderId: reviewFor.id, rating, comment: comment || undefined }, "✓ Review posted — thanks!");
            if (ok) setReviewFor(null);
          }}
        />
      )}
    </div>
  );
}

function OrderList({
  rows,
  empty,
  renderActions,
}: {
  rows: OrderRow[];
  empty: string;
  renderActions: (o: OrderRow) => React.ReactNode;
}) {
  if (rows.length === 0) return <p className="card-surface p-8 text-center text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="card-surface divide-y divide-ink-800">
      {rows.map((o) => (
        <li key={o.id} className="flex flex-wrap items-center gap-3 p-3">
          {o.listing ? <CardCell l={o.listing} /> : <span className="text-sm text-slate-500">(listing removed)</span>}
          <div className="min-w-0 flex-1 text-xs text-slate-400">
            ×{o.quantity} · {o.role === "buyer" ? "from" : "to"} <span className="font-semibold text-white">{o.counterparty}</span>
            <span className="block text-slate-600">{new Date(o.createdAt).toLocaleDateString()}</span>
          </div>
          <span className="text-sm font-extrabold text-accent">{formatMoney(o.totalCents, o.listing?.currency ?? "AUD")}</span>
          <StatusChip s={o.status} />
          <div className="flex items-center gap-2">{renderActions(o)}</div>
        </li>
      ))}
    </ul>
  );
}

function ReviewModal({
  order,
  busy,
  onClose,
  onSubmit,
}: {
  order: OrderRow;
  busy: boolean;
  onClose: () => void;
  onSubmit: (rating: number, comment: string) => void;
}) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5 shadow-2xl">
        <h2 className="text-lg font-extrabold text-white">★ Review {order.counterparty}</h2>
        <p className="mt-1 text-sm text-slate-400">{order.listing?.card.name} ×{order.quantity}</p>
        <div className="mt-3 flex gap-1.5" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onClick={() => setRating(n)}
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              className={`text-2xl transition-transform hover:scale-110 ${n <= rating ? "text-gold" : "text-ink-700"}`}
            >
              ★
            </button>
          ))}
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, 400))}
          placeholder="How was the card, packaging, speed? (optional)"
          rows={3}
          className="input mt-3 resize-none"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
          <button onClick={() => onSubmit(rating, comment.trim())} disabled={busy} className="btn-primary text-sm disabled:opacity-50">
            {busy ? "Posting…" : "Post review"}
          </button>
        </div>
      </div>
    </div>
  );
}
