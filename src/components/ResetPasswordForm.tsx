"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

export function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Something went wrong");
      else setDone(true);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md py-10">
      <div className="card-surface p-6">
        <h1 className="text-xl font-extrabold text-white">Choose a new password</h1>
        {!token ? (
          <p className="mt-3 text-sm text-rose-400">Missing reset token — please use the link from your email.</p>
        ) : done ? (
          <>
            <p className="mt-3 text-sm text-slate-300">Your password has been reset.</p>
            <Link href="/login" className="btn-primary mt-4 inline-block">Sign in</Link>
          </>
        ) : (
          <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password (min 6 characters)"
              autoComplete="new-password"
              minLength={6}
              className="input"
              required
            />
            {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Saving…" : "Reset password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
