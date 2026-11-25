"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { clearAppVerifier, readAppVerifier } from "@/lib/native";
import { invalidateMe } from "@/lib/use-me";
import { POST_SIGN_IN_FALLBACK } from "@/lib/next-param";

// Finishes a sign-in started inside the Android app (lib/app-auth.ts): trades the one-time code and this WebView's verifier for
// a session, then goes where the visitor was headed.
export function AppSignInFinish({ code, next }: { code: string; next?: string }) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const verifier = readAppVerifier();
    if (!code || !verifier) {
      setError("That sign-in didn't finish. Please try again.");
      return;
    }
    let cancelled = false;
    fetch("/api/auth/app-exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ code, verifier }),
    })
      .then(async (res) => {
        if (cancelled) return;
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body?.error ?? "Couldn't sign you in. Please try again.");
          return;
        }
        clearAppVerifier();
        invalidateMe();
        window.location.replace(next ?? POST_SIGN_IN_FALLBACK);
      })
      .catch(() => !cancelled && setError("Couldn't reach RiftCompare. Check your connection and try again."));
    return () => {
      cancelled = true;
    };
  }, [code, next]);

  if (!error) return <p className="mt-2 text-sm text-slate-300">One moment…</p>;
  return (
    <>
      <p className="mt-2 text-sm text-rose-300" role="alert">{error}</p>
      <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="btn-primary mt-4 inline-flex">
        Back to sign in
      </Link>
    </>
  );
}
