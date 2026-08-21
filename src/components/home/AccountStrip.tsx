"use client";

import Link from "next/link";
import { markSignupSource } from "@/lib/signup-source";
import { useMe } from "@/lib/use-me";

// The homepage's ONE account pitch. Before this the homepage — the site's
// front door — contained zero account references outside the navbar icon and
// the session popup; the free tier (alerts/portfolio/watchlist) was pitched
// nowhere a first-time visitor actually reads.
//
// Client component, but it renders IDENTICALLY for every visitor's first
// paint (the signed-in check only ever *hides* it after hydration), so the
// homepage's caching story is unchanged — no user state is baked into server
// HTML. Perks mirror the popup's PERKS list; one primary CTA, `home` source.
const PERKS: [string, string][] = [
  ["Price alerts", "get an email when a card hits your price"],
  ["Portfolio", "see what your collection is worth, live"],
  ["Watchlist", "save cards and jump back anytime"],
];

export function AccountStrip() {
  const { user, loaded } = useMe();
  // Hide for signed-in members — pitching an account at an account holder is
  // noise. Until auth resolves, render it (signed-out is the overwhelmingly
  // common case for this page, and a flash-of-nothing hurts more).
  if (loaded && user) return null;
  return (
    <section className="card-surface p-5 sm:p-6">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold text-white">Track the cards you care about</h2>
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-slate-300">
            {PERKS.map(([perk, why]) => (
              <li key={perk} className="flex items-center gap-1.5">
                <span aria-hidden className="font-bold text-brand-400">✓</span>
                <span>
                  <span className="font-semibold text-slate-200">{perk}</span>
                  <span className="hidden text-slate-400 md:inline"> — {why}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <Link
          href="/login"
          rel="nofollow"
          onClick={() => markSignupSource("home")}
          className="btn-primary shrink-0 whitespace-nowrap"
        >
          Create your free account
        </Link>
      </div>
    </section>
  );
}
