"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { StripeErrorNotice } from "./StripeErrorNotice";
import { formatDay } from "@/lib/delivery-estimate";
import { MARKETPLACE_FEE_BPS, MARKETPLACE_AUTO_RELEASE_DAYS } from "@/lib/marketplace-policy";
import { EarningsChart, type EarningsPoint } from "./EarningsChart";

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
  series: { currency: string; points: EarningsPoint[] } | null;
}

type PayoutInterval = "manual" | "daily" | "weekly" | "monthly";
interface PayoutSchedule {
  interval: PayoutInterval;
  delayDays: number | null;
  weeklyAnchor: string | null;
  monthlyAnchor: number | null;
}

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const WEEKDAY_LABEL: Record<string, string> = {
  monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday", friday: "Friday",
};

function orderStatusLabel(o: RecentOrder): string {
  if (o.status === "COMPLETED" && !o.transferredAt) return "Ready — finish payouts to receive it";
  if (o.status === "COMPLETED") return "Released";
  if (o.status === "SHIPPED") return o.releasesAt ? `Releases ${formatDay(o.releasesAt)}` : "Held — in transit";
  if (o.status === "PAID") return o.shipByAt ? `Held — ship by ${formatDay(o.shipByAt)}` : "Held — awaiting shipment";
  return o.status;
}

function scheduleSummary(s: PayoutSchedule): string {
  if (s.interval === "manual") return "Manual — funds stay in your Stripe balance until you request a payout";
  if (s.interval === "weekly") return `Automatic — every ${s.weeklyAnchor ? WEEKDAY_LABEL[s.weeklyAnchor] ?? s.weeklyAnchor : "week"}`;
  if (s.interval === "monthly") return `Automatic — the ${ordinal(s.monthlyAnchor ?? 1)} of each month`;
  return "Automatic — daily";
}

function ordinal(n: number): string {
  if (n >= 29 || (n >= 11 && n <= 13)) return `${n}th`;
  const last = n % 10;
  return `${n}${last === 1 ? "st" : last === 2 ? "nd" : last === 3 ? "rd" : "th"}`;
}

interface PayoutRecord {
  id: string;
  amountCents: number;
  currency: string;
  status: "pending" | "in_transit" | "paid" | "failed" | "canceled";
  arrivalDate: string;
  createdAt: string;
  automatic: boolean;
  failureMessage: string | null;
}

function payoutStatus(p: PayoutRecord): { text: string; tone: string } {
  switch (p.status) {
    case "pending":
      return { text: `Pending — expected ${formatDay(p.arrivalDate)}`, tone: "bg-gold/15 text-gold" };
    case "in_transit":
      return { text: `Sent — arriving ${formatDay(p.arrivalDate)}`, tone: "bg-sky-500/15 text-sky-300" };
    case "paid":
      return { text: `Paid — arrived ${formatDay(p.arrivalDate)}`, tone: "bg-brand-500/15 text-brand-300" };
    case "failed":
      return { text: p.failureMessage ? `Failed — ${p.failureMessage}` : "Failed", tone: "bg-rose-500/15 text-rose-300" };
    case "canceled":
      return { text: "Cancelled", tone: "bg-ink-800 text-slate-400" };
  }
}

// Real Payout objects from Stripe (never guessed) — this is what answers
// "when does it actually land in my bank": a pending/in_transit payout's
// arrivalDate IS Stripe's own expected-arrival date, so there's nothing to
// predict ourselves, just surface what Stripe has already scheduled.
function PayoutHistoryCard() {
  const [payouts, setPayouts] = useState<PayoutRecord[] | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/marketplace/stripe/payouts").catch(() => null);
    if (res?.ok) setPayouts((await res.json()).payouts ?? []);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!payouts) {
    return (
      <div className="card-surface p-5">
        <h3 className="font-bold text-white">Payout history</h3>
        <p className="mt-1 text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="card-surface p-5">
      <h3 className="mb-1 font-bold text-white">Payout history</h3>
      <p className="mb-3 text-sm text-slate-500">
        Real payouts from Stripe to your bank — each one shows exactly when it&apos;s expected, or when it actually arrived.
      </p>
      {payouts.length === 0 ? (
        <p className="text-sm text-slate-500">
          No payouts yet — this fills in once a release reaches your Stripe balance and gets paid out.
        </p>
      ) : (
        <ul className="divide-y divide-ink-800">
          {payouts.map((p) => {
            const { text, tone } = payoutStatus(p);
            return (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className={`chip ${tone}`}>{text}</span>
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-white">{formatMoney(p.amountCents, p.currency.toUpperCase())}</span>
                  {!p.automatic && <span className="text-[10px] text-slate-500">manual</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Payout schedule card — lets a seller choose how Stripe moves their balance to
// their bank (or hold it entirely and pay themselves out on demand). Only
// rendered once payouts are enabled; the schedule itself lives on Stripe's side
// (read/written live, never cached here — see lib/connect.ts).
function PayoutScheduleCard() {
  const [schedule, setSchedule] = useState<PayoutSchedule | null>(null);
  const [draftInterval, setDraftInterval] = useState<PayoutInterval>("daily");
  const [weeklyAnchor, setWeeklyAnchor] = useState("monday");
  const [monthlyAnchor, setMonthlyAnchor] = useState(1);
  const [saving, setSaving] = useState(false);
  const [payingOut, setPayingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/marketplace/stripe/payout-schedule").catch(() => null);
    if (!res?.ok) return;
    const data: PayoutSchedule = await res.json();
    setSchedule(data);
    setDraftInterval(data.interval);
    if (data.weeklyAnchor) setWeeklyAnchor(data.weeklyAnchor);
    if (data.monthlyAnchor) setMonthlyAnchor(data.monthlyAnchor);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/marketplace/stripe/payout-schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interval: draftInterval, weeklyAnchor, monthlyAnchor }),
    }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setSaving(false);
    if (res?.ok) {
      setSchedule(data);
      setNotice("Payout schedule updated.");
    } else {
      setError(data?.error ?? "Couldn't reach Stripe — try again shortly");
    }
  }

  async function payOutNow() {
    setPayingOut(true);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/marketplace/stripe/payout-now", { method: "POST" }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setPayingOut(false);
    if (res?.ok) {
      setNotice("Payout requested — it's on its way to your bank.");
    } else {
      setError(data?.error ?? "Couldn't reach Stripe — try again shortly");
    }
  }

  if (!schedule) {
    return (
      <div className="card-surface p-5">
        <h3 className="font-bold text-white">Payout schedule</h3>
        <p className="mt-1 text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  const dirty =
    draftInterval !== schedule.interval ||
    (draftInterval === "weekly" && weeklyAnchor !== schedule.weeklyAnchor) ||
    (draftInterval === "monthly" && monthlyAnchor !== schedule.monthlyAnchor);

  return (
    <div className="card-surface p-5">
      <h3 className="font-bold text-white">Payout schedule</h3>
      <p className="mt-1 text-sm text-slate-500">
        Currently: <strong className="text-slate-300">{scheduleSummary(schedule)}</strong>.
        {schedule.delayDays != null && (
          <> Funds become payout-eligible {schedule.delayDays} day{schedule.delayDays === 1 ? "" : "s"} after they land in
          your Stripe balance (a Stripe/country minimum, not something RiftCompare sets) — then this schedule takes over.</>
        )}
      </p>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-slate-400">Schedule</span>
          <select value={draftInterval} onChange={(e) => setDraftInterval(e.target.value as PayoutInterval)} className="input">
            <option value="daily">Automatic — daily</option>
            <option value="weekly">Automatic — weekly</option>
            <option value="monthly">Automatic — monthly</option>
            <option value="manual">Manual — I&apos;ll request payouts myself</option>
          </select>
        </label>
        {draftInterval === "weekly" && (
          <label className="text-sm">
            <span className="mb-1 block text-slate-400">Day</span>
            <select value={weeklyAnchor} onChange={(e) => setWeeklyAnchor(e.target.value)} className="input">
              {WEEKDAYS.map((d) => <option key={d} value={d}>{WEEKDAY_LABEL[d]}</option>)}
            </select>
          </label>
        )}
        {draftInterval === "monthly" && (
          <label className="text-sm">
            <span className="mb-1 block text-slate-400">Day of month</span>
            <select value={monthlyAnchor} onChange={(e) => setMonthlyAnchor(Number(e.target.value))} className="input">
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{ordinal(d)}</option>)}
            </select>
          </label>
        )}
        <button onClick={save} disabled={saving || !dirty} className="btn-primary">
          {saving ? "Saving…" : "Save schedule"}
        </button>
        {schedule.interval === "manual" && (
          <button onClick={payOutNow} disabled={payingOut} className="btn-ghost">
            {payingOut ? "Requesting…" : "Pay out now →"}
          </button>
        )}
      </div>

      {draftInterval === "manual" && (
        <p className="mt-2 text-xs text-slate-600">
          Manual means Stripe won&apos;t move anything to your bank on its own — your balance just sits there until you
          click &ldquo;Pay out now&rdquo;. Useful if you&apos;d rather batch withdrawals yourself.
        </p>
      )}

      {notice && <p className="mt-2 text-xs text-brand-300">{notice}</p>}
      {error && <StripeErrorNotice message={error} />}
    </div>
  );
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
              {" "}All figures below are net of RiftCompare&apos;s {MARKETPLACE_FEE_BPS / 100}% marketplace fee — the amount you actually receive.
            </p>
          </div>
          <button onClick={openStripe} disabled={connecting} className="btn-primary whitespace-nowrap">
            {connecting ? "Opening Stripe…" : funds.payoutsEnabled ? "View Stripe dashboard →" : funds.hasAccount ? "Finish setup →" : "Enable payouts →"}
          </button>
        </div>
        {error && <StripeErrorNotice message={error} />}
      </div>

      {/* Full timeline, spelled out — "when do I actually see this in my bank"
          answered as three concrete stages instead of one vague sentence. */}
      <div className="card-surface p-5">
        <h3 className="font-bold text-white">How &amp; when you get paid</h3>
        <ol className="mt-2 flex flex-col gap-2 text-sm text-slate-400">
          <li><strong className="text-slate-200">1. Buyer pays</strong> — RiftCompare holds the money; nothing is yours yet.</li>
          <li><strong className="text-slate-200">2. You ship it</strong> — mark the order shipped with tracking. The money stays held while it&apos;s in transit.</li>
          <li>
            <strong className="text-slate-200">3. It releases to your Stripe balance</strong> — automatically once the buyer
            confirms receipt, or {MARKETPLACE_AUTO_RELEASE_DAYS} days after you shipped either way, whichever comes first.
            This is instant and shows up immediately in the &quot;Released to date&quot; figure below.
          </li>
          <li>
            <strong className="text-slate-200">4. Stripe pays your bank</strong> — per the schedule below. New accounts
            usually see a short extra delay on their very first payout while Stripe finishes verification; after that
            it&apos;s routine.
          </li>
        </ol>
      </div>

      {funds.series && (
        <div className="card-surface p-5">
          <h3 className="mb-3 font-bold text-white">Earnings over time</h3>
          <EarningsChart points={funds.series.points} currency={funds.series.currency} />
        </div>
      )}

      {funds.payoutsEnabled && (
        <>
          <PayoutScheduleCard />
          <PayoutHistoryCard />
        </>
      )}

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
            Each shipped order releases automatically {MARKETPLACE_AUTO_RELEASE_DAYS} days after you mark it shipped —
            sooner if the buyer confirms. See the exact date per order below.
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
          <p className="mt-2 text-xs text-slate-600">
            Already in your Stripe balance — paid to your bank per your payout schedule above.
          </p>
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
                <span className="text-right">
                  <span className="block font-semibold text-white">{formatMoney(o.totalCents - o.feeCents, o.currency)}</span>
                  <span className="block text-[10px] text-slate-600" title={`RiftCompare's ${MARKETPLACE_FEE_BPS / 100}% marketplace fee`}>
                    {formatMoney(o.totalCents, o.currency)} sale − {formatMoney(o.feeCents, o.currency)} fee
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link href="/marketplace/orders" className="text-sm text-brand-300 hover:underline">See full order history →</Link>
    </div>
  );
}
