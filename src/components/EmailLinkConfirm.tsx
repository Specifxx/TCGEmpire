"use client";

import { useState } from "react";

// The button on /login/email that actually signs in (POST), so a mail scanner
// that fetches the emailed link cannot use it up (lib/email-sign-in.ts).
export function EmailLinkConfirm({ token, next }: { token: string; next?: string }) {
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const go = async () => {
    setState("working");
    try {
      const res = await fetch("/api/auth/email-link/consume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, next, name }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && typeof data?.next === "string") {
        window.location.assign(data.next);
        return;
      }
      setError(data?.error ?? "That didn't work. Please ask for a new link below.");
    } catch {
      setError("That didn't work. Please try again.");
    }
    setState("error");
  };
  return (
    <div className="mt-4">
      <label htmlFor="email-link-name" className="text-xs font-semibold text-slate-400">
        Your name <span className="font-normal text-slate-500">(new here? optional, shown on leaderboards and reviews)</span>
      </label>
      <input
        id="email-link-name"
        type="text"
        autoComplete="nickname"
        maxLength={24}
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="mb-3 mt-1 min-h-11 w-full rounded-xl border border-ink-600 bg-ink-900 px-3 text-base text-white focus:border-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      />
      <button type="button" onClick={go} disabled={state === "working"} className="btn-primary min-h-11 w-full justify-center">
        {state === "working" ? "Signing you in…" : "Sign in to RiftCompare"}
      </button>
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
