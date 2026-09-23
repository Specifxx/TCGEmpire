"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { CONSULT_MARKETS } from "@/lib/consulting";
import { Spinner } from "./ui/Skeleton";

// The booking form on /stores/consulting. Collects what we need to prepare the
// session, then hands off to Stripe's hosted Checkout — the store never types a
// card number on this site.
//
// NO ACCOUNT REQUIRED, deliberately. The buyer here is a shop owner who has
// probably never used RiftCompare while signed in; making them register before
// they can pay would be a wall in front of the highest-value action on the
// site. The booking is keyed by email, not by a User row.
const MARKET_LABELS: Record<string, string> = {
  AU: "Australia",
  US: "United States",
  UK: "United Kingdom",
  SG: "Singapore",
  CA: "Canada",
  EU: "Europe (EU)",
  OTHER: "Somewhere else",
};

export function ConsultBookingForm({ priceLabel }: { priceLabel: string }) {
  const [storeName, setStoreName] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("AU");
  const [goals, setGoals] = useState("");
  const [preferredTimes, setPreferredTimes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    trackEvent("consult_checkout_started", { market: country });
    try {
      const res = await fetch("/api/stores/consulting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeName, storeUrl, contactName, email, country, goals, preferredTimes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) {
        setError(data?.error ?? "Something went wrong — please try again.");
        setBusy(false);
        return;
      }
      // Stripe's hosted page. Deliberately NOT setBusy(false) first: the button
      // stays disabled through the redirect so an impatient double-click can't
      // open a second Checkout session.
      window.location.href = data.url;
    } catch {
      setError("Network error — please try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Store name" required>
          <input
            required
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            placeholder="Dragon's Den Games"
            className="input"
            autoComplete="organization"
          />
        </Field>
        <Field label="Store website" hint="So we can pull your live listings before the call.">
          <input
            value={storeUrl}
            onChange={(e) => setStoreUrl(e.target.value)}
            placeholder="dragonsdengames.com.au"
            inputMode="url"
            className="input"
            autoComplete="url"
          />
        </Field>
        <Field label="Your name" required>
          <input
            required
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="Alex"
            className="input"
            autoComplete="name"
          />
        </Field>
        <Field label="Email" required hint="Where the invoice and the call link go.">
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="alex@dragonsdengames.com.au"
            inputMode="email"
            className="input"
            autoComplete="email"
          />
        </Field>
      </div>

      <Field label="Your market">
        <select value={country} onChange={(e) => setCountry(e.target.value)} className="input">
          {CONSULT_MARKETS.map((m) => (
            <option key={m} value={m}>
              {MARKET_LABELS[m] ?? m}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="What do you want out of the hour?"
        hint="Optional, but the more specific the better — we prepare against this."
      >
        <textarea
          value={goals}
          onChange={(e) => setGoals(e.target.value)}
          rows={3}
          placeholder="We're sitting on a lot of OGN singles that aren't moving, and I don't know if we're priced wrong or just carrying the wrong cards."
          className="input resize-y"
        />
      </Field>

      <Field label="When suits you?" hint="Optional — rough windows are fine, we'll confirm by email.">
        <input
          value={preferredTimes}
          onChange={(e) => setPreferredTimes(e.target.value)}
          placeholder="Weekday mornings AEST, or after 6pm"
          className="input"
        />
      </Field>

      {error && (
        <p role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      )}

      <button type="submit" disabled={busy} aria-busy={busy} className="btn-primary w-full justify-center">
        {busy ? (
          <>
            <Spinner size="sm" /> Taking you to checkout…
          </>
        ) : (
          <>Book a session — {priceLabel} →</>
        )}
      </button>

      <p className="text-center text-xs text-slate-500">
        Secure payment via Stripe. You&apos;ll get a proper tax invoice for your books, and we&apos;ll email
        you to lock in a time.
      </p>
    </form>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-slate-200">
        {label}
        {required && <span className="text-brand-400">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}
