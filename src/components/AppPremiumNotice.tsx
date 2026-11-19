"use client";

import Link from "next/link";
import { useIsNativeApp } from "@/lib/native";
import { useMe } from "@/lib/use-me";

// /premium and /premium/start inside the Android app: Premium is not sold there (Google Play's payments policy; owner,
// 2026-11-19, "hide buying in the app for now"), so the page is covered by this note. It names no other way to pay, which
// Play also forbids. A member signed in keeps every Premium feature in the app; only buying is gone. Web: nothing.
export function AppPremiumNotice() {
  const inApp = useIsNativeApp();
  const me = useMe();
  if (!inApp) return null;
  const member = !!me?.adFree;
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-ink-950 px-4 pb-28 pt-24">
      <div className="card-surface mx-auto max-w-sm p-6">
        <h2 className="text-xl font-extrabold text-white">{member ? "You're a member" : "Premium isn't sold in the app"}</h2>
        <p className="mt-2 text-sm text-slate-300">
          {member
            ? "Everything in your Premium plan works here in the app."
            : "If you're already a Premium member, sign in and everything in your plan works here in the app."}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {!member && (
            <Link href="/login?next=%2Fdashboard&src=app_premium" className="btn-primary text-sm">
              Sign in
            </Link>
          )}
          <Link href="/" className="btn-ghost text-sm">
            Back to prices
          </Link>
        </div>
      </div>
    </div>
  );
}
