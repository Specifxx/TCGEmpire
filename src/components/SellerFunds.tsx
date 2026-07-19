"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { StripeErrorNotice } from "./StripeErrorNotice";
import { formatDay } from "@/lib/delivery-estimate";

// Pure display helper (kept local — lib/order-number.ts pulls in the Prisma
// client, which can't ship in a "use client" bundle).
function formatOrderNumber(n: number | null): string | null {
  return n == null ? null : `RC-${n}`;
}

interface CurrencyAmount {
  currency: string;
  netCents: number;
}

interface RecentOrder {
  id: string;
  orderNumber: number | null;
  status: string;
  totalCents: number;
  feeCents: number;
  currency: string;
  createdAt: string;
  transferredAt: string | null;
  // Server-computed concrete dates (api/marketplace/funds) — "when do I get
  // paid" answered exactly instead of a generic rule.
  shipByAt: string | null;
  releasesAt: string | null;
}

interface Funds {
  hasAccount: boolean;
  payoutsEnabled: boolean;
  completedSalesCount: number;
  held: CurrencyAmount[];
  released: CurrencyAmount[];
  // COMPLETED sales that never transferred — the seller hadn't finished Stripe
  // Connect onboarding when the sale completed. Real, owed money; it releases
  // automatically the moment payouts are enabled (see connect-webhook/route.ts).
  readyForPayout: CurrencyAmount[];
  recent: RecentOrder[];
}

function orderStatusLabel(o: RecentOrder): string {
  if (o.status === "COMPLETED" && !o.transferredAt) return "Ready — finish payouts to receive it";
  if (o.status === "COMPLETED") return "Released";
  if (o.status === "SHIPPED") return o.releasesAt ? `Releases ${formatDay(o.releasesAt)}` : "Held — in transit";
  if (o.status === "PAID") return o.shipByAt ? `Held — ship by ${formatDay(o.shipByAt)}` : "Held — awaiting shipment";
  return o.status;
}

export function SellerFunds() {
  const [funds, setFunds] = useState<Funds | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/marketplace/funds").catch(() => null);
    if (res?.ok) setFunds(await res.json());
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function openStripe() {
    setConnecting(true);
    setError(null);
    const res = await fetch("/api/marketplace/stripe/connect", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setConnecting(false);
    if (res.ok && data.url) {
      window.location.href = data.url;
    } else {
      setError(data.error ?? "Couldn't reach Stripe — try again shortly");
    }
  }

  if (!funds) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-700 border-t-brand-400" /> Loading…
      </p>
    );
  }

  const releaseDates = funds.recent.filter((o) => o.status === "SHIPPED" && o.releasesAt).map((o) => new Date(o.releasesAt!).getTime());
  const earliestRelease = releaseDates.length ? new Date(Math.min(...releaseDates)) : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="card-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-white">Payouts</h2>
            <p className="text-sm text-slate-500">
              {funds.payoutsEnabled
                ? "Payouts are enabled — funds transfer to your connected Stripe account once an order completes."
                : "Connect a Stripe account to receive payouts. Stripe handles identity verification for you."}
            </p>
          </div>
          <button onClick={openStripe} disabled={connecting} className="btn-primary whitespace-nowrap">
            {connecting ? "Opening Stripe…" : funds.payoutsEnabled ? "View Stripe dashboard →" : funds.hasAccount ? "Finish setup →" : "Enable payouts →"}
          </button>
        </div>
        {error && <StripeErrorNotice message={error} />}
      </div>

      {funds.readyForPayout.length > 0 && (
        <div className="card-surface border-gold/40 bg-gold/5 p-5">
          <h3 className="mb-1 font-bold text-white">Ready to pay out — finish Stripe setup to receive it</h3>
          <p className="text-sm text-slate-400">
            These sales already completed, but you hadn&apos;t finished payout setup yet — the money is real and owed
            to you. It releases automatically the moment you finish connecting Stripe.
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {funds.readyForPayout.map((h) => (
              <li key={h.currency} className="text-xl font-bold text-gold">{formatMoney(h.netCents, h.currency)}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card-surface p-5">
          <h3 className="mb-2 text-sm font-semibold text-slate-400">Held (pending delivery)</h3>
          {funds.held.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing held right now.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {funds.held.map((h) => (
                <li key={h.currency} className="text-xl font-bold text-white">{formatMoney(h.netCents, h.currency)}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-slate-600">
            Each shipped order releases automatically 14 days after you mark it shipped — sooner if the buyer
            confirms. See the exact date per order below.
            {earliestRelease && <> Earliest: <strong className="text-slate-400">{formatDay(earliestRelease)}</strong>.</>}
          </p>
        </div>
        <div className="card-surface p-5">
          <h3 className="mb-2 text-sm font-semibold text-slate-400">Released to date</h3>
          {funds.released.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing released yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {funds.released.map((h) => (
                <li key={h.currency} className="text-xl font-bold text-brand-300">{formatMoney(h.netCents, h.currency)}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-slate-600">Paid out to your bank on your Stripe account's normal payout schedule.</p>
        </div>
      </div>

      <div className="card-surface p-5">
        <h3 className="mb-3 font-bold text-white">Recent orders</h3>
        {funds.recent.length === 0 ? (
          <p className="text-sm text-slate-500">No orders yet.</p>
        ) : (
          <ul className="divide-y divide-ink-800">
            {funds.recent.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="text-slate-400">{formatOrderNumber(o.orderNumber) ?? o.id.slice(0, 8)}</span>
                <span className={o.status === "COMPLETED" && !o.transferredAt ? "text-gold" : "text-slate-500"}>{orderStatusLabel(o)}</span>
                <span className="font-semibold text-white">{formatMoney(o.totalCents - o.feeCents, o.currency)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link href="/marketplace/orders" className="text-sm text-brand-300 hover:underline">See full order history →</Link>
    </div>
  );
}
