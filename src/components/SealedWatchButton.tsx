"use client";

import { useEffect, useState } from "react";
import { useMe } from "@/lib/use-me";
import { useSealedWatches } from "@/lib/use-sealed-watches";
import { useCountryMaybe } from "./CountryProvider";
import { DEFAULT_COUNTRY } from "@/lib/country";
import { PremiumButton } from "./PremiumButton";
import { FREE_SEALED_WATCH_IN_USE, FREE_SEALED_WATCH_LIMIT, SEALED_CHECK_CADENCE, SEALED_RRP_ONLY, SEALED_WATCH_LIMIT_PLUS } from "@/lib/alert-limits";
import { ENTRY_TIER_NAME } from "@/lib/site";
import { sealedPath } from "@/lib/sealed-slug";
import { trackEvent } from "@/lib/analytics";

// "Watch this sealed product" (2026-09-29): a toggle for any signed-in account
// — an email when it is back in stock after selling out everywhere, when a
// store has it at RRP, at the target, or on a material drop
// (lib/sealed-watch.ts). A FREE account gets FREE_SEALED_WATCH_LIMIT (one,
// 2026-10-23, DECISIONS.md "Free accounts get one alert"): the toggle works for
// its first; on another product once that one is in use (or after the route's
// 402) the same spot sells Premium through the site-wide PremiumButton
// (surface gate:sealed-watch), with one honest line. A signed-out visitor sees
// that button as before (it asks them to sign in). Never a popup of its own.
// `compact` is the /sealed tile's icon.
export function SealedWatchButton({
  groupKey,
  name,
  compact = false,
  className = "",
  market,
}: {
  groupKey: string;
  name: string;
  compact?: boolean;
  className?: string;
  /** The market the watch is for; defaults to the CountryProvider's, when there is one. */
  market?: string;
}) {
  const { user, loaded, premium } = useMe();
  const ctx = useCountryMaybe(); // always called: hooks must not be conditional
  const country = market ?? ctx?.country ?? DEFAULT_COUNTRY;
  const { rows, rowFor, watch, unwatch, loaded: watchesLoaded } = useSealedWatches();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [refused, setRefused] = useState(false);
  if (!loaded) return null;
  const row = rowFor(country, groupKey);
  const watching = !!row;
  // A free account whose one watch is on another product (or the route said so).
  const freeInUse = !!user && !premium && !watching && (refused || (rows?.length ?? 0) >= FREE_SEALED_WATCH_LIMIT);

  if (!user) {
    // No account: the tile's heart links to the product page's form (below);
    // the full button is the form itself (2026-11-06, DECISIONS.md "Sealed
    // watches without an account"). Never a pop-up.
    if (compact) {
      return (
        <a
          href={`${sealedPath(groupKey)}#sealed-watch`}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Watch ${name}: email me on a restock, at RRP, or on a price drop`}
          title="Watch: email me when it's back in stock, at RRP, or on a price drop"
          className={`tap-icon rounded-full bg-ink-950/80 text-slate-300 hover:text-white ${className}`}
        >
          <span aria-hidden="true">♡</span>
        </a>
      );
    }
    return <AnonymousSealedWatchForm groupKey={groupKey} name={name} market={country} className={className} />;
  }

  if (freeInUse) {
    if (compact) {
      return (
        <PremiumButton surface="gate:sealed-watch" className={`tap-icon rounded-full bg-ink-950/80 text-slate-300 hover:text-white ${className}`}>
          <span aria-hidden="true">♡</span>
          <span className="sr-only">{FREE_SEALED_WATCH_IN_USE}</span>
        </PremiumButton>
      );
    }
    return (
      <div className={className}>
        <p className="text-xs text-slate-400">{FREE_SEALED_WATCH_IN_USE}</p>
        <div className="mt-1.5">
          <PremiumButton surface="gate:sealed-watch" />
        </div>
      </div>
    );
  }

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy || !watchesLoaded) return;
    setBusy(true);
    setNote(null);
    try {
      if (row) await unwatch(row.id);
      else {
        const out = await watch(groupKey);
        if (!out.ok && out.status === 402) setRefused(true);
        else if (!out.ok) {
          setNote(
            out.status === 409
              ? `Plus watches up to ${SEALED_WATCH_LIMIT_PLUS} sealed products. Stop one on your watchlist, or move to Premium for unlimited.`
              : (out.body?.error as string | undefined) ?? "Couldn't save that — try again.",
          );
        }
      }
    } finally {
      setBusy(false);
    }
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={watching}
        aria-label={watching ? `Stop watching ${name}` : `Watch ${name}: email me on a restock, at RRP, or at my price`}
        title={watching ? "Watching — tap to stop" : "Watch: email me when it's back in stock, at RRP, or at my price"}
        className={`tap-icon rounded-full bg-ink-950/80 ${watching ? "text-brand-400" : "text-slate-300 hover:text-white"} ${className}`}
      >
        <span aria-hidden="true">{watching ? "♥" : "♡"}</span>
      </button>
    );
  }
  return (
    <div className={className}>
      <button type="button" onClick={toggle} disabled={busy} aria-pressed={watching} className={watching ? "btn-ghost text-xs" : "btn-primary text-xs"}>
        {watching ? "♥ Watching — stop" : "♡ Watch this product"}
      </button>
      <p className="mt-1 text-[11px] text-slate-500">
        {watching
          ? `We email you when it's back in stock after selling out everywhere, at RRP, at your target, or on a real drop. Checked ${SEALED_CHECK_CADENCE}; a Discord stock bot may be faster. At-RRP alerts: ${SEALED_RRP_ONLY}. Set a target on your watchlist.`
          : `Email me when it's back in stock, at RRP, or at my price. Checked ${SEALED_CHECK_CADENCE}; a Discord stock bot may be faster. At-RRP alerts: ${SEALED_RRP_ONLY}.`}
      </p>
      {note && (
        <p role="alert" className="mt-1 text-xs text-amber-300">
          {note}
        </p>
      )}
    </div>
  );
}

// The address PriceAlertModal remembers (its EMAIL_KEY): one email door, one
// remembered address, so a visitor who already gets card alerts sees it filled.
const EMAIL_KEY = "rc_alert_email";

// "bill.jyang101@gmail.com" → "bi***@gmail.com" (lib/alert-mute.ts maskEmail, kept out of this client file).
const maskEmail = (email: string) => {
  const [local = "", domain] = email.split("@");
  if (!domain) return "your email";
  return `${local.slice(0, 2)}${local.length > 2 ? "***" : "*"}@${domain}`;
};

const readEmail = () => {
  try {
    return window.localStorage.getItem(EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
};

// "Email me when it drops": the sealed page's form for a visitor with no
// account (2026-11-06). One input, no gate; POST /api/watches/sealed writes a
// row with no account (one live watch per address, as a free account) and
// sends one confirmation. Past the one free watch the route answers 402 and
// the same spot sells Premium, as it does for a free account. Inline in the
// page, never a pop-up (the pop-up policy).
function AnonymousSealedWatchForm({ groupKey, name, market, className }: { groupKey: string; name: string; market: string; className: string }) {
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<"form" | "busy" | "done" | "limit">("form");
  const [error, setError] = useState<string | null>(null);
  const [remembered, setRemembered] = useState(false);
  useEffect(() => {
    const e = readEmail();
    if (e) {
      setEmail(e);
      setRemembered(true);
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (phase === "busy") return;
    const addr = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
      setError("Enter the email address to send the alert to.");
      return;
    }
    setPhase("busy");
    setError(null);
    const res = await fetch("/api/watches/sealed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: addr, groupKey }),
    }).catch(() => null);
    const body = res ? ((await res.json().catch(() => null)) as Record<string, unknown> | null) : null;
    if (res?.ok) {
      try {
        window.localStorage.setItem(EMAIL_KEY, addr);
      } catch {
        /* private mode */
      }
      setPhase("done");
      trackEvent("sealed_watch_add", { product: groupKey, account: "none" });
      return;
    }
    if (res?.status === 402) {
      setPhase("limit");
      return;
    }
    setPhase("form");
    setError((body?.error as string | undefined) ?? "Couldn't save that — try again.");
  }

  if (phase === "done") {
    return (
      <div className={className}>
        <p role="status" className="text-xs text-brand-400">
          ♥ Watching {name} for {maskEmail(email.trim().toLowerCase())}. We email you when it&apos;s back in stock, at RRP, or on a real drop, checked {SEALED_CHECK_CADENCE}.
        </p>
        <p className="mt-1 text-[11px] text-slate-500">Every email has a stop link. A free account keeps all your watches in one place.</p>
      </div>
    );
  }
  if (phase === "limit") {
    return (
      <div className={className}>
        <p className="text-xs text-slate-400">This address already gets one free sealed alert. Stop it from the link in its email, or watch every product with {ENTRY_TIER_NAME}.</p>
        <div className="mt-1.5">
          <PremiumButton surface="gate:sealed-watch" />
        </div>
      </div>
    );
  }
  return (
    <form id="sealed-watch" onSubmit={submit} className={`${className} scroll-mt-header`} onClick={(e) => e.stopPropagation()}>
      <label htmlFor={`sealed-watch-email-${groupKey.replace(/[^a-z0-9]/gi, "-")}`} className="text-xs text-slate-400">
        Email me when it&apos;s back in stock, at RRP, or on a real drop ({market}). No account needed.
      </label>
      <div className="mt-1.5 flex gap-2">
        <input
          id={`sealed-watch-email-${groupKey.replace(/[^a-z0-9]/gi, "-")}`}
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="input min-w-0 flex-1 text-sm"
        />
        <button type="submit" disabled={phase === "busy"} className="btn-primary shrink-0 text-xs">
          {phase === "busy" ? "Saving…" : remembered ? "♡ Watch" : "Notify me"}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">Checked {SEALED_CHECK_CADENCE}; a Discord stock bot may be faster. At-RRP alerts: {SEALED_RRP_ONLY}. One free sealed alert per address.</p>
      {error && (
        <p role="alert" className="mt-1 text-xs text-amber-300">
          {error}
        </p>
      )}
    </form>
  );
}
