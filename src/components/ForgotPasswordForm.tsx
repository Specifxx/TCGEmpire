"use client";

import Link from "next/link";
import { useState } from "react";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch {
      setSent(true); // we never reveal failures here either
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md py-10">
      <div className="card-surface p-6">
        <h1 className="text-xl font-extrabold text-white">Reset your password</h1>
        {sent ? (
          <p className="mt-3 text-sm text-slate-300">
            If an account exists for <span className="font-semibold text-white">{email}</span>, we&apos;ve
            emailed a password-reset link. Check your inbox (and your spam folder).
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-400">
              Enter your account email and we&apos;ll send you a link to choose a new password.
            </p>
            <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="input"
                required
              />
              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>
          </>
        )}
        <p className="mt-4 text-center text-sm text-slate-400">
          <Link href="/login" className="text-brand-400 hover:underline">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
