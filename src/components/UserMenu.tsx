"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useMe } from "@/lib/use-me";
import { markSignupSource } from "@/lib/signup-source";
import { usePremiumDialog } from "./PremiumDialog";

// Auth routes we never want to "return to" after sign-in (would loop).
const AUTH_PATHS = ["/login", "/verify"];

export interface MenuUser {
  displayName: string;
  email: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  balanceCents: number;
  // The account's remembered market (see prisma User.preferredCountry) — null
  // until backfilled or explicitly chosen. Used by CountryProvider, not this menu.
  preferredCountry: string | null;
}

// Profile icon (top-right) + dropdown. Signed out → a "sign in" person icon linking
// to /login. Signed in → avatar/initials with a menu (profile, orders, sign out).
export function UserMenu({ user }: { user: MenuUser | null }) {
  const [open, setOpen] = useState(false);
  const [resent, setResent] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { premium } = useMe();
  const { open: openPremium } = usePremiumDialog();
  const pathname = usePathname();
  // Carry the current page as ?next= so signing in returns the user here (not always
  // /profile). Skip auth pages to avoid a redirect loop.
  //
  // SEO: this link is rendered on EVERY page (the navbar), so it mints one
  // /login?next=<path> URL per public URL on the site — ~1,600 of them. /login is
  // noindex, but it is deliberately NOT robots-disallowed (see app/robots.ts: a
  // Disallow would stop Google ever SEEING the noindex), so every variant is a
  // real crawlable URL. Googlebot renders JS, so it finds these even though the
  // link is client-only. rel="nofollow" keeps the return-to-page UX while taking
  // the whole ?next= family out of the crawl graph; /login and /register also
  // self-canonicalise so any variant already crawled collapses to one URL.
  const loginHref =
    pathname && pathname !== "/" && !AUTH_PATHS.some((p) => pathname.startsWith(p))
      ? `/login?next=${encodeURIComponent(pathname)}`
      : "/login";

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!user) {
    // A VISIBLE text button on sm+ — the icon-only person glyph was the entire
    // signed-out chrome, and an unlabeled 20px outline is not a call to action.
    //
    // "Log in / Sign up", not "Sign in" alone: a lone "Sign in" reads as a door
    // for people who already have an account, so a first-time visitor has no
    // reason to think it's for them — naming both halves is what makes the
    // header an entry point rather than a return path. One link, not two: both
    // words go to the same OAuth screen (there is no separate registration
    // flow — see /login), so splitting them into two controls would imply a
    // distinction the auth system doesn't have.
    //
    // The width is the cost, and this header has fought real overflow battles at
    // 640-790px (see scripts/mobile-check.ts's TABLET_WIDTHS sweep, which is the
    // check to run after touching this string). It fits because `sm:` starts at
    // 640 and the nav links collapse into the overflow menu below `md`. Below
    // `sm` the icon still stays — its label carries both words for screen
    // readers even though the glyph can't. Both keep rel="nofollow" and the
    // ?next= carry (see the SEO note above).
    return (
      <>
        <Link
          href={loginHref}
          rel="nofollow"
          onClick={() => markSignupSource("navbar")}
          className="btn-primary hidden whitespace-nowrap px-3 py-1.5 text-xs sm:inline-flex"
        >
          Log in / Sign up
        </Link>
        <Link
          href={loginHref}
          rel="nofollow"
          aria-label="Log in or sign up"
          title="Log in or sign up"
          onClick={() => markSignupSource("navbar")}
          className="tap-icon rounded-lg text-slate-200 hover:bg-ink-800 hover:text-white sm:hidden"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
          </svg>
        </Link>
      </>
    );
  }

  const initials = user.displayName.split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase() || "U";

  async function signOut() {
    setOpen(false);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    // Hard navigation so the server re-renders signed-out with the cleared cookie,
    // instead of the App Router client cache keeping the logged-in navbar.
    window.location.assign("/");
  }
  async function resendVerify() {
    await fetch("/api/auth/resend-verify", { method: "POST" }).catch(() => {});
    setResent(true);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-expanded={open}
        className="tap-icon relative overflow-hidden rounded-full border border-ink-600 bg-ink-800 text-xs font-bold text-white hover:border-brand-500"
      >
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarUrl} alt="" aria-hidden="true" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          initials
        )}
        {!user.emailVerified ? (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-ink-950 bg-gold" title="Email not verified" />
        ) : null}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-60 overflow-hidden rounded-xl border border-ink-700 bg-ink-900 shadow-2xl">
          <div className="border-b border-ink-700 px-4 py-3">
            <div className="truncate text-sm font-semibold text-white">{user.displayName}</div>
            <div className="truncate text-xs text-slate-500">{user.email}</div>
          </div>

          {!user.emailVerified && (
            <div className="border-b border-ink-700 bg-gold/10 px-4 py-2.5 text-xs text-gold">
              {resent ? (
                "Confirmation email sent — check your inbox."
              ) : (
                <>
                  Email not confirmed.{" "}
                  <button onClick={resendVerify} className="font-semibold underline hover:text-white">Resend</button>
                </>
              )}
            </div>
          )}

          <div className="py-1">
            {premium ? (
              <MenuLink href="/dashboard" onClick={() => setOpen(false)}>◆ Premium dashboard</MenuLink>
            ) : (
              <button
                onClick={() => { setOpen(false); openPremium(); }}
                className="block w-full px-4 py-2.5 text-left text-sm font-bold text-gold hover:bg-ink-800"
              >
                ✦ Get Premium
              </button>
            )}
            <MenuLink href="/profile" onClick={() => setOpen(false)}>Profile</MenuLink>
            <MenuLink href="/profile#collection" onClick={() => setOpen(false)}>My collection</MenuLink>
            <MenuLink href="/watching" onClick={() => setOpen(false)}>🔔 My watchlist</MenuLink>
            {/* Marketplace disabled site-wide (2026-08-19) — this whole block used to
                render "Seller dashboard" unconditionally (unlike the two links below
                it, which were already gated by MARKETPLACE_NAV_VISIBLE) and the two
                gated links. All three are gone from this menu now. The routes
                themselves are untouched — anyone with an existing order/listing to
                manage can still reach /marketplace/sell, /marketplace/orders and
                /marketplace/funds directly (e.g. via a transactional email link);
                they're just no longer linked from here. See lib/marketplace.ts. */}
            <MenuLink href="/feedback" onClick={() => setOpen(false)}>
              Feedback{!premium ? <span className="text-gold"> · get Premium</span> : null}
            </MenuLink>
          </div>
          <div className="border-t border-ink-700 py-1">
            <button onClick={signOut} className="block w-full px-4 py-2.5 text-left text-sm text-slate-300 hover:bg-ink-800 hover:text-white">
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuLink({ href, onClick, children }: { href: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Link href={href} onClick={onClick} className="block px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-ink-800 hover:text-white">
      {children}
    </Link>
  );
}
