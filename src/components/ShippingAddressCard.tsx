"use client";

import { useEffect, useState } from "react";
import { MARKETPLACE_LAUNCH_COUNTRIES } from "@/lib/marketplace-countries";

// Lets a user view/edit their saved default shipping address outside of
// checkout — the same record GET/POST /api/account/shipping-address serves to
// MarketplaceCheckout's prefill.
export function ShippingAddressCard() {
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [postcode, setPostcode] = useState("");
  const [country, setCountry] = useState<(typeof MARKETPLACE_LAUNCH_COUNTRIES)[number]>("AU");
  const [phone, setPhone] = useState("");
  const [hasAddress, setHasAddress] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/account/shipping-address")
      .then((r) => r.json())
      .then((data) => {
        const a = data.address;
        if (a) {
          setHasAddress(true);
          setName(a.shipName ?? "");
          setLine1(a.shipLine1 ?? "");
          setLine2(a.shipLine2 ?? "");
          setCity(a.shipCity ?? "");
          setRegion(a.shipRegion ?? "");
          setPostcode(a.shipPostcode ?? "");
          setPhone(a.shipPhone ?? "");
          if (a.shipCountry) setCountry(a.shipCountry);
        } else {
          setEditing(true); // no saved address yet — go straight to the form
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/account/shipping-address", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, line1, line2: line2 || undefined, city, region, postcode, country, phone: phone || undefined }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) {
      setMsg("✓ Saved");
      setHasAddress(true);
      setEditing(false);
    } else {
      setMsg(data.error ?? "Failed to save");
    }
  }

  return (
    <div className="card-surface mt-5 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-white">Shipping address</h2>
        {hasAddress && !editing && (
          <button onClick={() => setEditing(true)} className="text-xs text-brand-400 hover:underline">Edit</button>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">Used to prefill Marketplace checkout — nothing is shared until you actually buy something.</p>

      {loading ? (
        <p className="mt-3 text-sm text-slate-500">Loading…</p>
      ) : !editing ? (
        <address className="not-italic mt-3 text-sm leading-relaxed text-slate-300">
          {name}<br />
          {line1}{line2 ? <>, {line2}</> : null}<br />
          {city}, {region} {postcode}<br />
          {country}
        </address>
      ) : (
        <form onSubmit={save} className="mt-3 grid gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-slate-400">Full name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} className="input" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-400">Market</span>
            <select value={country} onChange={(e) => setCountry(e.target.value as typeof country)} className="input">
              {MARKETPLACE_LAUNCH_COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-400">Street address</span>
            <input value={line1} onChange={(e) => setLine1(e.target.value)} required maxLength={200} className="input" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-slate-400">Apartment, suite, etc. (optional)</span>
            <input value={line2} onChange={(e) => setLine2(e.target.value)} maxLength={200} className="input" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-slate-400">Suburb/City</span>
              <input value={city} onChange={(e) => setCity(e.target.value)} required maxLength={100} className="input" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-400">State/Region</span>
              <input value={region} onChange={(e) => setRegion(e.target.value)} required maxLength={100} className="input" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-slate-400">Postcode</span>
              <input value={postcode} onChange={(e) => setPostcode(e.target.value)} required maxLength={20} className="input" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-slate-400">Phone (optional)</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} className="input" />
            </label>
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save address"}</button>
            {hasAddress && <button type="button" onClick={() => setEditing(false)} className="btn-ghost">Cancel</button>}
            {msg && <span className="text-sm text-slate-400">{msg}</span>}
          </div>
        </form>
      )}
    </div>
  );
}
