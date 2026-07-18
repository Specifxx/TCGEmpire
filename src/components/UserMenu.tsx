"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useMe } from "@/lib/use-me";
import { usePremiumDialog } from "./PremiumDialog";

// Auth routes we never want to "return to" after sign-in (would loop).
const AUTH_PATHS = ["/login", "/register", "/forgot", "/reset", "/verify"];

export interface MenuUser {
  displayName: string;
  email: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  balanceCents: number;
}

// Profile icon (top-right) + dropdown. Signed out → a "sign in" person icon linking
// to /login. Signed in → avatar/initials with a menu (profile, wishlist, sign out).
export function UserMenu({ user }: { user: MenuUser | null }) {
  const [open, setOpen] = useState(false);
  const [resent, setResent] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { premium } = useMe();
  const { open: openPremium } = usePremiumDialog();
  const pathname = usePathname();
  // Carry the current page as ?next= so signing in returns the user here (not always
  // /profile). Skip auth pages to avoid a redirect loop.
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
    return (
      <Link
        href={loginHref}
        aria-label="Sign in"
        title="Sign in"
        className="grid h-9 w-9 place-items-center rounded-lg text-slate-200 hover:bg-ink-800 hover:text-white"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
        </svg>
      </Link>
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
        className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-full border border-ink-600 bg-ink-800 text-xs font-bold text-white hover:border-brand-500"
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
            <MenuLink href="/wishlist" onClick={() => setOpen(false)}>Wishlist</MenuLink>
            <MenuLink href="/feedback" onClick={() => setOpen(false)}>
              💬 Feedback{!premium ? <span className="text-gold"> · get Premium</span> : null}
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
