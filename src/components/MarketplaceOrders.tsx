"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { CARRIERS, CARRIER_LABEL, trackingUrl } from "@/lib/tracking";
import { formatDay, formatDateRange } from "@/lib/delivery-estimate";

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
  paidAt: string | null;
  shippedAt: string | null;
  receivedAt: string | null;
  transferredAt: string | null;
  trackingNote: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  disputedAt: string | null;
  // Concrete dates computed server-side (api/marketplace/orders) — never
  // recomputed client-side, so these always match what the cron enforces.
  shipByAt: string | null;
  autoReleaseAt: string | null;
  eta: { from: string; to: string } | null;
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
  unreadMessages: number;
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
  feeCents: number;
  currency: string;
  status: string;
  mixedStatus: boolean;
  carrier: string | null;
  trackingNumber: string | null;
  disputedAt: string | null;
  paidAt: string | null;
  shippedAt: string | null;
  receivedAt: string | null;
  transferredAt: string | null;
  shipByAt: string | null;
  autoReleaseAt: string | null;
  eta: { from: string; to: string } | null;
  releaseRequestedAt: string | null;
  cancelRequestedAt: string | null;
  cancelReason: string | null;
  cancelRequestedByRole: "buyer" | "seller" | null;
  unreadMessages: number;
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
      feeCents: orders.reduce((sum, o) => sum + o.feeCents, 0),
      currency: first.listing?.currency ?? "AUD",
      status: first.status,
      mixedStatus: orders.some((o) => o.status !== first.status),
      carrier: shippedRef.carrier,
      trackingNumber: shippedRef.trackingNumber,
      disputedAt: disputed?.disputedAt ?? null,
      paidAt: shippedRef.paidAt,
      shippedAt: shippedRef.shippedAt,
      receivedAt: shippedRef.receivedAt,
      transferredAt: shippedRef.transferredAt,
      shipByAt: shippedRef.shipByAt,
      autoReleaseAt: shippedRef.autoReleaseAt,
      eta: shippedRef.eta,
      releaseRequestedAt: released?.releaseRequestedAt ?? null,
      cancelRequestedAt: cancelling?.cancelRequestedAt ?? null,
      cancelReason: cancelling?.cancelReason ?? null,
      cancelRequestedByRole: cancelling?.cancelRequestedByRole ?? null,
      unreadMessages: first.unreadMessages,
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
// connected Stripe account — see lib/connect.ts's releaseFundsForOrder. Shown
// on BOTH sides now: sellers see when they'll be paid, buyers see their
// payment protection is live until the same concrete date.
function PayoutBadge({ g, role }: { g: OrderGroup; role: "buyer" | "seller" }) {
  if (g.status === "PAID" || g.status === "SHIPPED") {
    const dateStr = g.autoReleaseAt ? ` on ${formatDay(g.autoReleaseAt)}` : "";
    const title =
      role === "seller"
        ? `Funds release automatically${dateStr} unless a problem is reported — sooner if the buyer confirms delivery`
        : `Your payment is held by RiftCompare until you confirm delivery${dateStr ? ` (or automatically${dateStr})` : ""}`;
    return (
      <span className="chip bg-ink-800 text-[10px] font-bold text-slate-400" title={title}>
        🔒 {role === "seller" ? "Held" : "Protected"}
      </span>
    );
  }
  if (g.status === "COMPLETED") {
    return (
      <span className="chip bg-brand-500/15 text-[10px] font-bold text-brand-300" title={role === "seller" ? "Delivery confirmed — funds have been transferred to your Stripe account" : "Delivery confirmed"}>
        🔓 {role === "seller" ? "Released" : "Complete"}
      </span>
    );
  }
  return null;
}

// Ship-by countdown for a seller's PAID sale — turns red under 24h so the
// deadline doesn't arrive as a surprise auto-cancellation.
function ShipByChip({ shipByAt }: { shipByAt: string | null }) {
  if (!shipByAt) return null;
  const remainingMs = new Date(shipByAt).getTime() - Date.now();
  const urgent = remainingMs < 86_400_000;
  return (
    <span
      className={`chip text-[10px] font-bold ${urgent ? "bg-rose-500/15 text-rose-300" : "bg-ink-800 text-slate-400"}`}
      title="Ship by this date or the order auto-cancels and the buyer is refunded in full"
    >
      {urgent ? "⚠ " : ""}Ship by {formatDay(shipByAt)}
    </span>
  );
}

// Opens the buyer/seller message thread for this parcel — available at any
// status (buyers may want to ask something before it even ships).
function MessageButton({ g, onClick }: { g: OrderGroup; onClick: () => void }) {
  return (
    <button onClick={onClick} className="btn-ghost relative text-xs">
      💬 Message
      {g.unreadMessages > 0 && (
        <span className="num absolute -right-1.5 -top-1.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-ink-950">
          {g.unreadMessages > 9 ? "9+" : g.unreadMessages}
        </span>
      )}
    </button>
  );
}

// One concrete-date sentence explaining what happens next, per role/status —
// replaces vague "14 days" prose with the exact date this order will act on.
function nextStepLine(g: OrderGroup): string | null {
  if (g.disputedAt) return "Payout paused while our team reviews your report.";
  if (g.role === "buyer") {
    if (g.status === "PAID" && g.shipByAt) return `Seller must ship by ${formatDay(g.shipByAt)} or you're automatically refunded in full.`;
    if (g.status === "SHIPPED" && g.autoReleaseAt) return `Auto-completes on ${formatDay(g.autoReleaseAt)} unless you report a problem — confirm delivery once it lands.`;
  } else {
    if (g.status === "PAID" && g.shipByAt) return `Ship by ${formatDay(g.shipByAt)} — after that the order auto-refunds.`;
    if (g.status === "SHIPPED" && g.autoReleaseAt) return `Funds release automatically on ${formatDay(g.autoReleaseAt)} — sooner if the buyer confirms.`;
  }
  return null;
}

// Dot-stepper: Ordered → Shipped → Est. delivery (estimate, skipped once
// unavailable) → Confirmed → Funds released (seller only). Cancelled/refunded
// parcels just show the status chip already rendered above — no timeline.
function ParcelTimeline({ g }: { g: OrderGroup }) {
  if (g.status === "CANCELLED" || g.status === "REFUNDED") return null;
  const steps: { label: string; done: boolean; sub?: string }[] = [
    { label: "Ordered", done: true, sub: formatDay(g.paidAt ?? g.createdAt) },
    { label: "Shipped", done: !!g.shippedAt, sub: g.shippedAt ? formatDay(g.shippedAt) : g.shipByAt ? `by ${formatDay(g.shipByAt)}` : undefined },
  ];
  if (g.eta) {
    steps.push({ label: "Est. delivery", done: !!g.receivedAt, sub: `${formatDateRange(g.eta.from, g.eta.to)} (est.)` });
  }
  steps.push({ label: "Confirmed", done: !!g.receivedAt, sub: g.receivedAt ? formatDay(g.receivedAt) : undefined });
  if (g.role === "seller") {
    steps.push({ label: "Paid out", done: !!g.transferredAt, sub: g.transferredAt ? formatDay(g.transferredAt) : undefined });
  }
  return (
    <div className="flex w-full flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px]">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.done ? "bg-brand-400" : "bg-ink-700"}`} />
          <span className={s.done ? "text-slate-300" : "text-slate-600"}>
            {s.label}
            {s.sub ? <span className="text-slate-500"> · {s.sub}</span> : null}
          </span>
          {i < steps.length - 1 && <span className="text-ink-700">→</span>}
        </div>
      ))}
    </div>
  );
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
  const [messagesFor, setMessagesFor] = useState<OrderGroup | null>(null);

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
              <MessageButton g={g} onClick={() => setMessagesFor(g)} />
              <TrackingLink g={g} />
              <PayoutBadge g={g} role="buyer" />
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
              <MessageButton g={g} onClick={() => setMessagesFor(g)} />
              {g.status === "PAID" && (
                <>
                  <ShipByChip shipByAt={g.shipByAt} />
                  <button onClick={() => setShipFor(g)} disabled={!!busy} className="btn-primary text-xs disabled:opacity-50">
                    📦 Mark shipped
                  </button>
                </>
              )}
              {g.status === "SHIPPED" && !g.cancelRequestedAt && (
                g.releaseRequestedAt ? (
                  <span className="text-[11px] text-gold">🔔 Early release requested — awaiting admin review</span>
                ) : (
                  <button
                    onClick={() => groupAct(g.orderIds, { action: "request-release" }, "✓ Requested — an admin will check tracking soon")}
                    disabled={!!busy}
                    className="btn-ghost text-xs disabled:opacity-50"
                    title="This already auto-releases on its scheduled date — ask us to verify tracking and release early instead."
                  >
                    🔔 Ask for early release
                  </button>
                )
              )}
              <TrackingLink g={g} />
              <PayoutBadge g={g} role="seller" />
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
                      <Link
                        href={of.listing.card.slug ? `/card/${of.listing.card.slug}` : `/card/${of.listing.card.id}`}
                        className="btn-primary text-xs"
                      >
                        🤝 Accepted — buy it from the card page
                      </Link>
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

      {messagesFor && (
        <MessageThreadModal
          group={messagesFor}
          onClose={() => {
            setMessagesFor(null);
            load(); // refresh unread-count badges now that the thread's been read
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
            {g.role === "seller" ? (
              <div className="text-right">
                <span className="text-sm font-extrabold text-accent">{formatMoney(g.totalCents - g.feeCents, g.currency)}</span>
                <div className="text-[10px] text-slate-500" title="RiftCompare's marketplace fee — 2% standard, 1% for Premium sellers">
                  {formatMoney(g.totalCents, g.currency)} sale − {formatMoney(g.feeCents, g.currency)} fee
                </div>
              </div>
            ) : (
              <span className="text-sm font-extrabold text-accent">{formatMoney(g.totalCents, g.currency)}</span>
            )}
            <StatusChip s={g.status} mixed={g.mixedStatus} />
          </div>
          <div className="w-full border-t border-ink-800 pt-2">
            <ParcelTimeline g={g} />
            {nextStepLine(g) && <p className="mt-1 text-[11px] text-slate-500">{nextStepLine(g)}</p>}
          </div>
          <div className="flex w-full flex-wrap items-center gap-2">{renderActions(g)}</div>
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
          {group.orders.length > 1 ? "Applies to every item in this order — enter tracking once." : "The buyer gets a link straight to the carrier's tracking page."} Funds release automatically on a fixed date 14 days from today — sooner if the buyer confirms delivery first.
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

interface ThreadMessage {
  id: string;
  mine: boolean;
  body: string;
  createdAt: string;
}

// Buyer/seller chat thread for one parcel — scoped to a real order (not
// pre-purchase listing questions). Polls the anchor order's messages endpoint
// (see api/marketplace/orders/[id]/messages) — any order id in the group
// resolves to the same shared thread server-side.
function MessageThreadModal({ group, onClose }: { group: OrderGroup; onClose: () => void }) {
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const anchorOrderId = group.orderIds[0]!;

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/marketplace/orders/${anchorOrderId}/messages`);
      const data = await res.json();
      if (res.ok) setMessages(data.messages ?? []);
    } catch {
      /* keep whatever's already shown — a failed poll shouldn't clear the thread */
    }
  }, [anchorOrderId]);

  useEffect(() => {
    void load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/marketplace/orders/${anchorOrderId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't send — try again");
        return;
      }
      setMessages((prev) => [...(prev ?? []), data.message]);
      setDraft("");
    } catch {
      setError("Network error — try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 shadow-2xl" style={{ height: "min(80vh, 640px)" }}>
        <div className="flex items-center justify-between border-b border-ink-700 px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-white">💬 {group.counterparty}</h2>
            <p className="truncate text-xs text-slate-500">
              {group.orders.length === 1 ? group.orders[0]!.listing?.card.name : `${group.orders.length} items`}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-ink-800 hover:text-slate-200">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {messages === null ? (
            <p className="mt-6 text-center text-sm text-slate-500">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="mt-6 text-center text-sm text-slate-500">No messages yet — say hi 👋</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {messages.map((m) => (
                <li key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${
                      m.mine ? "bg-brand-500 text-ink-950" : "bg-ink-800 text-slate-200"
                    }`}
                  >
                    {m.body}
                    <div className={`mt-0.5 text-[10px] ${m.mine ? "text-ink-950/60" : "text-slate-500"}`}>
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div ref={bottomRef} />
        </div>

        {error && <p className="px-4 text-xs text-rose-400">{error}</p>}
        <div className="flex items-end gap-2 border-t border-ink-700 p-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Message…"
            rows={1}
            className="input max-h-24 flex-1 resize-none py-2"
          />
          <button onClick={send} disabled={sending || !draft.trim()} className="btn-primary shrink-0 text-sm disabled:opacity-50">
            {sending ? "…" : "Send"}
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
