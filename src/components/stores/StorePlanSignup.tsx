"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// The Stores plan's subscribe form on /stores (lib/store-plan.ts). /stores is an
// ISR page, so the signed-in check happens here after mount (/api/me), never in
// the server render: reading the session there would make the page per-request.
export function StorePlanSignup({ amount }: { amount: string }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [storeName, setStoreName] = useState("");
  const [storeUrl, setStoreUrl] = useState("https://");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => live && setSignedIn(!!d?.user))
      .catch(() => live && setSignedIn(false));
    return () => {
      live = false;
    };
  }, []);

  async function subscribe(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/stores/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeName, storeUrl }),
      });
      const d = await res.json().catch(() => null);
      if (res.status === 401) {
        setSignedIn(false);
        return;
      }
      if (!res.ok || !d?.url) {
        setError(d?.error ?? "Couldn't start checkout. Try again.");
        return;
      }
      window.location.href = d.url as string;
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (signedIn === false) {
    return (
      <div className="text-center">
        <p className="text-sm text-slate-300">Sign in (or create a free account) to subscribe. The plan, and the Pro that comes with it, belong to that account.</p>
        <Link href="/login?next=/stores&src=stores_plan" className="btn-primary mt-3 inline-block">
          Sign in to subscribe →
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={subscribe} className="mx-auto flex max-w-md flex-col gap-3 text-left">
      <label className="text-xs font-semibold text-slate-400" htmlFor="sp-store-name">
        Store name
      </label>
      <input
        id="sp-store-name"
        className="input w-full"
        value={storeName}
        onChange={(e) => setStoreName(e.target.value)}
        minLength={2}
        maxLength={80}
        required
        placeholder="e.g. Cherry Collectables"
        disabled={busy}
      />
      <label className="text-xs font-semibold text-slate-400" htmlFor="sp-store-url">
        Store website
      </label>
      <input
        id="sp-store-url"
        className="input w-full"
        type="url"
        value={storeUrl}
        onChange={(e) => setStoreUrl(e.target.value)}
        maxLength={200}
        required
        placeholder="https://yourstore.com"
        disabled={busy}
      />
      <button type="submit" className="btn-primary mt-1" disabled={busy || signedIn === null}>
        {busy ? "Opening checkout…" : `Subscribe for ${amount}/month`}
      </button>
      {error && (
        <p role="alert" className="text-xs text-rose-400">
          {error}
        </p>
      )}
      <p className="text-[11px] text-slate-500">Billed monthly in US dollars by Stripe. Cancel any time from your Stores account page.</p>
    </form>
  );
}
