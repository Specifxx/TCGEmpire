"use client";

import { useEffect, useState } from "react";
import { markGiveawayEntered } from "./GiveawayPrompt";

// The entry box for /giveaway. The page is static; this island asks /api/giveaway who is looking (after mount, so
// the page never reads a cookie), and shows the account's entries and the free ways to more (lib/giveaway.ts).
type Me = {
  state: "upcoming" | "open" | "closed";
  signedIn: boolean;
  emailVerified?: boolean;
  entered?: boolean;
  entries?: number;
  reason?: "premium" | "watch" | "base";
  referrals?: number;
  showName?: boolean;
  inviteUrl?: string;
};

export function GiveawayEnter({ giveaway, cardHref, maxReferrals }: { giveaway: string; cardHref: string; maxReferrals: number }) {
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/giveaway", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Me) => {
        if (!live) return;
        setMe(j);
        if (j.entered) markGiveawayEntered(); // the corner card never asks an entrant again
      })
      .catch(() => live && setMe({ state: "open", signedIn: false }));
    return () => {
      live = false;
    };
  }, []);

  async function send(extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/giveaway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ giveaway, ...extra }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.entered) {
        const first = !me?.entered;
        setMe((m) => (m ? { ...m, entered: true, entries: j.entries ?? m.entries, showName: j.showName ?? m.showName } : m));
        markGiveawayEntered();
        if (first) {
          try {
            (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.("event", "giveaway_enter", { giveaway });
          } catch {
            /* analytics never blocks an entry */
          }
        }
      } else setError(j.error ?? "Couldn't save that. Please try again.");
    } catch {
      setError("Couldn't save that. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copyInvite() {
    if (!me?.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(me.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the link is on screen to copy by hand */
    }
  }

  const box = "mt-4 rounded-xl border border-white/10 bg-white/5 p-4";
  if (!me) return <div className={box} style={{ minHeight: 72 }} aria-busy="true" />;
  if (me.state === "upcoming") return <p className={box}>Entries open soon.</p>;
  if (me.state === "closed") return <p className={box}>Entries have closed. Thanks to everyone who entered. We&apos;ll email the winner.</p>;
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
  const err = error && (
    <p className="mt-2 text-sm text-red-400" role="alert">
      {error}
    </p>
  );
  if (!me.entered)
    return (
      <div className={box}>
        <button type="button" onClick={() => send()} disabled={busy} className="btn-primary">
          {busy ? "Entering…" : `Enter the giveaway${(me.entries ?? 1) > 1 ? ` (${me.entries} entries)` : ""}`}
        </button>
        {err}
      </div>
    );

  const entries = me.entries ?? 1;
  const referrals = me.referrals ?? 0;
  return (
    <div className={box} role="status">
      <p>
        <strong>You&apos;re in with {entries} {entries === 1 ? "entry" : "entries"}.</strong> We&apos;ll email you if you win.
      </p>
      <ul className="mt-3 space-y-2 text-sm">
        <li>
          {me.reason === "base" ? (
            <>
              <strong>Get 3 entries free:</strong> watch the price of any card (try{" "}
              <a href={cardHref} className="underline">
                Miss Fortune, Captain
              </a>
              ), then press Update below. Premium members get 3 automatically.
            </>
          ) : (
            <>✓ 3 entries for {me.reason === "premium" ? "Premium" : "watching a price"}.</>
          )}
        </li>
        <li>
          <strong>+1 entry per friend</strong> who joins with your link and confirms their email (up to {maxReferrals}). So far: {referrals}.
          {me.inviteUrl && (
            <span className="mt-1 flex flex-wrap items-center gap-2">
              <code className="max-w-full truncate rounded bg-black/30 px-2 py-1 text-xs">{me.inviteUrl}</code>
              <button type="button" onClick={copyInvite} className="text-xs underline">
                {copied ? "Copied" : "Copy link"}
              </button>
            </span>
          )}
        </li>
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => send()} disabled={busy} className="btn-primary">
          {busy ? "Updating…" : "Update my entries"}
        </button>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={me.showName !== false} disabled={busy} onChange={(e) => send({ showName: e.target.checked })} />
          Show my first name on the leaderboard
        </label>
      </div>
      {err}
    </div>
  );
}
