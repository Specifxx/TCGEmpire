"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

// Only allow same-site relative redirects (no open-redirect to external URLs).
function safeNext(): string {
  if (typeof window === "undefined") return "/forum";
  const n = new URLSearchParams(window.location.search).get("next");
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/forum";
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const isRegister = mode === "register";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
        body: JSON.stringify(isRegister ? { email, password, displayName } : { email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        setLoading(false);
        return;
      }
      // Return the user to where they came from (e.g. the forum), not the homepage.
      router.push(safeNext());
      router.refresh();
    } catch {
      setError("Network error — please try again.");
      setLoading(false);
    }
  }

  const nextQ = typeof window !== "undefined" ? window.location.search : "";

  return (
    <div className="mx-auto max-w-md py-10">
      <div className="card-surface p-6">
        <h1 className="text-xl font-extrabold text-white">
          {isRegister ? "Create your account" : "Sign in"}
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          {isRegister
            ? "Create a free account to post in the Forum."
            : "Sign in to post and manage your Forum listings."}
        </p>

        <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
          {isRegister && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-400">Display name</span>
              <input
                className="input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. RiftCollector"
                autoComplete="nickname"
                required
              />
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Email</span>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Password</span>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isRegister ? "new-password" : "current-password"}
              minLength={6}
              required
            />
          </label>

          {!isRegister && (
            <div className="-mt-1 text-right">
              <Link href="/forgot-password" className="text-xs text-brand-400 hover:underline">Forgot password?</Link>
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
          )}

          <button type="submit" className="btn-primary mt-1" disabled={loading}>
            {loading ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-400">
          {isRegister ? (
            <>
              Already have an account?{" "}
              <Link href={`/login${nextQ}`} className="text-brand-400 hover:underline">Sign in</Link>
            </>
          ) : (
            <>
              New here?{" "}
              <Link href={`/register${nextQ}`} className="text-brand-400 hover:underline">Create an account</Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
