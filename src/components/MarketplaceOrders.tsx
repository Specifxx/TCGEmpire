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
  groupKey: string;
  sellerId: string;
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

// One "parcel" — every Order row from one checkout, for one seller (see
// orders/route.ts's groupKey). A cart can span multiple sellers and/or several
// items from one seller; either way each seller's share of one checkout is one
// physical shipment, so ship/receive/report/cancel act on the WHOLE group at
// once instead of making the buyer/seller repeat the same action per line.
interface OrderGroup {
  key: string;
  orderIds: string[];
  orders: OrderRow[];
  role: "buyer" | "seller";
  counterparty: string;
  createdAt: string;
  totalCents: number;
  currency: string;
  status: string;
  mixedStatus: boolean;
  carrier: string | null;
  trackingNumber: string | null;
  disputedAt: string | null;
  releaseRequestedAt: string | null;
  cancelRequestedAt: string | null;
  cancelReason: string | null;
  cancelRequestedByRole: "buyer" | "seller" | null;
  reviewed: boolean;
  rating: number | null;
  shipName: string | null;
  shipLine1: string | null;
  shipLine2: string | null;
  shipCity: string | null;
  shipRegion: string | null;
  shipPostcode: string | null;
  shipCountry: string | null;
  shipPhone: string | null;
}

function groupOrders(rows: OrderRow[]): OrderGroup[] {
  const map = new Map<string, OrderRow[]>();
  for (const o of rows) {
    const arr = map.get(o.groupKey) ?? [];
    arr.push(o);
    map.set(o.groupKey, arr);
  }
  return [...map.values()].map((orders) => {
    const first = orders[0]!;
    const shippedRef = orders.find((o) => o.trackingNumber) ?? first;
    const disputed = orders.find((o) => o.disputedAt);
    const released = orders.find((o) => o.releaseRequestedAt);
    const cancelling = orders.find((o) => o.cancelRequestedAt);
    return {
      key: first.groupKey,
      orderIds: orders.map((o) => o.id),
      orders,
      role: first.role,
      counterparty: first.counterparty,
      createdAt: first.createdAt,
      totalCents: orders.reduce((sum, o) => sum + o.totalCents, 0),
      currency: first.listing?.currency ?? "AUD",
      status: first.status,
      mixedStatus: orders.some((o) => o.status !== first.status),
      carrier: shippedRef.carrier,
      trackingNumber: shippedRef.trackingNumber,
      disputedAt: disputed?.disputedAt ?? null,
      releaseRequestedAt: released?.releaseRequestedAt ?? null,
      cancelRequestedAt: cancelling?.cancelRequestedAt ?? null,
      cancelReason: cancelling?.cancelReason ?? null,
      cancelRequestedByRole: cancelling?.cancelRequestedByRole ?? null,
      reviewed: first.reviewed,
      rating: first.rating,
      shipName: first.shipName,
      shipLine1: first.shipLine1,
      shipLine2: first.shipLine2,
      shipCity: first.shipCity,
      shipRegion: first.shipRegion,
      shipPostcode: first.shipPostcode,
      shipCountry: first.shipCountry,
      shipPhone: first.shipPhone,
    };
  });
}

function groupOrderLabel(g: OrderGroup): string | null {
  const numbers = g.orders.map((o) => o.orderNumber).filter((n): n is number => n != null).sort((a, b) => a - b);
  if (numbers.length === 0) return null;
  if (numbers.length === 1) return `RC-${numbers[0]}`;
  return `RC-${numbers[0]} (+${numbers.length - 1} more)`;
}

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

function StatusChip({ s, mixed }: { s: string; mixed?: boolean }) {
  return (
    <span className={`chip text-[10px] font-bold ${STATUS_STYLE[s] ?? "bg-ink-800 text-slate-400"}`} title={mixed ? "Items in this order are at different stages" : undefined}>
      {s}{mixed ? " *" : ""}
    </span>
  );
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
function TrackingLink({ g }: { g: OrderGroup }) {
  if (!g.trackingNumber) return null;
  const url = trackingUrl(g.carrier, g.trackingNumber);
  const label = g.carrier ? CARRIER_LABEL[g.carrier as keyof typeof CARRIER_LABEL] ?? g.carrier : "Tracking";
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-brand-300 hover:underline">
      📦 {label}: {g.trackingNumber}
    </a>
  ) : (
    <span className="text-[11px] text-slate-500">📦 {label}: {g.trackingNumber}</span>
  );
}

// Mutual-agreement cancellation status/actions for one parcel — three states:
// nothing pending (offer to request one), I'm the requester (waiting on the
// other party, can withdraw), or the other party requested it (I can accept —
// full refund of every item in the parcel — or decline).
function CancelStatus({
  g,
  busy,
  onRequest,
  onAct,
}: {
  g: OrderGroup;
  busy: string | null;
  onRequest: () => void;
  onAct: (body: unknown, okMsg: string) => Promise<boolean>;
}) {
  if (g.status !== "PAID" && g.status !== "SHIPPED") return null;

  if (!g.cancelRequestedAt) {
    return (
      <button onClick={onRequest} className="text-[11px] text-slate-500 hover:text-rose-300">
        Request cancellation
      </button>
    );
  }

  const iRequested = g.cancelRequestedByRole === g.role;
  if (iRequested) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-gold">
        <span>⏳ Cancellation requested — awaiting the other party</span>
        <button
          onClick={() => onAct({ action: "withdraw-cancel" }, "Withdrawn")}
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
      <span className="text-slate-400 italic">"{g.cancelReason}"</span>
      <div className="flex gap-1.5">
        <button
          onClick={() => {
            if (typeof window !== "undefined" && !window.confirm("Accept this cancellation? This issues a full refund to the buyer and restocks the listing(s) — it can't be undone.")) return;
            onAct({ action: "accept-cancel" }, "✓ Cancelled and refunded");
          }}
          disabled={!!busy}
          className="rounded bg-brand-500/20 px-2 py-1 font-semibold text-brand-300 hover:bg-brand-500/30 disabled:opacity-50"
        >
          ✅ Accept &amp; refund
        </button>
        <button
          onClick={() => onAct({ action: "decline-cancel" }, "Declined")}
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
function ShippingAddressDetails({ g }: { g: OrderGroup }) {
  return (
    <details className="basis-full rounded-lg border border-ink-800 bg-ink-950/40 p-2 text-xs text-slate-400">
      <summary className="cursor-pointer select-none font-semibold text-slate-300">📍 Shipping address</summary>
      <address className="not-italic mt-1.5 leading-relaxed">
        {g.shipName}<br />
        {g.shipLine1}{g.shipLine2 ? <>, {g.shipLine2}</> : null}<br />
        {g.shipCity}, {g.shipRegion} {g.shipPostcode}<br />
        {g.shipCountry}
        {g.shipPhone && <><br />☎ {g.shipPhone}</>}
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
  const [reviewFor, setReviewFor] = useState<OrderGroup | null>(null);
  const [shipFor, setShipFor] = useState<OrderGroup | null>(null);
  const [reportFor, setReportFor] = useState<OrderGroup | null>(null);
  const [cancelFor, setCancelFor] = useState<OrderGroup | null>(null);

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

  // Single-order actions (offers, reviews) — unchanged.
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

  // Group actions — applies to every Order row in one parcel at once via the
  // bulk endpoint (see api/marketplace/orders/bulk).
  async function groupAct(orderIds: string[], body: unknown, okMsg: string) {
    const key = `bulk:${orderIds.join(",")}`;
    setBusy(key);
    try {
      const res = await fetch("/api/marketplace/orders/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds, ...(body as Record<string, unknown>) }),
      });
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

  const purchases = groupOrders(orders.filter((o) => o.role === "buyer"));
  const sales = groupOrders(orders.filter((o) => o.role === "seller"));
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
          groups={purchases}
          empty="No purchases yet — the marketplace grid is one tab away."
          renderActions={(g) => (
            <>
              <TrackingLink g={g} />
              {g.status === "SHIPPED" && !g.cancelRequestedAt && (
                <button onClick={() => groupAct(g.orderIds, { action: "receive" }, "✓ Delivery confirmed")} disabled={!!busy} className="btn-primary text-xs disabled:opacity-50">
                  📬 Got it
                </button>
              )}
              {(g.status === "SHIPPED" || g.status === "COMPLETED") && !g.reviewed && (
                <button onClick={() => setReviewFor(g)} className="btn-ghost text-xs">★ Review seller</button>
              )}
              {g.reviewed && <span className="text-[11px] text-gold">★ {g.rating}/5 left</span>}
              <CancelStatus g={g} busy={busy} onRequest={() => setCancelFor(g)} onAct={(body, msg) => groupAct(g.orderIds, body, msg)} />
              {["PAID", "SHIPPED", "COMPLETED"].includes(g.status) && !g.disputedAt && (
                <button onClick={() => setReportFor(g)} className="text-[11px] text-slate-500 hover:text-rose-300">Report a problem</button>
              )}
              {g.disputedAt && <span className="text-[11px] text-gold">⚑ Under review</span>}
            </>
          )}
        />
      )}

      {tab === "Sales" && (
        <OrderList
          groups={sales}
          empty="No sales yet."
          renderActions={(g) => (
            <>
              {g.status === "PAID" && (
                <button onClick={() => setShipFor(g)} disabled={!!busy} className="btn-primary text-xs disabled:opacity-50">
                  📦 Mark shipped
                </button>
              )}
              {g.status === "SHIPPED" && !g.cancelRequestedAt && (
                g.releaseRequestedAt ? (
                  <span className="text-[11px] text-gold">🔔 Release requested — awaiting admin review</span>
                ) : (
                  <button
                    onClick={() => groupAct(g.orderIds, { action: "request-release" }, "✓ Requested — an admin will check tracking soon")}
                    disabled={!!busy}
                    className="btn-ghost text-xs disabled:opacity-50"
                    title="Believe it's delivered? Ask an admin to check tracking and release sooner than the 14-day timeout."
                  >
                    🔔 Request release
                  </button>
                )
              )}
              <TrackingLink g={g} />
              <PayoutBadge status={g.status} />
              <CancelStatus g={g} busy={busy} onRequest={() => setCancelFor(g)} onAct={(body, msg) => groupAct(g.orderIds, body, msg)} />
              {["PAID", "SHIPPED", "COMPLETED"].includes(g.status) && !g.disputedAt && (
                <button onClick={() => setReportFor(g)} className="text-[11px] text-slate-500 hover:text-rose-300">Report a problem</button>
              )}
              {g.disputedAt && <span className="text-[11px] text-gold">⚑ Under review</span>}
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
          group={reviewFor}
          busy={!!busy}
          onClose={() => setReviewFor(null)}
          onSubmit={async (rating, comment) => {
            const ok = await act("/api/marketplace/reviews", { orderId: reviewFor.orderIds[0], rating, comment: comment || undefined }, "✓ Review posted — thanks!");
            if (ok) setReviewFor(null);
          }}
        />
      )}

      {shipFor && (
        <ShipModal
          group={shipFor}
          busy={!!busy}
          onClose={() => setShipFor(null)}
          onSubmit={async (carrier, trackingNumber) => {
            const ok = await groupAct(shipFor.orderIds, { action: "ship", carrier, trackingNumber }, "✓ Marked shipped");
            if (ok) setShipFor(null);
          }}
        />
      )}

      {reportFor && (
        <ReportModal
          group={reportFor}
          busy={!!busy}
          onClose={() => setReportFor(null)}
          onSubmit={async (message) => {
            const ok = await groupAct(reportFor.orderIds, { action: "report", message }, "✓ Reported — our team will follow up by email");
            if (ok) setReportFor(null);
          }}
        />
      )}

      {cancelFor && (
        <CancelModal
          group={cancelFor}
          busy={!!busy}
          onClose={() => setCancelFor(null)}
          onSubmit={async (reason) => {
            const ok = await groupAct(cancelFor.orderIds, { action: "request-cancel", reason }, "✓ Cancellation requested — waiting on the other party");
            if (ok) setCancelFor(null);
          }}
        />
      )}
    </div>
  );
}

function OrderList({
  groups,
  empty,
  renderActions,
}: {
  groups: OrderGroup[];
  empty: string;
  renderActions: (g: OrderGroup) => React.ReactNode;
}) {
  if (groups.length === 0) return <p className="card-surface p-8 text-center text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="card-surface divide-y divide-ink-800">
      {groups.map((g) => (
        <li key={g.key} className="flex flex-wrap items-start gap-3 p-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-slate-400">
              {groupOrderLabel(g) && <span className="text-slate-600">{groupOrderLabel(g)}</span>}
              <span>{g.role === "buyer" ? "from" : "to"} <span className="font-semibold text-white">{g.counterparty}</span></span>
              <span className="text-slate-600">{new Date(g.createdAt).toLocaleDateString()}</span>
            </div>
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {g.orders.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3">
                  {o.listing ? <CardCell l={o.listing} /> : <span className="text-sm text-slate-500">(listing removed)</span>}
                  <span className="shrink-0 text-xs text-slate-500">×{o.quantity}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span className="text-sm font-extrabold text-accent">{formatMoney(g.totalCents, g.currency)}</span>
            <StatusChip s={g.status} mixed={g.mixedStatus} />
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 border-t border-ink-800 pt-2">{renderActions(g)}</div>
          {g.role === "seller" && g.shipLine1 && <ShippingAddressDetails g={g} />}
        </li>
      ))}
    </ul>
  );
}

function ReviewModal({
  group,
  busy,
  onClose,
  onSubmit,
}: {
  group: OrderGroup;
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
        <h2 className="text-lg font-extrabold text-white">★ Review {group.counterparty}</h2>
        <p className="mt-1 text-sm text-slate-400">{group.orders.length === 1 ? group.orders[0]!.listing?.card.name : `${group.orders.length} items`}</p>
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
// day one without an ABN. One entry ships every item in the parcel at once.
function ShipModal({
  group,
  busy,
  onClose,
  onSubmit,
}: {
  group: OrderGroup;
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
        <p className="mt-1 text-sm text-slate-400">
          {group.orders.length === 1 ? `${group.orders[0]!.listing?.card.name} ×${group.orders[0]!.quantity}` : `${group.orders.length} items`} to {group.counterparty}
        </p>
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
        <p className="mt-2 text-xs text-slate-600">
          {group.orders.length > 1 ? "Applies to every item in this order — enter tracking once." : "The buyer gets a link straight to the carrier's tracking page."} Funds release once the buyer confirms delivery (or automatically 14 days later).
        </p>
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
  group,
  busy,
  onClose,
  onSubmit,
}: {
  group: OrderGroup;
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
        <p className="mt-1 text-sm text-slate-400">
          {group.orders.length === 1 ? `${group.orders[0]!.listing?.card.name} ×${group.orders[0]!.quantity}` : `${group.orders.length} items`} — {group.counterparty}
        </p>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value.slice(0, 2000))}
          placeholder="What went wrong? (item not as described, never arrived, damaged, etc.)"
          rows={4}
          className="input mt-3 resize-none"
        />
        <p className="mt-2 text-xs text-slate-600">This opens one support ticket for the whole order and pauses any automatic payout/refund until our team reviews it.</p>
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
// accepts (full refund of every item in the order) or declines. No admin gate:
// both sides consenting removes the conflict-of-interest concern that gates
// delivery confirmation.
function CancelModal({
  group,
  busy,
  onClose,
  onSubmit,
}: {
  group: OrderGroup;
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
        <p className="mt-1 text-sm text-slate-400">
          {group.orders.length === 1 ? `${group.orders[0]!.listing?.card.name} ×${group.orders[0]!.quantity}` : `${group.orders.length} items`} — {group.counterparty}
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 300))}
          placeholder="Why do you want to cancel? (e.g. out of stock, changed my mind, wrong item)"
          rows={3}
          className="input mt-3 resize-none"
        />
        <p className="mt-2 text-xs text-slate-600">
          {group.counterparty} will be asked to accept or decline. Nothing is refunded or restocked unless they
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
