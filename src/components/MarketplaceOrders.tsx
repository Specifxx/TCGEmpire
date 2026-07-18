"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { CARRIERS, CARRIER_LABEL, trackingUrl } from "@/lib/tracking";

// Pure display helper (kept local — lib/order-number.ts pulls in the Prisma
// client, which can't ship in a "use client" bundle).
function orderLabel(n: number | null): string | null {
  return n == null ? null : `RC-${n}`;
}

// The hidden marketplace back-office for buyers AND sellers: purchases (track,
// confirm delivery, review), sales (mark shipped with a tracking note), and
// offers in both directions (accept / decline / cancel / complete the buy).
type OrderRow = {
  id: string;
  orderNumber: number | null;
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
  carrier: string | null;
  trackingNumber: string | null;
  disputedAt: string | null;
  reviewed: boolean;
  rating: number | null;
  counterparty: string;
  shipName: string | null;
  shipLine1: string | null;
  shipLine2: string | null;
  shipCity: string | null;
  shipRegion: string | null;
  shipPostcode: string | null;
  shipCountry: string | null;
  shipPhone: string | null;
  releaseRequestedAt: string | null;
  cancelRequestedAt: string | null;
  cancelReason: string | null;
  cancelRequestedByRole: "buyer" | "seller" | null;
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

// Funds sit in RiftCompare's Stripe balance (escrow) until the order is marked
// COMPLETED, at which point they're actually transferred to the seller's
// connected Stripe account — see lib/connect.ts's releaseFundsForOrder.
function PayoutBadge({ status }: { status: string }) {
  if (status === "PAID" || status === "SHIPPED") {
    return <span className="chip bg-ink-800 text-[10px] font-bold text-slate-400" title="Funds are held until the buyer confirms delivery or an admin verifies tracking — auto-releases after 14 days if neither happens">🔒 Held</span>;
  }
  if (status === "COMPLETED") {
    return <span className="chip bg-brand-500/15 text-[10px] font-bold text-brand-300" title="Delivery confirmed — funds have been transferred to your Stripe account">🔓 Released</span>;
  }
  return null;
}

// Deep-links straight to the carrier's own public tracking page when we can
// build one (see lib/tracking.ts); falls back to the raw number as plain text.
function TrackingLink({ o }: { o: OrderRow }) {
  if (!o.trackingNumber) return null;
  const url = trackingUrl(o.carrier, o.trackingNumber);
  const label = o.carrier ? CARRIER_LABEL[o.carrier as keyof typeof CARRIER_LABEL] ?? o.carrier : "Tracking";
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-brand-300 hover:underline">
      📦 {label}: {o.trackingNumber}
    </a>
  ) : (
    <span className="text-[11px] text-slate-500">📦 {label}: {o.trackingNumber}</span>
  );
}

// Mutual-agreement cancellation status/actions for one row — three states:
// nothing pending (offer to request one), I'm the requester (waiting on the
// other party, can withdraw), or the other party requested it (I can accept —
// full refund — or decline). Shown on both Purchases and Sales.
function CancelStatus({
  o,
  busy,
  onRequest,
  onAct,
}: {
  o: OrderRow;
  busy: string | null;
  onRequest: () => void;
  onAct: (url: string, body: unknown, okMsg: string) => Promise<boolean>;
}) {
  if (o.status !== "PAID" && o.status !== "SHIPPED") return null;

  if (!o.cancelRequestedAt) {
    return (
      <button onClick={onRequest} className="text-[11px] text-slate-500 hover:text-rose-300">
        Request cancellation
      </button>
    );
  }

  const iRequested = o.cancelRequestedByRole === o.role;
  if (iRequested) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-gold">
        <span>⏳ Cancellation requested — awaiting the other party</span>
        <button
          onClick={() => onAct(`/api/marketplace/orders/${o.id}`, { action: "withdraw-cancel" }, "Withdrawn")}
          disabled={!!busy}
          className="rounded bg-ink-800 px-1.5 py-0.5 text-slate-300 hover:bg-ink-700"
        >
          Withdraw
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 text-[11px]">
      <span className="text-slate-400 italic">"{o.cancelReason}"</span>
      <div className="flex gap-1.5">
        <button
          onClick={() => {
            if (typeof window !== "undefined" && !window.confirm("Accept this cancellation? This issues a full refund to the buyer and restocks the listing — it can't be undone.")) return;
            onAct(`/api/marketplace/orders/${o.id}`, { action: "accept-cancel" }, "✓ Cancelled and refunded");
          }}
          disabled={!!busy}
          className="rounded bg-brand-500/20 px-2 py-1 font-semibold text-brand-300 hover:bg-brand-500/30 disabled:opacity-50"
        >
          ✅ Accept &amp; refund
        </button>
        <button
          onClick={() => onAct(`/api/marketplace/orders/${o.id}`, { action: "decline-cancel" }, "Declined")}
          disabled={!!busy}
          className="rounded bg-ink-800 px-2 py-1 text-slate-300 hover:bg-ink-700 disabled:opacity-50"
        >
          Decline
        </button>
      </div>
    </div>
  );
}

// Collapsed by default so the order list stays scannable — expand to get what's
// needed to actually address the parcel. Seller-only (see OrderList).
function ShippingAddressDetails({ o }: { o: OrderRow }) {
  return (
    <details className="basis-full rounded-lg border border-ink-800 bg-ink-950/40 p-2 text-xs text-slate-400">
      <summary className="cursor-pointer select-none font-semibold text-slate-300">📍 Shipping address</summary>
      <address className="not-italic mt-1.5 leading-relaxed">
        {o.shipName}<br />
        {o.shipLine1}{o.shipLine2 ? <>, {o.shipLine2}</> : null}<br />
        {o.shipCity}, {o.shipRegion} {o.shipPostcode}<br />
        {o.shipCountry}
        {o.shipPhone && <><br />☎ {o.shipPhone}</>}
      </address>
    </details>
  );
}

function CardCell({ l }: { l: NonNullable<OrderRow["listing"]> | OfferRow["listing"] }) {
  return (
    <Link href={`/card/${l.card.slug ?? l.card.id}`} className="flex min-w-0 items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {l.card.imageThumbUrl ? <img src={l.card.imageThumbUrl} alt="" aria-hidden="true" className="h-12 w-9 shrink-0 rounded-sm object-cover" loading="lazy" decoding="async" /> : <div className="h-12 w-9 shrink-0 rounded-sm bg-ink-800" />}
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-white">{l.card.name}</span>
        <span className="block text-[11px] text-slate-500">
          {l.card.setCode} · {l.card.collectorNumber} · {l.condition}{l.isFoil ? " · ✦" : ""}
        </span>
      </span>
    </Link>
  );
}

export function MarketplaceOrders({ offersEnabled = false }: { offersEnabled?: boolean }) {
  const [tab, setTab] = useState<Tab>("Purchases");
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [made, setMade] = useState<OfferRow[]>([]);
  const [received, setReceived] = useState<OfferRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [reviewFor, setReviewFor] = useState<OrderRow | null>(null);
  const [shipFor, setShipFor] = useState<OrderRow | null>(null);
  const [reportFor, setReportFor] = useState<OrderRow | null>(null);
  const [cancelFor, setCancelFor] = useState<OrderRow | null>(null);

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
  useEffect(() => {
    if (!offersEnabled) setTab((t) => (t === "Offers" ? "Purchases" : t));
  }, [offersEnabled]);

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
  // Offers don't settle through Stripe yet (Phase 2) — hidden at launch so there's
  // no dead-end "complete purchase" button. See MARKETPLACE_OFFERS in lib/marketplace.ts.
  const visibleTabs = offersEnabled ? TABS : TABS.filter((t) => t !== "Offers");

  return (
    <div>
      {flash && (
        <div className="fixed inset-x-0 bottom-4 z-[90] flex justify-center px-4">
          <div className="rounded-xl border border-brand-500/40 bg-ink-900/95 px-4 py-2.5 text-sm font-medium text-slate-100 shadow-2xl">{flash}</div>
        </div>
      )}

      <div className="mb-4 inline-flex rounded-lg border border-ink-700 bg-ink-900 p-0.5 text-sm">
        {visibleTabs.map((t) => (
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
              <TrackingLink o={o} />
              {o.status === "SHIPPED" && !o.cancelRequestedAt && (
                <button onClick={() => act(`/api/marketplace/orders/${o.id}`, { action: "receive" }, "✓ Delivery confirmed")} disabled={!!busy} className="btn-primary text-xs disabled:opacity-50">
                  📬 Got it
                </button>
              )}
              {(o.status === "SHIPPED" || o.status === "COMPLETED") && !o.reviewed && (
                <button onClick={() => setReviewFor(o)} className="btn-ghost text-xs">★ Review seller</button>
              )}
              {o.reviewed && <span className="text-[11px] text-gold">★ {o.rating}/5 left</span>}
              <CancelStatus o={o} busy={busy} onRequest={() => setCancelFor(o)} onAct={act} />
              {["PAID", "SHIPPED", "COMPLETED"].includes(o.status) && !o.disputedAt && (
                <button onClick={() => setReportFor(o)} className="text-[11px] text-slate-500 hover:text-rose-300">Report a problem</button>
              )}
              {o.disputedAt && <span className="text-[11px] text-gold">⚑ Under review</span>}
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
                <button onClick={() => setShipFor(o)} disabled={!!busy} className="btn-primary text-xs disabled:opacity-50">
                  📦 Mark shipped
                </button>
              )}
              {o.status === "SHIPPED" && !o.cancelRequestedAt && (
                o.releaseRequestedAt ? (
                  <span className="text-[11px] text-gold">🔔 Release requested — awaiting admin review</span>
                ) : (
                  <button
                    onClick={() => act(`/api/marketplace/orders/${o.id}`, { action: "request-release" }, "✓ Requested — an admin will check tracking soon")}
                    disabled={!!busy}
                    className="btn-ghost text-xs disabled:opacity-50"
                    title="Believe it's delivered? Ask an admin to check tracking and release sooner than the 14-day timeout."
                  >
                    🔔 Request release
                  </button>
                )
              )}
              <TrackingLink o={o} />
              <PayoutBadge status={o.status} />
              <CancelStatus o={o} busy={busy} onRequest={() => setCancelFor(o)} onAct={act} />
              {["PAID", "SHIPPED", "COMPLETED"].includes(o.status) && !o.disputedAt && (
                <button onClick={() => setReportFor(o)} className="text-[11px] text-slate-500 hover:text-rose-300">Report a problem</button>
              )}
              {o.disputedAt && <span className="text-[11px] text-gold">⚑ Under review</span>}
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

      {shipFor && (
        <ShipModal
          order={shipFor}
          busy={!!busy}
          onClose={() => setShipFor(null)}
          onSubmit={async (carrier, trackingNumber) => {
            const ok = await act(`/api/marketplace/orders/${shipFor.id}`, { action: "ship", carrier, trackingNumber }, "✓ Marked shipped");
            if (ok) setShipFor(null);
          }}
        />
      )}

      {reportFor && (
        <ReportModal
          order={reportFor}
          busy={!!busy}
          onClose={() => setReportFor(null)}
          onSubmit={async (message) => {
            const ok = await act(`/api/marketplace/orders/${reportFor.id}`, { action: "report", message }, "✓ Reported — our team will follow up by email");
            if (ok) setReportFor(null);
          }}
        />
      )}

      {cancelFor && (
        <CancelModal
          order={cancelFor}
          busy={!!busy}
          onClose={() => setCancelFor(null)}
          onSubmit={async (reason) => {
            const ok = await act(`/api/marketplace/orders/${cancelFor.id}`, { action: "request-cancel", reason }, "✓ Cancellation requested — waiting on the other party");
            if (ok) setCancelFor(null);
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
            {orderLabel(o.orderNumber) && <span className="mr-1.5 text-slate-600">{orderLabel(o.orderNumber)}</span>}
            ×{o.quantity} · {o.role === "buyer" ? "from" : "to"} <span className="font-semibold text-white">{o.counterparty}</span>
            <span className="block text-slate-600">{new Date(o.createdAt).toLocaleDateString()}</span>
          </div>
          <span className="text-sm font-extrabold text-accent">{formatMoney(o.totalCents, o.listing?.currency ?? "AUD")}</span>
          <StatusChip s={o.status} />
          <div className="flex items-center gap-2">{renderActions(o)}</div>
          {o.role === "seller" && o.shipLine1 && <ShippingAddressDetails o={o} />}
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

// Structured tracking entry — carrier + number, deep-linked from the buyer's
// side via lib/tracking.ts. No carrier account/API needed, so this works from
// day one without an ABN.
function ShipModal({
  order,
  busy,
  onClose,
  onSubmit,
}: {
  order: OrderRow;
  busy: boolean;
  onClose: () => void;
  onSubmit: (carrier: string, trackingNumber: string) => void;
}) {
  const [carrier, setCarrier] = useState<string>(CARRIERS[0]);
  const [trackingNumber, setTrackingNumber] = useState("");
  const valid = trackingNumber.trim().length >= 3;
  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5 shadow-2xl">
        <h2 className="text-lg font-extrabold text-white">📦 Mark as shipped</h2>
        <p className="mt-1 text-sm text-slate-400">{order.listing?.card.name} ×{order.quantity} to {order.counterparty}</p>
        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-slate-400">Carrier</span>
          <select value={carrier} onChange={(e) => setCarrier(e.target.value)} className="input">
            {CARRIERS.map((c) => <option key={c} value={c}>{CARRIER_LABEL[c]}</option>)}
          </select>
        </label>
        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-slate-400">Tracking number</span>
          <input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} maxLength={60} className="input" placeholder="Off your shipping receipt" />
        </label>
        <p className="mt-2 text-xs text-slate-600">The buyer gets a link straight to the carrier's tracking page. Funds release once they confirm delivery (or automatically 14 days later).</p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
          <button onClick={() => onSubmit(carrier, trackingNumber.trim())} disabled={busy || !valid} className="btn-primary text-sm disabled:opacity-50">
            {busy ? "Saving…" : "Mark shipped"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Opens a support ticket against this order and flags it as disputed — that
// pauses the auto-release cron until an admin resolves it (see /admin/support).
function ReportModal({
  order,
  busy,
  onClose,
  onSubmit,
}: {
  order: OrderRow;
  busy: boolean;
  onClose: () => void;
  onSubmit: (message: string) => void;
}) {
  const [message, setMessage] = useState("");
  const valid = message.trim().length >= 10;
  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5 shadow-2xl">
        <h2 className="text-lg font-extrabold text-white">⚑ Report a problem</h2>
        <p className="mt-1 text-sm text-slate-400">{order.listing?.card.name} ×{order.quantity} — {order.counterparty}</p>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 2000))}
          placeholder="What went wrong? (item not as described, never arrived, damaged, etc.)"
          rows={4}
          className="input mt-3 resize-none"
        />
        <p className="mt-2 text-xs text-slate-600">This opens a support ticket and pauses any automatic payout/refund on this order until our team reviews it.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
          <button onClick={() => onSubmit(message.trim())} disabled={busy || !valid} className="btn-primary text-sm disabled:opacity-50">
            {busy ? "Reporting…" : "Submit report"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Proposes a mutual cancellation — nothing happens until the other party
// accepts (full refund) or declines. No admin gate: both sides consenting
// removes the conflict-of-interest concern that gates delivery confirmation.
function CancelModal({
  order,
  busy,
  onClose,
  onSubmit,
}: {
  order: OrderRow;
  busy: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const valid = reason.trim().length >= 5;
  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5 shadow-2xl">
        <h2 className="text-lg font-extrabold text-white">Request cancellation</h2>
        <p className="mt-1 text-sm text-slate-400">{order.listing?.card.name} ×{order.quantity} — {order.counterparty}</p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 300))}
          placeholder="Why do you want to cancel? (e.g. out of stock, changed my mind, wrong item)"
          rows={3}
          className="input mt-3 resize-none"
        />
        <p className="mt-2 text-xs text-slate-600">
          {order.counterparty} will be asked to accept or decline. Nothing is refunded or restocked unless they
          accept.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost text-sm">Back</button>
          <button onClick={() => onSubmit(reason.trim())} disabled={busy || !valid} className="btn-primary text-sm disabled:opacity-50">
            {busy ? "Sending…" : "Send request"}
          </button>
        </div>
      </div>
    </div>
  );
}
