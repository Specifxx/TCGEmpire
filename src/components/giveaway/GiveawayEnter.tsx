"use client";

import { useEffect, useState } from "react";

// The entry button for /giveaway. The page is static; this island asks
// /api/giveaway who is looking (after mount, so the page never reads a cookie).
type Me = { state: "upcoming" | "open" | "closed"; signedIn: boolean; emailVerified?: boolean; entered?: boolean };

export function GiveawayEnter({ giveaway }: { giveaway: string }) {
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/giveaway", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Me) => live && setMe(j))
      .catch(() => live && setMe({ state: "open", signedIn: false }));
    return () => {
      live = false;
    };
  }, []);

  async function enter() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/giveaway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ giveaway }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.entered) {
        setMe((m) => (m ? { ...m, entered: true } : m));
        try {
          (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.("event", "giveaway_enter", { giveaway });
        } catch {
          /* analytics never blocks an entry */
        }
      } else setError(j.error ?? "Couldn't enter. Please try again.");
    } catch {
      setError("Couldn't enter. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const box = "mt-4 rounded-xl border border-white/10 bg-white/5 p-4";
  if (!me) return <div className={box} style={{ minHeight: 72 }} aria-busy="true" />;
  if (me.state === "upcoming") return <p className={box}>Entries open soon.</p>;
  if (me.state === "closed") return <p className={box}>Entries have closed. Thanks to everyone who entered. We&apos;ll email the winner.</p>;
  if (me.entered)
    return (
      <p className={box} role="status">
        <strong>You&apos;re in.</strong> One entry per account, so there&apos;s nothing more to do. We&apos;ll email you if you win.
      </p>
    );
  if (!me.signedIn)
    return (
      <div className={box}>
        <a rel="nofollow" href="/login?next=%2Fgiveaway&src=giveaway" className="btn-primary inline-block">
          Sign in free to enter
        </a>
        <p className="mt-2 text-sm opacity-80">Google or an email link. It takes about 20 seconds and costs nothing.</p>
      </div>
    );
  if (!me.emailVerified)
    return (
      <p className={box}>
        Please confirm your email address first (check your inbox for our message), then come back and press Enter. We need it to reach the winner.
      </p>
    );
  return (
    <div className={box}>
      <button type="button" onClick={enter} disabled={busy} className="btn-primary">
        {busy ? "Entering…" : "Enter the giveaway"}
      </button>
      {error && (
        <p className="mt-2 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
