"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const isRegister = mode === "register";
  const [email, setEmail] = useState(isRegister ? "" : "demo@tcgempire.au");
  const [password, setPassword] = useState(isRegister ? "" : "password123");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isRegister ? { email, password, displayName } : { email, password }
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        setLoading(false);
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Network error — is the server running?");
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md py-10">
      <div className="card-surface p-6">
        <h1 className="text-xl font-extrabold text-white">
          {isRegister ? "Create your account" : "Sign in to TCGEmpire"}
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          {isRegister
            ? "New accounts start with $100 in demo wallet credit."
            : "Welcome back, collector."}
        </p>

        {!isRegister && (
          <div className="mt-4 rounded-lg border border-brand-500/30 bg-brand-500/10 p-3 text-xs text-slate-300">
            <span className="font-semibold text-brand-400">Demo account</span> is
            pre-filled — just hit Sign in. ($500 wallet, ready to buy &amp; sell.)
          </div>
        )}

        <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
          {isRegister && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-400">
                Display name
              </span>
              <input
                className="input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. RiftCollector"
                required
              />
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">
              Email
            </span>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">
              Password
            </span>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}

          <button type="submit" className="btn-primary mt-1" disabled={loading}>
            {loading ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-400">
          {isRegister ? (
            <>
              Already have an account?{" "}
              <Link href="/login" className="text-brand-400 hover:underline">
                Sign in
              </Link>
            </>
          ) : (
            <>
              New to TCGEmpire?{" "}
              <Link href="/register" className="text-brand-400 hover:underline">
                Create an account
              </Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
