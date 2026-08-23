"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CONDITION_KEYS } from "@/lib/constants";
import { CURRENCY_BY_COUNTRY } from "@/lib/marketplace-countries";
import { MARKETPLACE_FEE_BPS, MARKETPLACE_PREMIUM_FEE_BPS, platformFeeCents } from "@/lib/marketplace-policy";
import { formatMoney } from "@/lib/format";
import { ListingShare } from "./ListingShare";
import { cardDisplayName } from "@/lib/card-name";
import { StripeErrorNotice } from "./StripeErrorNotice";
import { MarketplaceReportBug } from "./MarketplaceReportBug";
import { EarningsChart, type EarningsPoint } from "./EarningsChart";
import { cardImageAlt } from "@/lib/image-alt";
import { CardSearch, type SearchCard } from "./CardSearch";

// Launch markets — see lib/marketplace.ts's MARKETPLACE_LAUNCH_COUNTRIES. The
// server rejects any other market anyway; keeping the picker in sync avoids a
// seller picking an unsupported market and then hitting a confusing 400 on save.
// NOTE: a LOCAL Country type, deliberately separate from lib/country.ts's (this is
// the marketplace's seller-market picker, which tracks MARKETPLACE_COUNTRIES, not
// the price-comparison market list). Being local means a new market added globally
// does NOT surface a type error here — keep it in sync by hand.
type Country = "AU" | "US" | "UK" | "SG" | "CA";
const COUNTRY_LABEL: Record<Country, string> = {
  AU: "Australia",
  US: "United States",
  UK: "United Kingdom",
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

// Just enough of /api/marketplace/orders's shape to render a compact preview —
// full ship/track/cancel actions live on the real /marketplace/orders page.
interface SaleOrder {
  id: string;
  role: "buyer" | "seller";
  status: string;
  quantity: number;
  totalCents: number;
  createdAt: string;
  counterparty: string;
  listing: { currency: string; card: { name: string; imageThumbUrl: string | null } } | null;
}

const SALE_STATUS: Record<string, { label: string; className: string }> = {
  PENDING: { label: "pending", className: "text-slate-500" },
  PAID: { label: "ready to ship", className: "text-gold" },
  SHIPPED: { label: "shipped", className: "text-accent" },
  COMPLETED: { label: "completed", className: "text-brand-300" },
  CANCELLED: { label: "cancelled", className: "text-slate-500" },
  REFUNDED: { label: "refunded", className: "text-slate-500" },
};

const lowestFor = (c: SearchCard, country: Country): number | null =>
  country === "US" ? c.lowestPriceCentsUs ?? null
  : country === "UK" ? c.lowestPriceCentsUk ?? null
  : c.lowestPriceCents;

export function SellerDashboard() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [payoutsEnabled, setPayoutsEnabled] = useState(false);
  const [hasStripeAccount, setHasStripeAccount] = useState(false);
  const [isPremiumSeller, setIsPremiumSeller] = useState(false);
  const [series, setSeries] = useState<{ currency: string; points: EarningsPoint[] } | null>(null);
  const [sales, setSales] = useState<SaleOrder[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [p, l, c, f, o] = await Promise.all([
      fetch("/api/marketplace/profile").then((r) => r.json()).catch(() => ({})),
      fetch("/api/marketplace/listings?mine=1").then((r) => r.json()).catch(() => ({ listings: [] })),
      fetch("/api/marketplace/stripe/connect").then((r) => r.json()).catch(() => ({})),
      fetch("/api/marketplace/funds").then((r) => r.json()).catch(() => ({})),
      fetch("/api/marketplace/orders").then((r) => r.json()).catch(() => ({ orders: [] })),
    ]);
    setProfile(p.profile ?? null);
    setIsPremiumSeller(!!p.isPremium);
    setListings(l.listings ?? []);
    setPayoutsEnabled(!!c.payoutsEnabled);
    setHasStripeAccount(!!c.hasAccount);
    setSeries(f.series ?? null);
    setSales(((o.orders ?? []) as SaleOrder[]).filter((row) => row.role === "seller"));
    setLoaded(true);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Stripe's Account Link sends the seller back here with ?connect=return (they
  // finished, or at least reached the end of, the hosted onboarding flow) or
  // ?connect=refresh (the link expired before they finished). Both cases used to
  // land back on this page with zero acknowledgement — the setup card either
  // silently vanished (success) or silently reappeared unchanged (expired),
  // giving no feedback either way. Surface a banner once, then strip the param.
  const router = useRouter();
  const searchParams = useSearchParams();
  const [connectNotice, setConnectNotice] = useState<"return" | "refresh" | null>(null);
  useEffect(() => {
    const connect = searchParams.get("connect");
    if (connect === "return" || connect === "refresh") {
      setConnectNotice(connect);
      router.replace("/marketplace/sell");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      {connectNotice && loaded && (
        <div
          className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
            connectNotice === "return" && payoutsEnabled
              ? "border-brand-500/30 bg-brand-500/5 text-brand-200"
              : "border-gold/30 bg-gold/5 text-slate-300"
          }`}
        >
          {connectNotice === "return" && payoutsEnabled && "✓ Payouts are set up — funds from your sales will now pay out automatically."}
          {connectNotice === "return" && !payoutsEnabled &&
            "Stripe is still verifying your details — this is usually quick. If \"Set up payouts\" is still showing in a few minutes, reopen it to finish anything Stripe flagged."}
          {connectNotice === "refresh" && "That Stripe setup link expired before you finished — click \"Set up payouts\" below to pick up where you left off."}
        </div>
      )}

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
                  Connect onboarding (then release automatically). Always shown, in
                  either its "not set up yet" or confirmed state, so payouts status
                  is never just silently absent from the page. */}
              <PayoutsCard payoutsEnabled={payoutsEnabled} hasStripeAccount={hasStripeAccount} />
              <AddListing country={country} currency={profile.currency} isPremiumSeller={isPremiumSeller} onAdded={load} />
            </>
          )}
          <RecentSales sales={sales} />
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
//
// Always renders SOMETHING — never just disappears once payoutsEnabled flips true.
// The POST endpoint itself already branches on payoutsEnabled (returns a fresh
// onboarding link vs. a one-time login link into the seller's own Stripe
// dashboard), so the same start() call works for both states here.
function PayoutsCard({ payoutsEnabled, hasStripeAccount }: { payoutsEnabled: boolean; hasStripeAccount: boolean }) {
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

  if (payoutsEnabled) {
    return (
      <div className="card-surface border-brand-500/30 p-5">
        <h2 className="mb-1 flex items-center gap-2 font-bold text-white">
          <span className="text-brand-400">✓</span> Payouts are set up
        </h2>
        <p className="text-sm text-slate-500">
          Stripe verified your details — funds from your sales release to your bank automatically, on the schedule you set.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button onClick={start} disabled={busy} className="btn-ghost text-sm">{busy ? "Opening Stripe…" : "Manage payouts in Stripe →"}</button>
          <Link href="/marketplace/funds" className="text-sm text-brand-300 hover:underline">Payout schedule &amp; balance →</Link>
        </div>
        {error && <StripeErrorNotice message={error} />}
      </div>
    );
  }

  return (
    <div className="card-surface border-gold/30 p-5">
      <h2 className="mb-1 font-bold text-white">{hasStripeAccount ? "Finish setting up payouts" : "Set up payouts to get paid"}</h2>
      <p className="text-sm text-slate-500">
        {hasStripeAccount
          ? "You started this before but Stripe still needs a bit more to verify your details — pick up where you left off."
          : "You can list and sell right away — but funds from any sale stay held until you set this up, since it's how RiftCompare actually pays you. Stripe verifies your identity and handles payouts to your bank, so we never touch your funds or your ID. It takes a couple of minutes."}
      </p>
      <p className="mt-2 text-xs text-slate-600">
        On the next screen, Stripe asks for your real legal name and government ID — separate from your shop name above,
        and never shown to buyers. Type it exactly as it appears on your ID, or verification will fail.
      </p>
      <button onClick={start} disabled={busy} className="btn-primary mt-3">
        {busy ? "Opening Stripe…" : hasStripeAccount ? "Continue payouts setup →" : "Set up payouts →"}
      </button>
      {error && <StripeErrorNotice message={error} />}
    </div>
  );
}

// Compact preview of recent sales — full ship/track/message/cancel actions live on
// the real /marketplace/orders page (its "Sales" tab); this just makes sure a
// seller lands on evidence of their sales without leaving the dashboard, and
// without duplicating that page's stateful order-action UI here.
function RecentSales({ sales }: { sales: SaleOrder[] }) {
  const recent = sales.slice(0, 6);
  return (
    <div className="card-surface p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-white">Recent sales {sales.length > 0 && `(${sales.length})`}</h2>
        <Link href="/marketplace/orders?tab=Sales" className="text-xs text-brand-300 hover:underline">View all sales →</Link>
      </div>
      {recent.length === 0 ? (
        <p className="text-sm text-slate-500">No sales yet — once a buyer checks out, it shows up here.</p>
      ) : (
        <ul className="divide-y divide-ink-800">
          {recent.map((o) => {
            const st = SALE_STATUS[o.status] ?? { label: o.status.toLowerCase(), className: "text-slate-500" };
            return (
              <li key={o.id} className="flex items-center gap-3 py-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {o.listing?.card.imageThumbUrl ? <img src={o.listing.card.imageThumbUrl} alt="" width={28} height={38} className="h-[38px] w-7 shrink-0 rounded-sm object-cover" loading="lazy" /> : <div className="h-[38px] w-7 shrink-0 rounded-sm bg-ink-800" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-white">
                    {o.quantity > 1 ? `${o.quantity} × ` : ""}{o.listing?.card.name ?? "Order"}
                  </div>
                  <div className="text-xs text-slate-500">to {o.counterparty}</div>
                </div>
                <span className="text-right text-sm font-semibold text-accent">{formatMoney(o.totalCents, o.listing?.currency ?? "AUD")}</span>
                <span className={`w-24 shrink-0 text-right text-xs font-medium ${st.className}`}>{st.label}</span>
              </li>
            );
          })}
        </ul>
      )}
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
          placeholder="Search a card to list…"
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
          {card.imageThumbUrl ? <img src={card.imageThumbUrl} alt={cardImageAlt(card)} width={40} height={56} className="h-14 w-10 rounded object-cover" /> : <div className="h-14 w-10 rounded bg-ink-800" />}
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
      {l.card.imageThumbUrl ? <img src={l.card.imageThumbUrl} alt={cardImageAlt(l.card)} width={36} height={48} className="h-12 w-9 rounded object-cover" /> : <div className="h-12 w-9 rounded bg-ink-800" />}
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
            <ListingShare listingId={l.id} />
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
