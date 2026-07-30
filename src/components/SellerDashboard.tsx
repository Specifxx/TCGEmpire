"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CONDITION_KEYS } from "@/lib/constants";
import { CURRENCY_BY_COUNTRY } from "@/lib/marketplace-countries";
import { MARKETPLACE_FEE_BPS, MARKETPLACE_PREMIUM_FEE_BPS, platformFeeCents } from "@/lib/marketplace-policy";
import { formatMoney } from "@/lib/format";
import { cardDisplayName } from "@/lib/card-name";
import { StripeErrorNotice } from "./StripeErrorNotice";
import { MarketplaceReportBug } from "./MarketplaceReportBug";
import { EarningsChart, type EarningsPoint } from "./EarningsChart";

// Launch markets — see lib/marketplace.ts's MARKETPLACE_LAUNCH_COUNTRIES. The
// server rejects any other market anyway; keeping the picker in sync avoids a
// seller picking an unsupported market and then hitting a confusing 400 on save.
// NOTE: a LOCAL Country type, deliberately separate from lib/country.ts's (this is
// the marketplace's seller-market picker, which tracks MARKETPLACE_COUNTRIES, not
// the price-comparison market list). Being local means a new market added globally
// does NOT surface a type error here — keep it in sync by hand.
type Country = "AU" | "US" | "UK" | "NZ" | "SG" | "CA";
const COUNTRY_LABEL: Record<Country, string> = {
  AU: "Australia",
  US: "United States",
  UK: "United Kingdom",
  NZ: "New Zealand",
  SG: "Singapore",
  CA: "Canada",
};

interface Profile {
  shopName: string;
  bio: string | null;
  country: Country;
  currency: string;
  shippingFlatCents: number;
  freeOverCents: number;
  shippingNote: string | null;
  handlingDays: number;
  postcode: string | null;
  termsAcceptedAt: string | null;
}

interface SearchCard {
  id: string;
  name: string;
  slug?: string | null;
  setCode: string;
  collectorNumber: string;
  imageThumbUrl: string | null;
  variant: string | null;
  isPromo: boolean;
  rarity: string;
  lowestPriceCents: number | null;
  lowestPriceCentsNz?: number | null;
  lowestPriceCentsUs?: number | null;
  lowestPriceCentsUk?: number | null;
  lowestPriceCentsSg?: number | null;
  lowestPriceCentsCa?: number | null;
}

interface Listing {
  id: string;
  condition: string;
  isFoil: boolean;
  priceCents: number;
  quantity: number;
  currency: string;
  country: string;
  status: string;
  card: SearchCard;
}

const lowestFor = (c: SearchCard, country: Country): number | null =>
  country === "US" ? c.lowestPriceCentsUs ?? null
  : country === "UK" ? c.lowestPriceCentsUk ?? null
  : c.lowestPriceCents;

export function SellerDashboard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [payoutsEnabled, setPayoutsEnabled] = useState(false);
  const [isPremiumSeller, setIsPremiumSeller] = useState(false);
  const [series, setSeries] = useState<{ currency: string; points: EarningsPoint[] } | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [p, l, c, f] = await Promise.all([
      fetch("/api/marketplace/profile").then((r) => r.json()).catch(() => ({})),
      fetch("/api/marketplace/listings?mine=1").then((r) => r.json()).catch(() => ({ listings: [] })),
      fetch("/api/marketplace/stripe/connect").then((r) => r.json()).catch(() => ({})),
      fetch("/api/marketplace/funds").then((r) => r.json()).catch(() => ({})),
    ]);
    setProfile(p.profile ?? null);
    setIsPremiumSeller(!!p.isPremium);
    setListings(l.listings ?? []);
    setPayoutsEnabled(!!c.payoutsEnabled);
    setSeries(f.series ?? null);
    setLoaded(true);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const country = (profile?.country ?? "AU") as Country;

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/marketplace" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-300">
        ← Back to Marketplace
      </Link>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-extrabold text-white">Seller dashboard</h1>
            <MarketplaceReportBug subject="Seller dashboard bug: " />
          </div>
          <p className="text-sm text-slate-500">
            Manage your RiftCompare Marketplace shop &amp; listings. RiftCompare takes a{" "}
            {isPremiumSeller ? MARKETPLACE_PREMIUM_FEE_BPS / 100 : MARKETPLACE_FEE_BPS / 100}% fee on each sale
            {isPremiumSeller ? " — your Premium rate" : ` (${MARKETPLACE_PREMIUM_FEE_BPS / 100}% with Premium)`} — you
            always see exactly what you&apos;ll receive before you list and after you sell.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/marketplace/funds" className="btn-ghost text-sm">Seller funds →</Link>
        </div>
      </div>

      {!isPremiumSeller && loaded && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/30 bg-gold/5 px-4 py-3">
          <p className="text-sm text-slate-300">
            <span className="font-bold text-gold">Go Premium</span> and pay just{" "}
            <strong className="text-white">{MARKETPLACE_PREMIUM_FEE_BPS / 100}%</strong> per sale instead of{" "}
            {MARKETPLACE_FEE_BPS / 100}% — plus Value Finder, Rising Cards, Deal Finder and an ad-free site.
          </p>
          <Link href="/premium" className="btn-primary whitespace-nowrap text-sm">Upgrade →</Link>
        </div>
      )}

      {!loaded ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-700 border-t-brand-400" /> Loading…
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          <ShopForm profile={profile} onSaved={load} />
          {series && (
            <div className="card-surface p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-bold text-white">Earnings over time</h2>
                <Link href="/marketplace/funds" className="text-xs text-brand-300 hover:underline">Full breakdown &amp; payout settings →</Link>
              </div>
              <EarningsChart points={series.points} currency={series.currency} />
            </div>
          )}
          {!profile ? (
            <div className="card-surface p-4 text-sm text-gold">Set up your shop above before you can list cards.</div>
          ) : (
            <>
              {/* Payouts are never required to list or sell — buyers pay RiftCompare
                  directly, and funds simply stay held until a seller finishes Stripe
                  Connect onboarding (then release automatically). Shown as a nudge,
                  not a gate, so a seller without payouts set up yet doesn't block a
                  buyer who's ready to purchase right now. */}
              {!payoutsEnabled && <PayoutsOnboarding />}
              <AddListing country={country} currency={profile.currency} isPremiumSeller={isPremiumSeller} onAdded={load} />
            </>
          )}
          <MyListings listings={listings} isPremiumSeller={isPremiumSeller} onChange={load} />
        </div>
      )}
    </div>
  );
}

// A nudge, not a gate — you can list and sell before finishing this (buyers pay
// RiftCompare directly), but funds stay held until Stripe Connect is set up, since
// that's how we actually pay YOU. Stripe runs the identity/KYC check as part of
// this flow, so there's nothing custom to build.
function PayoutsOnboarding() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/marketplace/stripe/connect", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok && data.url) window.location.href = data.url;
    else setError(data.error ?? "Couldn't reach Stripe — try again shortly");
  }

  return (
    <div className="card-surface border-gold/30 p-5">
      <h2 className="mb-1 font-bold text-white">Set up payouts to get paid</h2>
      <p className="text-sm text-slate-500">
        You can list and sell right away — but funds from any sale stay held until you set this up, since it's how
        RiftCompare actually pays you. Stripe verifies your identity and handles payouts to your bank, so we never
        touch your funds or your ID. It takes a couple of minutes.
      </p>
      <button onClick={start} disabled={busy} className="btn-primary mt-3">{busy ? "Opening Stripe…" : "Set up payouts →"}</button>
      {error && <StripeErrorNotice message={error} />}
    </div>
  );
}

function ShopForm({ profile, onSaved }: { profile: Profile | null; onSaved: () => void }) {
  const [shopName, setShopName] = useState(profile?.shopName ?? "");
  const [country, setCountry] = useState<Country>((profile?.country ?? "AU") as Country);
  const [flat, setFlat] = useState(((profile?.shippingFlatCents ?? 0) / 100).toFixed(2));
  const [freeOver, setFreeOver] = useState(((profile?.freeOverCents ?? 0) / 100).toFixed(2));
  const [note, setNote] = useState(profile?.shippingNote ?? "");
  const [handling, setHandling] = useState(String(profile?.handlingDays ?? 2));
  const [postcode, setPostcode] = useState(profile?.postcode ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Shown until the seller has agreed once — after that it's stamped server-side
  // and the checkbox disappears for good.
  const needsAgreement = !profile?.termsAcceptedAt;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/marketplace/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shopName: shopName.trim(),
        bio: bio.trim() || null,
        country,
        shippingFlatCents: Math.round(parseFloat(flat || "0") * 100),
        freeOverCents: Math.round(parseFloat(freeOver || "0") * 100),
        shippingNote: note.trim() || null,
        handlingDays: parseInt(handling || "0", 10),
        postcode: postcode.trim() || null,
        ...(needsAgreement ? { agreeTerms: agreed } : {}),
      }),
    });
    const data = await res.json();
    setSaving(false);
    setMsg(res.ok ? "✓ Saved" : data.error ?? "Failed to save");
    if (res.ok) onSaved();
  }

  return (
    <form onSubmit={save} className="card-surface p-5">
      <h2 className="mb-3 font-bold text-white">Your shop &amp; shipping</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-slate-400">Shop name</span>
          <input value={shopName} onChange={(e) => setShopName(e.target.value)} required maxLength={60} className="input" placeholder="e.g. Specifix Singles" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-400">Market</span>
          <select value={country} onChange={(e) => setCountry(e.target.value as Country)} className="input">
            {(Object.keys(COUNTRY_LABEL) as Country[]).map((c) => (
              <option key={c} value={c}>{COUNTRY_LABEL[c]} ({CURRENCY_BY_COUNTRY[c]})</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-400">Flat postage ({CURRENCY_BY_COUNTRY[country]})</span>
          <input type="number" min={0} step="0.01" value={flat} onChange={(e) => setFlat(e.target.value)} className="input" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-400">Free shipping over (0 = never)</span>
          <input type="number" min={0} step="0.01" value={freeOver} onChange={(e) => setFreeOver(e.target.value)} className="input" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-400">Dispatch time (days)</span>
          <input type="number" min={0} max={30} value={handling} onChange={(e) => setHandling(e.target.value)} className="input" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-400">Shipping note (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} className="input" placeholder="e.g. tracked, ships Mon/Wed/Fri" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-400">Ships from postcode (optional)</span>
          <input value={postcode} onChange={(e) => setPostcode(e.target.value)} maxLength={20} className="input" placeholder="Improves buyers' shipping estimate" />
        </label>
      </div>
      <label className="mt-3 block text-sm">
        <span className="mb-1 block text-slate-400">Shop bio (optional)</span>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={400} rows={2} className="input" />
      </label>
      {needsAgreement && (
        <label className="mt-3 flex items-start gap-2 text-sm text-slate-300">
          <input type="checkbox" required checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5" />
          <span>
            I agree to the{" "}
            <Link href="/marketplace/terms" target="_blank" className="text-brand-400 underline hover:text-brand-300">
              marketplace seller terms
            </Link>{" "}
            — including the {MARKETPLACE_FEE_BPS / 100}% fee on each sale and the ship-within-deadline policy.
          </span>
        </label>
      )}
      <div className="mt-3 flex items-center gap-3">
        <button type="submit" disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save shop"}</button>
        {msg && <span className="text-sm text-slate-400">{msg}</span>}
      </div>
    </form>
  );
}

function AddListing({ country, currency, isPremiumSeller, onAdded }: { country: Country; currency: string; isPremiumSeller: boolean; onAdded: () => void }) {
  const [card, setCard] = useState<SearchCard | null>(null);
  const [condition, setCondition] = useState("NM");
  const [isFoil, setIsFoil] = useState(false);
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("1");
  const [region, setRegion] = useState<Country>(country);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const cur = CURRENCY_BY_COUNTRY[region];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!card) return;
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/marketplace/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cardId: card.id,
        condition,
        isFoil,
        priceCents: Math.round(parseFloat(price || "0") * 100),
        quantity: parseInt(qty || "1", 10),
        country: region,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) {
      setMsg("✓ Listed");
      setCard(null);
      setPrice("");
      setQty("1");
      setIsFoil(false);
      onAdded();
    } else {
      setMsg(data.error ?? "Failed to list");
    }
  }

  const cheapest = card ? lowestFor(card, region) : null;

  return (
    <form onSubmit={submit} className="card-surface p-5">
      <h2 className="mb-3 font-bold text-white">List a card</h2>
      {!card ? (
        <CardSearch
          onPick={(c) => {
            setCard(c);
            // Prefill from the current cheapest price in this region — still
            // fully editable, just a sensible starting point instead of blank.
            const cheapestNow = lowestFor(c, region);
            if (cheapestNow != null) setPrice((cheapestNow / 100).toFixed(2));
          }}
        />
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-900 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {card.imageThumbUrl ? <img src={card.imageThumbUrl} alt="" aria-hidden="true" className="h-14 w-10 rounded object-cover" /> : <div className="h-14 w-10 rounded bg-ink-800" />}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">{cardDisplayName(card.name, card)}</div>
            <div className="text-xs text-slate-500">
              {card.setCode} {card.collectorNumber}
              {cheapest != null && <> · current cheapest in {region} <span className="text-accent">{formatMoney(cheapest, cur)}</span></>}
            </div>
          </div>
          <button type="button" onClick={() => setCard(null)} className="text-xs text-slate-500 hover:text-rose-300">change</button>
        </div>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-5">
        <label className="text-sm">
          <span className="mb-1 block text-slate-400">Region</span>
          <select value={region} onChange={(e) => setRegion(e.target.value as Country)} className="input">
            {(Object.keys(COUNTRY_LABEL) as Country[]).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-400">Condition</span>
          <select value={condition} onChange={(e) => setCondition(e.target.value)} className="input">
            {CONDITION_KEYS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-400">Price ({cur})</span>
          <input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required className="input" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-400">Qty</span>
          <input type="number" min={1} max={999} value={qty} onChange={(e) => setQty(e.target.value)} className="input" />
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm text-slate-300">
          <input type="checkbox" checked={isFoil} onChange={(e) => setIsFoil(e.target.checked)} className="h-4 w-4 accent-brand-500" /> Foil
        </label>
      </div>
      {(() => {
        const priceCents = Math.round(parseFloat(price || "0") * 100);
        if (!priceCents) return null;
        const net = priceCents - platformFeeCents(priceCents, isPremiumSeller);
        const feePct = isPremiumSeller ? MARKETPLACE_PREMIUM_FEE_BPS / 100 : MARKETPLACE_FEE_BPS / 100;
        return (
          <p className="mt-2 text-xs text-slate-500">
            You&apos;ll receive ~<span className="font-semibold text-slate-300">{formatMoney(net, cur)}</span> after the {feePct}% fee
            {isPremiumSeller && <span className="text-gold"> (your Premium rate)</span>}.
          </p>
        );
      })()}
      <div className="mt-3 flex items-center gap-3">
        <button type="submit" disabled={saving || !card} className="btn-primary disabled:opacity-50">{saving ? "Listing…" : "List card"}</button>
        {msg && <span className="text-sm text-slate-400">{msg}</span>}
      </div>
    </form>
  );
}

function CardSearch({ onPick }: { onPick: (c: SearchCard) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchCard[]>([]);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      abort.current?.abort();
      const ctrl = new AbortController();
      abort.current = ctrl;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        const data = await res.json();
        setResults((data.results ?? []).slice(0, 8));
      } catch { /* aborted */ }
    }, 180);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="relative">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a card to list…" className="input" autoComplete="off" />
      {results.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-ink-700 bg-ink-850 shadow-2xl">
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => { onPick(r); setQ(""); setResults([]); }} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-ink-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {r.imageThumbUrl ? <img src={r.imageThumbUrl} alt="" aria-hidden="true" className="h-9 w-7 rounded object-cover" /> : <div className="h-9 w-7 rounded bg-ink-800" />}
                <span className="min-w-0 flex-1 truncate text-sm text-white">{cardDisplayName(r.name, r)} <span className="text-xs text-slate-500">{r.setCode} {r.collectorNumber}</span></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MyListings({ listings, isPremiumSeller, onChange }: { listings: Listing[]; isPremiumSeller: boolean; onChange: () => void }) {
  return (
    <div className="card-surface p-5">
      <h2 className="mb-3 font-bold text-white">Your listings ({listings.length})</h2>
      {listings.length === 0 ? (
        <p className="text-sm text-slate-500">No listings yet — list a card above.</p>
      ) : (
        <ul className="divide-y divide-ink-800">
          {[...listings]
            .sort((a, b) => a.card.name.localeCompare(b.card.name))
            .map((l) => <ListingRow key={l.id} l={l} isPremiumSeller={isPremiumSeller} onChange={onChange} />)}
        </ul>
      )}
    </div>
  );
}

function ListingRow({ l, isPremiumSeller, onChange }: { l: Listing; isPremiumSeller: boolean; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState((l.priceCents / 100).toFixed(2));
  const [qty, setQty] = useState(String(l.quantity));
  const [region, setRegion] = useState<Country>((l.country as Country) ?? "AU");
  const [busy, setBusy] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    await fetch(`/api/marketplace/listings/${l.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    setEditing(false);
    onChange();
  }
  async function remove() {
    if (typeof window !== "undefined" && !window.confirm("Remove this listing?")) return;
    await fetch(`/api/marketplace/listings/${l.id}`, { method: "DELETE" });
    onChange();
  }
  function save() {
    void patch({ priceCents: Math.round(parseFloat(price || "0") * 100), quantity: parseInt(qty || "0", 10), country: region });
  }

  return (
    <li className="flex flex-wrap items-center gap-3 py-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {l.card.imageThumbUrl ? <img src={l.card.imageThumbUrl} alt="" aria-hidden="true" className="h-12 w-9 rounded object-cover" /> : <div className="h-12 w-9 rounded bg-ink-800" />}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-white">{cardDisplayName(l.card.name, l.card)}</div>
        <div className="text-xs text-slate-500">
          {l.card.setCode} {l.card.collectorNumber} · {l.condition}{l.isFoil ? " · Foil" : ""} · {l.country} ·{" "}
          <span className={l.status === "ACTIVE" ? "text-brand-300" : "text-slate-500"}>{l.status.toLowerCase()}</span>
        </div>
      </div>

      {editing ? (
        <>
          <select value={region} onChange={(e) => setRegion(e.target.value as Country)} className="input w-16 py-1 text-xs" aria-label="Region">
            {(Object.keys(COUNTRY_LABEL) as Country[]).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <span className="text-xs text-slate-500">{CURRENCY_BY_COUNTRY[region]}</span>
          <input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="input w-20 py-1 text-sm" aria-label="Price" />
          <input type="number" min={0} max={999} value={qty} onChange={(e) => setQty(e.target.value)} className="input w-14 py-1 text-sm" aria-label="Quantity" />
          <button onClick={save} disabled={busy} className="rounded bg-brand-500/20 px-2 py-1 text-[11px] font-semibold text-brand-300 hover:bg-brand-500/30">{busy ? "…" : "Save"}</button>
          <button onClick={() => setEditing(false)} className="rounded bg-ink-800 px-2 py-1 text-[11px] text-slate-400 hover:bg-ink-700">Cancel</button>
        </>
      ) : (
        <>
          <span className="text-right">
            <span className="block text-sm font-bold text-accent">{formatMoney(l.priceCents, l.currency)}</span>
            <span
              className="block text-[10px] text-slate-600"
              title={`After RiftCompare's ${isPremiumSeller ? MARKETPLACE_PREMIUM_FEE_BPS / 100 : MARKETPLACE_FEE_BPS / 100}% marketplace fee`}
            >
              you receive {formatMoney(l.priceCents - platformFeeCents(l.priceCents, isPremiumSeller), l.currency)}
            </span>
          </span>
          <span className="text-xs text-slate-500">×{l.quantity}</span>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setEditing(true)} className="rounded bg-ink-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-ink-700">Edit</button>
            {l.status === "ACTIVE" ? (
              <button onClick={() => patch({ status: "PAUSED" })} className="rounded bg-ink-800 px-2 py-1 text-[11px] text-slate-300 hover:bg-ink-700">Pause</button>
            ) : l.status === "PAUSED" ? (
              <button onClick={() => patch({ status: "ACTIVE" })} className="rounded bg-ink-800 px-2 py-1 text-[11px] text-brand-300 hover:bg-ink-700">Resume</button>
            ) : null}
            <button onClick={remove} className="rounded bg-ink-800 px-2 py-1 text-[11px] text-rose-300 hover:bg-ink-700">Remove</button>
          </div>
        </>
      )}
    </li>
  );
}
