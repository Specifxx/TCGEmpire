"use client";

import { useEffect, useState, type FormEvent } from "react";

type Info = { ok: boolean; prize?: string; imageUrl?: string; title?: string };
const FIELDS: { name: string; label: string; required?: boolean; auto: string; max: number }[] = [
  { name: "fullName", label: "Full name", required: true, auto: "name", max: 120 },
  { name: "line1", label: "Street address", required: true, auto: "address-line1", max: 200 },
  { name: "line2", label: "Apartment, unit (optional)", auto: "address-line2", max: 200 },
  { name: "city", label: "City or suburb", required: true, auto: "address-level2", max: 120 },
  { name: "region", label: "State, province or region (optional)", auto: "address-level1", max: 120 },
  { name: "postcode", label: "Postcode", required: true, auto: "postal-code", max: 32 },
  { name: "country", label: "Country", required: true, auto: "country-name", max: 80 },
  { name: "phone", label: "Phone, for the courier (optional)", auto: "tel", max: 40 },
];

export function GiveawayClaimForm() {
  const [token, setToken] = useState<string | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.hash.slice(1)).get("t");
    setToken(t);
    if (!t) return setInfo({ ok: false });
    fetch(`/api/giveaway/claim?t=${encodeURIComponent(t)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => setInfo({ ok: false }));
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      const r = await fetch("/api/giveaway/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...data }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (r.ok) setDone(true);
      else setError(j.error ?? "Couldn't save that. Please try again.");
    } catch {
      setError("Couldn't save that. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!info) return <div className="min-h-[200px]" aria-busy="true" />;
  if (!info.ok)
    return (
      <div className="rounded-2xl border border-white/10 p-5">
        <h1 className="text-2xl font-bold">This claim link isn&apos;t valid</h1>
        <p className="mt-2 opacity-80">It may have expired, or been copied without its end. Open the link from your winner email again, or reply to that email and we&apos;ll sort it out.</p>
      </div>
    );
  if (done)
    return (
      <div className="gw-trophy rounded-2xl border border-gold/40 p-6 text-center">
        <div className="text-5xl" aria-hidden="true">
          🎉
        </div>
        <h1 className="mt-2 text-2xl font-bold">Got it, thank you!</h1>
        <p className="mt-2 opacity-90">We&apos;ll post {info.prize} to you soon and email you when it&apos;s on its way.</p>
      </div>
    );
  return (
    <div className="gw-trophy rounded-2xl border border-gold/40 p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">You won</p>
      <div className="mt-2 flex items-center gap-4">
        {info.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={info.imageUrl} alt="" aria-hidden="true" width={72} height={100} className="rounded-md" />
        )}
        <h1 className="text-2xl font-bold">{info.prize}</h1>
      </div>
      <p className="mt-3 text-sm opacity-85">Where should we post it? We use this address only to send your prize, and postage is on us.</p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        {FIELDS.map((f) => (
          <label key={f.name} className="block text-sm">
            <span className="opacity-85">{f.label}</span>
            <input
              name={f.name}
              required={f.required}
              autoComplete={f.auto}
              maxLength={f.max}
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2"
            />
          </label>
        ))}
        <label className="block text-sm">
          <span className="opacity-85">Anything we should know (optional)</span>
          <textarea name="note" maxLength={500} rows={2} className="mt-1 w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2" />
        </label>
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? "Sending…" : "Send my address"}
        </button>
        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
