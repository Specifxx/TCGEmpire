"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";

// Only allow same-site relative redirects (no open-redirect to external URLs).
function safeNext(): string {
  if (typeof window === "undefined") return "/";
  const n = new URLSearchParams(window.location.search).get("next");
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/profile";
}

const OAUTH_ERRORS: Record<string, string> = {
  provider_unavailable: "That sign-in option isn't available yet — try email, or another option.",
  oauth_state: "Sign-in expired or was interrupted. Please try again.",
  oauth_token: "Couldn't complete sign-in with that provider. Please try again.",
  oauth_profile: "Couldn't read your profile from that provider. Please try again.",
  oauth_noemail: "That provider didn't share an email address, which we need to create your account.",
};

export function AuthForm({
  mode,
  providers,
  bare = false,
}: {
  mode: "login" | "register";
  providers: ("google" | "discord")[];
  // Skip the outer full-page wrapper (max-width + vertical padding) so this can be
  // embedded directly inside a modal, which provides its own sizing. The full pages
  // (/login, /register) omit this and get the original standalone layout.
  bare?: boolean;
}) {
  const router = useRouter();
  const isRegister = mode === "register";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false); // show "check your email" after signup
  const [needsVerify, setNeedsVerify] = useState(false); // login blocked: email not verified
  const [resendMsg, setResendMsg] = useState<string | null>(null);

  // Surface OAuth failures redirected back as ?error=…
  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get("error");
    if (e) setError(OAUTH_ERRORS[e] ?? "Sign-in failed — please try again.");
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNeedsVerify(false);
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
        if (data.needsVerify) setNeedsVerify(true); // login: unverified email
        setLoading(false);
        return;
      }
      // New accounts must verify their email before they can sign in.
      if (isRegister) {
        setRegistered(true);
        setLoading(false);
        return;
      }
      router.push(safeNext());
      router.refresh();
    } catch {
      setError("Network error — please try again.");
      setLoading(false);
    }
  }

  async function resendVerification() {
    setResendMsg(null);
    try {
      const res = await fetch("/api/auth/resend-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setResendMsg(
        res.ok ? "Verification email sent — check your inbox (and spam)." : "Couldn't resend right now — try again shortly.",
      );
    } catch {
      setResendMsg("Network error — try again.");
    }
  }

  const nextQ = typeof window !== "undefined" ? window.location.search.replace(/[?&]error=[^&]*/g, "").replace(/^&/, "?") : "";
  const wrapperClass = bare ? "" : "mx-auto max-w-md py-10";

  // After signup: the account exists but can't sign in until the email is verified.
  if (registered) {
    return (
      <div className={wrapperClass}>
        <div className="card-surface p-6 text-center">
          <h1 className="text-xl font-extrabold text-white">Check your email</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            We&apos;ve sent a verification link to <span className="font-medium text-slate-200">{email}</span>. Click it
            to activate your account, then sign in.
          </p>
          <button onClick={resendVerification} className="btn-ghost mt-4 text-sm">Resend verification email</button>
          {resendMsg && <p className="mt-2 text-xs text-slate-400">{resendMsg}</p>}
          <p className="mt-4 text-sm">
            <Link href={`/login${nextQ}`} className="text-brand-400 hover:underline">Go to sign in →</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      <div className="card-surface p-6">
        <h1 className="text-xl font-extrabold text-white">{isRegister ? "Create your account" : "Sign in"}</h1>
        <p className="mt-1 text-sm text-slate-400">
          {isRegister
            ? "Create a free account to save your wishlist and more."
            : "Sign in to sync your wishlist and manage your listings."}
        </p>

        {/* OAuth — only render a provider's button when its env keys are configured,
            so we never show a button that just redirects back with an error. */}
        {providers.length > 0 && (
          <>
            <div className="mt-5 flex flex-col gap-2.5">
              {providers.includes("google") && (
                <a href="/api/auth/oauth/google" className="flex items-center justify-center gap-2.5 rounded-xl border border-ink-600 bg-white py-2.5 text-sm font-semibold text-ink-950 hover:brightness-95">
                  <GoogleIcon /> Continue with Google
                </a>
              )}
              {providers.includes("discord") && (
                <a href="/api/auth/oauth/discord" className="flex items-center justify-center gap-2.5 rounded-xl bg-[#5865F2] py-2.5 text-sm font-semibold text-white hover:brightness-110">
                  <DiscordIcon /> Continue with Discord
                </a>
              )}
            </div>

            <div className="my-5 flex items-center gap-3 text-xs text-slate-500">
              <span className="h-px flex-1 bg-ink-700" /> or with email <span className="h-px flex-1 bg-ink-700" />
            </div>
          </>
        )}

        <form onSubmit={submit} className="flex flex-col gap-3">
          {isRegister && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-400">Display name</span>
              <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. RiftCollector" autoComplete="nickname" required />
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-400">Email</span>
            <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </label>
          <label className="block">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Password</span>
              {!isRegister && (
                <Link href="/forgot" className="text-xs text-brand-400 hover:underline">Forgot password?</Link>
              )}
            </div>
            <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isRegister ? "new-password" : "current-password"} minLength={6} required />
          </label>

          {error && <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
          {needsVerify && (
            <p className="text-xs text-slate-400">
              <button type="button" onClick={resendVerification} className="font-medium text-brand-400 hover:underline">
                Resend verification email
              </button>
              {resendMsg && <span className="ml-2">{resendMsg}</span>}
            </p>
          )}

          <button type="submit" className="btn-primary mt-1" disabled={loading}>
            {loading ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-400">
          {isRegister ? (
            <>Already have an account? <Link href={`/login${nextQ}`} className="text-brand-400 hover:underline">Sign in</Link></>
          ) : (
            <>New here? <Link href={`/register${nextQ}`} className="text-brand-400 hover:underline">Create an account</Link></>
          )}
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.4 5.4 2.6 13.3l7.8 6.1C12.2 13.2 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.4 5.7C43.9 38 46.5 31.8 46.5 24.5z" />
      <path fill="#FBBC05" d="M10.4 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.8-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.7l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.2 0 11.5-2 15.3-5.5l-7.4-5.7c-2 1.4-4.7 2.3-7.9 2.3-6.4 0-11.8-3.7-13.6-8.9l-7.8 6.1C6.4 42.6 14.6 48 24 48z" />
    </svg>
  );
}
function DiscordIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.2.4a18 18 0 0 1 4.3 1.4 16.7 16.7 0 0 0-14.8 0A18 18 0 0 1 9 3.4L8.7 3a19.8 19.8 0 0 0-5 1.4A20.6 20.6 0 0 0 .2 18.4 19.9 19.9 0 0 0 6.3 21l.4-.6a13 13 0 0 1-2-1l.5-.4a14 14 0 0 0 12 0l.5.4c-.6.4-1.3.7-2 1l.4.6a19.9 19.9 0 0 0 6-2.6 20.6 20.6 0 0 0-3.5-14zM8.4 15.3c-1 0-1.7-.9-1.7-2s.8-2 1.7-2 1.7.9 1.7 2-.8 2-1.7 2zm7.2 0c-1 0-1.7-.9-1.7-2s.8-2 1.7-2 1.7.9 1.7 2-.7 2-1.7 2z" />
    </svg>
  );
}
