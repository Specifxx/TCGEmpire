"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// --- Verify email: confirm the token on load -------------------------------------
export function VerifyClient({ token }: { token: string }) {
  const [state, setState] = useState<"loading" | "ok" | "error">(token ? "loading" : "error");

  useEffect(() => {
    if (!token) return;
    fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((r) => setState(r.ok ? "ok" : "error"))
      .catch(() => setState("error"));
  }, [token]);

  return (
    <div className="card-surface p-6 text-center">
      {state === "loading" && <p className="py-6 text-sm text-slate-400">Confirming your email…</p>}
      {state === "ok" && (
        <>
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-500/15 text-brand-400">✓</div>
          <h1 className="mt-3 text-lg font-bold text-white">Email confirmed</h1>
          <p className="mt-1 text-sm text-slate-400">Your RiftCompare email is verified.</p>
          <Link href="/" className="btn-primary mt-4 inline-flex">Go to RiftCompare</Link>
        </>
      )}
      {state === "error" && (
        <>
          <h1 className="text-lg font-bold text-white">Link expired</h1>
          <p className="mt-1 text-sm text-slate-400">This confirmation link is invalid or has expired. Sign in and resend it from your profile menu.</p>
          <Link href="/login" className="btn-primary mt-4 inline-flex">Sign in</Link>
        </>
      )}
    </div>
  );
}
