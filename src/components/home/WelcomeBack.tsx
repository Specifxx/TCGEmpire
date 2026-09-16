"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMe } from "@/lib/use-me";
import { useWatchlist } from "@/lib/use-watchlist";
import { useUnreadCount } from "@/lib/use-unread";
import { readRiftleStreak } from "@/lib/riftle-shared";
import { WelcomeChecklist } from "@/components/WelcomeChecklist";

const CHIP = "chip border border-ink-700 bg-ink-900 text-slate-300 transition-colors hover:border-brand-500/60 hover:text-white";

// The signed-in twin of AccountStrip — renders in the exact slot AccountStrip
// vacates for a member (that component already self-hides when `user` is
// set), so the homepage's one account-shaped slot always shows the right
// pitch for who's looking at it. Same ISR-safe shape: identical on first
// paint for every visitor, only ever hiding/showing itself after hydration.
export function WelcomeBack() {
  const { user, loaded } = useMe();
  const { watched } = useWatchlist();
  const unread = useUnreadCount();
  const [streak, setStreak] = useState(0);
  useEffect(() => {
    setStreak(readRiftleStreak());
  }, []);

  if (!loaded || !user) return null;
  const firstName = user.displayName.split(" ")[0] || user.displayName;

  return (
    <>
      <section className="card-surface p-5 sm:p-6">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-white">Welcome back, {firstName}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {streak > 0 && (
                <Link href="/riftle" className={CHIP}>{streak} Riftle win streak</Link>
              )}
              <Link href="/watching" className={CHIP}>{watched?.size ?? 0} watched</Link>
              <Link href="/dashboard" className={CHIP}>{unread > 0 ? `${unread} unread` : "Your dashboard"}</Link>
              {user.preferredCountry == null && (
                <Link href="/profile" className="chip bg-brand-500/15 text-brand-300 hover:bg-brand-500/25">
                  Set your market →
                </Link>
              )}
            </div>
          </div>
          <Link href="/dashboard" className="btn-primary shrink-0 whitespace-nowrap">
            Go to your dashboard
          </Link>
        </div>
      </section>

      {/* Renders nothing outside the 7-day welcome window, once dismissed, or
          once all three steps are done — see its own comment. */}
      <WelcomeChecklist />
    </>
  );
}
