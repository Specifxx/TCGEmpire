"use client";

import { useState } from "react";

// "Email me a sign-in link" (2026-11-06, lib/email-sign-in.ts): the way in for
// anyone whose address is on neither Google nor Discord — an iCloud address
// a guest Premium checkout was paid with, above all. Posts to
// /api/auth/email-link, which always answers the same ok.
export function EmailSignInForm({ next, defaultOpen = false }: { next?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-ink-600 py-2.5 text-sm font-semibold text-slate-200 hover:border-brand-500 hover:text-white"
      >
        <MailIcon /> Email me a sign-in link
      </button>
    );
  }

  if (state === "sent") {
    return (
      <div role="status" className="rounded-xl border border-brand-500/40 bg-brand-500/10 p-3 text-sm text-slate-200">
        <p className="font-semibold text-white">Check your inbox</p>
        <p className="mt-1">
          We sent a sign-in link to <span className="font-semibold">{email}</span>. It lasts 30 minutes. Not there in a
          minute? Check your junk folder, or{" "}
          <button type="button" className="text-brand-400 hover:underline" onClick={() => setState("idle")}>
            send it again
          </button>
          .
        </p>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/auth/email-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, next }),
      });
      if (res.ok) {
        setState("sent");
        return;
      }
      const data = await res.json().catch(() => null);
      setError(res.status === 429 ? "Too many tries. Please wait a few minutes." : data?.error ?? "Couldn't send the email. Please try again.");
      setState("error");
    } catch {
      setError("Couldn't send the email. Please try again.");
      setState("error");
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor="email-sign-in" className="text-xs font-semibold text-slate-400">
        Your email address
      </label>
      <input
        id="email-sign-in"
        type="email"
        name="email"
        required
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@icloud.com"
        className="min-h-11 rounded-xl border border-ink-600 bg-ink-900 px-3 text-base text-white placeholder:text-slate-600 focus:border-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      />
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <button type="submit" disabled={state === "sending"} className="btn-primary min-h-11 justify-center text-sm">
        {state === "sending" ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}

function MailIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}
