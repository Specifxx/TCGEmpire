"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useMe } from "@/lib/use-me";
import { useWatchlist } from "@/lib/use-watchlist";
import { useCountry } from "./CountryProvider";
import { markSignupSource } from "@/lib/signup-source";
import { PENDING_WATCH_KEY } from "@/lib/signup-source-shared";
import { trackAuthStart, trackSignupCta } from "@/lib/growth-events";
import { trackEvent } from "@/lib/analytics";
import { cardImageSrc } from "@/lib/card-image-url";
import type { FreeLimitBody } from "@/lib/free-limits";
import type { ChaseCard } from "@/lib/radiance-watch";
import { FreeLimitPanel } from "./FreeLimitPanel";
import { NewsletterSignup } from "./NewsletterSignup";

// "Follow Radiance's chase cards": one click watches all of them (2026-10-16
// growth pass; lib/radiance-watch.ts has the why). Page content, never a
// popup: it sits where the page's own email box used to, so a Radiance post
// asks once, not twice.
//
// Signed out: Google/Discord creates the account and, on return, SignupWelcome
// watches every card in the stash (`cardIds`). Signed in: one click watches the
// ones not yet watched. The email-only newsletter stays one tap away for anyone
// who would rather not make an account.
//
// The copy names what will actually arrive: an unpriced card's first email is
// its first price (lib/price-alerts.ts isFirstPrice), a priced one's is a drop.
export const CHASE_WATCH_SOURCE = "radiance_watch";

export function ChaseWatchCta({
  cards,
  released,
  className = "",
}: {
  cards: ChaseCard[];
  /** Radiance is out: the alerts are price drops, not first prices. */
  released: boolean;
  className?: string;
}) {
  const { user, loaded, providers } = useMe();
  const { watched, watch } = useWatchlist();
  const { country } = useCountry();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState<number | null>(null);
  const [limit, setLimit] = useState<FreeLimitBody | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);

  if (!cards.length) return null;
  const ids = cards.map((c) => c.id);
  const remaining = watched ? ids.filter((id) => !watched.has(id)) : ids;
  const allWatched = !!user && !!watched && remaining.length === 0;
  const n = cards.length;

  const startOAuth = (provider: "google" | "discord") => {
    try {
      localStorage.setItem(PENDING_WATCH_KEY, JSON.stringify({ cardIds: ids, market: country, label: "Radiance chase cards" }));
    } catch {
      /* private mode: the account is still made, the watch is one more click */
    }
    markSignupSource(CHASE_WATCH_SOURCE);
    trackSignupCta(CHASE_WATCH_SOURCE);
    trackAuthStart(provider, CHASE_WATCH_SOURCE);
  };
  const oauthHref = (provider: "google" | "discord") => `/api/auth/oauth/${provider}?next=${encodeURIComponent(pathname || "/sets/radiance")}`;

  const watchAll = async () => {
    setBusy(true);
    let ok = 0;
    try {
      // One at a time: the watch route is per card, and stopping at the free
      // limit must leave a clear count rather than a burst of refusals.
      for (const id of remaining) {
        let stopped = false;
        const saved = await watch(id, country, {
          onLimit: (l) => {
            stopped = true;
            setLimit(l);
          },
        });
        if (saved) ok++;
        if (stopped) break;
      }
      setAdded(ok);
      trackEvent("chase_watch_all", { added: ok, of: remaining.length });
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside aria-labelledby="chase-watch-h" className={`not-prose card-surface overflow-hidden rounded-2xl border border-gold/30 ${className}`}>
      <div className="bg-[radial-gradient(ellipse_at_top_left,rgba(232,183,72,0.14),transparent_60%)] p-4 sm:p-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold">Free price alerts</p>
        <h2 id="chase-watch-h" className="mt-1 text-lg font-extrabold leading-snug text-white sm:text-xl">
          Follow Radiance&apos;s {n} chase cards
        </h2>
        <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-300">
          {released
            ? "The Signature and over-numbered cards everyone is chasing. We'll email you when any of them drops, at every store we track."
            : "The Signature and over-numbered cards everyone will be chasing. We'll email you the day each one gets its first price, and again when it drops."}
        </p>

        <ul className="mt-3 flex gap-1.5 overflow-x-auto pb-1" aria-label="The chase cards">
          {cards.map((c) => {
            const src = cardImageSrc(c);
            return (
              <li key={c.id} className="w-[52px] shrink-0 sm:w-[60px]">
                <Link href={c.slug ? `/card/${c.slug}` : "#"} title={`${c.name} · ${c.collectorNumber}`} className="block">
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt={`${c.name} ${c.collectorNumber}`} loading="lazy" className="aspect-[5/7] w-full rounded-md object-cover ring-1 ring-white/10" />
                  ) : (
                    <span className="grid aspect-[5/7] w-full place-items-center rounded-md bg-ink-800 text-[9px] text-slate-500">{c.collectorNumber}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 min-h-[44px]">
          {!loaded ? null : user ? (
            allWatched || (added !== null && !limit && added >= remaining.length) ? (
              <p className="text-sm font-semibold text-gold">
                ✓ You&apos;re following all {n}.{" "}
                <Link href="/watching" className="font-semibold text-brand-300 underline-offset-2 hover:underline">
                  See your watchlist →
                </Link>
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={watchAll} disabled={busy} className="btn-primary text-sm">
                  {busy ? "Adding…" : remaining.length === n ? `Watch all ${n}` : `Watch the other ${remaining.length}`}
                </button>
                {added !== null && limit && (
                  <span className="text-xs text-slate-400">Added {added}; your free watchlist is full.</span>
                )}
              </div>
            )
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {providers.includes("google") && (
                <a href={oauthHref("google")} rel="nofollow" onClick={() => startOAuth("google")} className="btn-primary text-sm">
                  Follow with Google
                </a>
              )}
              {providers.includes("discord") && (
                <a href={oauthHref("discord")} rel="nofollow" onClick={() => startOAuth("discord")} className="btn-ghost text-sm">
                  Follow with Discord
                </a>
              )}
              {!providers.length && (
                <Link
                  href={`/login?src=${CHASE_WATCH_SOURCE}&next=${encodeURIComponent(pathname || "/sets/radiance")}`}
                  rel="nofollow"
                  onClick={() => {
                    markSignupSource(CHASE_WATCH_SOURCE);
                    trackSignupCta(CHASE_WATCH_SOURCE);
                  }}
                  className="btn-primary text-sm"
                >
                  Create a free account
                </Link>
              )}
              <button type="button" onClick={() => setEmailOpen((o) => !o)} className="text-xs font-semibold text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline">
                {emailOpen ? "Hide" : "Just email me instead"}
              </button>
            </div>
          )}
        </div>
        {!user && loaded && (
          <p className="mt-2 text-[11px] text-slate-500">Free account, no card needed. One click makes it and adds the {n} cards to your watchlist.</p>
        )}
        <p className="mt-3 border-t border-white/5 pt-3 text-xs text-slate-400">
          Opened a box?{" "}
          <Link href="/tools/pull-tracker/radiance" className="font-semibold text-brand-300 underline-offset-2 hover:underline">
            Log what you pulled and see what it&apos;s worth →
          </Link>
        </p>
        {limit && <FreeLimitPanel kind="watchlist" count={limit.count} onClose={() => setLimit(null)} className="mt-3 w-full" />}
        {emailOpen && !user && (
          <div className="mt-3">
            <NewsletterSignup
              siteName="RiftCompare"
              variant="card"
              source="radiance-launch"
              heading={released ? "Radiance price moves by email" : "Get Radiance spoilers + price moves by email"}
              cta="Email me"
              button="ghost"
            />
          </div>
        )}
      </div>
    </aside>
  );
}
