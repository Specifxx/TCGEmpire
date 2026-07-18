"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatMoney } from "@/lib/format";

export interface CheckoutItem {
  listingId: string;
  quantity: number;
  cardName: string;
  sub: string;
  priceCents: number;
  currency: string;
  sellerId: string;
  sellerName: string;
}

interface SavedAddress {
  shipName: string | null;
  shipLine1: string | null;
  shipLine2: string | null;
  shipCity: string | null;
  shipRegion: string | null;
  shipPostcode: string | null;
  shipPhone: string | null;
}

type Estimate = { cents: number; note: string };

// The address + live shipping-estimate step between "cart" and "pay" — inline
// (a modal, not a page navigation) so checkout stays a single seamless flow.
// Prefills from the buyer's saved address (GET /api/account/shipping-address).
//
// A cart can span multiple sellers — one Checkout Session, one card charge,
// one shared delivery address, but EACH seller has their own shipping rate
// (flat fee + postcode), so this groups items by seller and live-estimates
// shipping per seller as the postcode is entered (POST
// /api/marketplace/shipping-estimate, called once per seller group), then
// hands the whole multi-seller cart off to Stripe as one payment.
export function MarketplaceCheckout({ items, onClose }: { items: CheckoutItem[]; onClose: () => void }) {
  const [loadingAddress, setLoadingAddress] = useState(true);
  const [name, setName] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [postcode, setPostcode] = useState("");
  const [phone, setPhone] = useState("");
  const [saveAddress, setSaveAddress] = useState(true);

  const [estimates, setEstimates] = useState<Record<string, Estimate | null>>({});
  const [estimating, setEstimating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sellerGroups = useMemo(() => {
    const map = new Map<string, { sellerId: string; sellerName: string; items: CheckoutItem[]; itemCents: number }>();
    for (const item of items) {
      const g = map.get(item.sellerId) ?? { sellerId: item.sellerId, sellerName: item.sellerName, items: [], itemCents: 0 };
      g.items.push(item);
      g.itemCents += item.priceCents * item.quantity;
      map.set(item.sellerId, g);
    }
    return [...map.values()];
  }, [items]);

  const itemCents = items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0);
  const currency = items[0]?.currency ?? "AUD";
  const shippingTotal = sellerGroups.reduce((sum, g) => sum + (estimates[g.sellerId]?.cents ?? 0), 0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/shipping-address")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const a: SavedAddress | null = data.address;
        if (a) {
          setName(a.shipName ?? "");
          setLine1(a.shipLine1 ?? "");
          setLine2(a.shipLine2 ?? "");
          setCity(a.shipCity ?? "");
          setRegion(a.shipRegion ?? "");
          setPostcode(a.shipPostcode ?? "");
          setPhone(a.shipPhone ?? "");
        }
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoadingAddress(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (!postcode.trim() || sellerGroups.length === 0) {
      setEstimates({});
      return;
    }
    debounce.current = setTimeout(async () => {
      setEstimating(true);
      try {
        const results = await Promise.all(
          sellerGroups.map(async (g) => {
            try {
              const res = await fetch("/api/marketplace/shipping-estimate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ sellerId: g.sellerId, postcode: postcode.trim(), itemCents: g.itemCents }),
              });
              const data = await res.json();
              return [g.sellerId, res.ok ? { cents: data.cents, note: data.note } : null] as const;
            } catch {
              return [g.sellerId, null] as const;
            }
          })
        );
        setEstimates(Object.fromEntries(results));
      } finally {
        setEstimating(false);
      }
    }, 450);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postcode, sellerGroups.map((g) => `${g.sellerId}:${g.itemCents}`).join(",")]);

  const addressValid = name.trim().length >= 2 && line1.trim().length >= 3 && city.trim().length >= 1 && region.trim().length >= 1 && postcode.trim().length >= 1;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!addressValid) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/marketplace/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({ listingId: i.listingId, quantity: i.quantity })),
          shippingAddress: {
            name: name.trim(),
            line1: line1.trim(),
            line2: line2.trim() || undefined,
            city: city.trim(),
            region: region.trim(),
            postcode: postcode.trim(),
            phone: phone.trim() || undefined,
          },
          saveAddress,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error ?? "Checkout failed — please try again");
        setBusy(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Network error — try again");
      setBusy(false);
    }
  }

  const total = itemCents + shippingTotal;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 grid max-h-[90vh] w-full max-w-lg grid-rows-[auto_1fr_auto] overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-800 p-4">
          <h2 className="text-lg font-extrabold text-white">Shipping details</h2>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-ink-800 hover:text-white">✕</button>
        </div>

        <form id="checkout-form" onSubmit={submit} className="overflow-y-auto p-4">
          <div className="mb-4 flex flex-col gap-3">
            {sellerGroups.map((g) => {
              const est = estimates[g.sellerId];
              return (
                <div key={g.sellerId} className="rounded-lg border border-ink-700 bg-ink-950/50 p-3 text-xs text-slate-400">
                  <div className="mb-1 font-semibold text-slate-300">{g.sellerName}</div>
                  {g.items.map((i) => (
                    <div key={i.listingId} className="flex justify-between gap-2 py-0.5">
                      <span className="truncate">×{i.quantity} {i.cardName} <span className="text-slate-600">({i.sub})</span></span>
                      <span className="shrink-0 text-slate-300">{formatMoney(i.priceCents * i.quantity, i.currency)}</span>
                    </div>
                  ))}
                  <div className="mt-1 flex justify-between border-t border-ink-800 pt-1">
                    <span className="text-slate-500">Shipping</span>
                    {estimating ? (
                      <span className="text-slate-500">estimating…</span>
                    ) : est ? (
                      <span className="text-right text-slate-300">
                        {est.cents === 0 ? "Free" : formatMoney(est.cents, g.items[0]?.currency ?? currency)}
                        <span className="ml-1.5 text-[10px] text-slate-600">{est.note}</span>
                      </span>
                    ) : (
                      <span className="text-slate-600">enter postcode</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {loadingAddress ? (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-700 border-t-brand-400" /> Loading your saved address…
            </p>
          ) : (
            <div className="grid gap-3">
              <label className="text-sm">
                <span className="mb-1 block text-slate-400">Full name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} className="input" autoComplete="name" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-slate-400">Street address</span>
                <input value={line1} onChange={(e) => setLine1(e.target.value)} required maxLength={200} className="input" autoComplete="address-line1" placeholder="Unit / street number / street name" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-slate-400">Apartment, suite, etc. (optional)</span>
                <input value={line2} onChange={(e) => setLine2(e.target.value)} maxLength={200} className="input" autoComplete="address-line2" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  <span className="mb-1 block text-slate-400">Suburb/City</span>
                  <input value={city} onChange={(e) => setCity(e.target.value)} required maxLength={100} className="input" autoComplete="address-level2" />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-slate-400">State/Region</span>
                  <input value={region} onChange={(e) => setRegion(e.target.value)} required maxLength={100} className="input" autoComplete="address-level1" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  <span className="mb-1 block text-slate-400">Postcode</span>
                  <input value={postcode} onChange={(e) => setPostcode(e.target.value)} required maxLength={20} className="input" autoComplete="postal-code" />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-slate-400">Phone (optional)</span>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} className="input" autoComplete="tel" />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} className="h-4 w-4 accent-brand-500" />
                Save this address to my account for next time
              </label>

              {sellerGroups.length > 1 && (
                <p className="text-[11px] text-slate-600">
                  Your items ship from {sellerGroups.length} different sellers, each with their own shipping cost shown above — everything is still paid in one card charge.
                </p>
              )}

              {error && <p className="text-sm text-rose-300">{error}</p>}
            </div>
          )}
        </form>

        <div className="border-t border-ink-800 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-slate-400">Total</span>
            <span className="num text-xl font-extrabold text-accent">{formatMoney(total, currency)}</span>
          </div>
          <button type="submit" form="checkout-form" disabled={busy || !addressValid || loadingAddress} className="btn-primary w-full disabled:opacity-50">
            {busy ? "Redirecting to payment…" : "Continue to secure payment →"}
          </button>
          <p className="mt-2 text-center text-[11px] text-slate-600">Paid via Stripe · funds held until you confirm delivery</p>
        </div>
      </div>
    </div>
  );
}
