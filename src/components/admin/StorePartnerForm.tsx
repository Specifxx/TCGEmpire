"use client";

import { useState } from "react";

// Mints a B2B repricing-report capability URL for a tracked store.
//
// WHY THIS EXISTS. /stores/report has been built and working for months, and
// /api/admin/store-partners could mint the tokens it needs — but there was no
// page anywhere that called it. The only way to create a partner was to hand-
// craft an authenticated POST, which makes the whole store-outreach channel
// (docs/OUTREACH-KIT.md, where the free report is the entire reason a store has
// to reply) unusable by the person actually sending the emails.
//
// The report URL IS the credential — anyone holding it sees that store's report
// — so it is shown once here to be copied, and thereafter read from the list on
// the page rather than regenerated. Minting a second partner for the same store
// does not invalidate the first; it just makes two live links to maintain.
export function StorePartnerForm({
  adminKey,
  retailers,
}: {
  adminKey?: string;
  // Every tracked retailer key with its live listing count, so the operator
  // picks from what the price data actually contains rather than guessing a
  // key — the API rejects a key with no rows, and this stops that round trip.
  retailers: { key: string; name: string; listings: number }[];
}) {
  const [retailer, setRetailer] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const picked = retailers.find((r) => r.key === retailer);

  async function create() {
    if (!retailer || !name.trim()) return;
    setBusy(true);
    setError(null);
    setUrl(null);
    setCopied(false);
    try {
      const res = await fetch("/api/admin/store-partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retailer, name: name.trim(), ...(adminKey ? { key: adminKey } : {}) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) setError(data?.error ?? `failed (${res.status})`);
      else setUrl(data.reportUrl as string);
    } catch {
      setError("network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-surface p-4">
      <h2 className="text-sm font-extrabold text-white">Create a report link</h2>
      <p className="mt-1 text-xs text-slate-500">
        Generates that store&apos;s private &ldquo;where you&apos;re beaten on price&rdquo; report and gives you a link
        to paste into an email. The link is the password &mdash; anyone who has it can open the report, so send it to
        the store and nowhere else. It does not expire.
      </p>

      <label className="mt-3 block text-xs font-semibold text-slate-400" htmlFor="sp-retailer">
        Store
      </label>
      <select
        id="sp-retailer"
        className="input mt-1 w-full text-xs"
        value={retailer}
        disabled={busy}
        onChange={(e) => {
          const key = e.target.value;
          setRetailer(key);
          // Prefill the display name from the retailer list; it is what the
          // store sees at the top of their own report, so it should read as
          // their shop's name and stays editable.
          const match = retailers.find((r) => r.key === key);
          if (match) setName(match.name);
        }}
      >
        <option value="">Pick a tracked store…</option>
        {retailers.map((r) => (
          <option key={r.key} value={r.key}>
            {r.name} — {r.listings.toLocaleString()} listings
          </option>
        ))}
      </select>
      {picked && picked.listings === 0 && (
        <p className="mt-1 text-xs text-rose-300">
          No live listings for this store right now, so their report would be empty. Pick another, or wait for the next
          crawl.
        </p>
      )}

      <label className="mt-3 block text-xs font-semibold text-slate-400" htmlFor="sp-name">
        Name on the report
      </label>
      <input
        id="sp-name"
        className="input mt-1 w-full text-xs"
        value={name}
        disabled={busy}
        maxLength={80}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Cherry Collectables"
      />

      <button
        type="button"
        className="btn-primary mt-3 text-xs"
        disabled={busy || !retailer || !name.trim()}
        onClick={create}
      >
        {busy ? "Creating…" : "Create report link"}
      </button>

      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}

      {url && (
        <div className="mt-3 rounded-lg border border-brand-500/40 bg-brand-500/10 p-3">
          <p className="text-xs font-semibold text-brand-300">Link created. Copy it into your email:</p>
          <code className="mt-1 block break-all font-mono text-[11px] text-slate-300">{url}</code>
          <button
            type="button"
            className="btn-ghost mt-2 text-xs"
            onClick={() => {
              navigator.clipboard?.writeText(url).then(
                () => setCopied(true),
                () => setCopied(false),
              );
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
      )}
    </div>
  );
}
