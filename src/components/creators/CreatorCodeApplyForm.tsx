"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { AFFILIATE_PLATFORMS, normaliseAffiliateCode } from "@/lib/creator-affiliate-code";

// The creator code application on /creators/apply (2026-10-16). Posts to
// /api/creator-codes/apply, which saves an AffiliateApplication for
// /admin/affiliates and emails the owner.

type State = { kind: "idle" | "loading" | "ok" } | { kind: "error"; msg: string };
const inputCls = "input w-full text-base sm:text-sm";

export function CreatorCodeApplyForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [platform, setPlatform] = useState<string>("YouTube");
  const [channelUrl, setChannelUrl] = useState("");
  const [audience, setAudience] = useState("");
  const [preferredCode, setPreferredCode] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [state, setState] = useState<State>({ kind: "idle" });
  const preview = normaliseAffiliateCode(preferredCode);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind === "loading") return;
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/creator-codes/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, platform, channelUrl, audience, preferredCode, message, website }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setState({ kind: "error", msg: data.error ?? "Something went wrong. Please try again." });
        return;
      }
      trackEvent("creator_code_apply", { platform });
      setState({ kind: "ok" });
    } catch {
      setState({ kind: "error", msg: "Network error. Please try again." });
    }
  }

  if (state.kind === "ok") {
    return (
      <div role="status" className="rounded-2xl border border-brand-500/40 bg-brand-500/10 p-6 text-center">
        <p className="text-lg font-extrabold text-brand-200">Application received ✨</p>
        <p className="mt-1 text-sm text-slate-300">
          We&apos;ll look at your channel and email {email} with your code, usually within a couple of days.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-3 text-left sm:grid-cols-2">
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-slate-200">Your name or creator name</span>
        <input required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={inputCls} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-slate-200">Email (for your code and payouts)</span>
        <input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} className={inputCls} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-slate-200">Main platform</span>
        <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={inputCls}>
          {AFFILIATE_PLATFORMS.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-slate-200">Link to your channel</span>
        <input required type="url" placeholder="https://" value={channelUrl} onChange={(e) => setChannelUrl(e.target.value)} maxLength={300} className={inputCls} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-slate-200">
          Audience size <span className="font-normal text-slate-500">(optional)</span>
        </span>
        <input placeholder="e.g. 4k followers" value={audience} onChange={(e) => setAudience(e.target.value)} maxLength={80} className={inputCls} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-slate-200">
          The code you&apos;d like <span className="font-normal text-slate-500">(optional)</span>
        </span>
        <input placeholder="e.g. YOURNAME" value={preferredCode} onChange={(e) => setPreferredCode(e.target.value)} maxLength={40} className={`${inputCls} uppercase`} />
        {preferredCode && (
          <span className="mt-1 block text-xs text-slate-500">
            {preview ? <>Your viewers would type <strong className="text-slate-300">{preview}</strong></> : "3 to 20 letters or numbers"}
          </span>
        )}
      </label>
      <label className="block sm:col-span-2">
        <span className="mb-1 block text-sm font-semibold text-slate-200">
          Anything else? <span className="font-normal text-slate-500">(optional)</span>
        </span>
        <textarea
          rows={3}
          maxLength={1000}
          placeholder="What you make, and how you'd share the code"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={inputCls}
        />
      </label>
      {/* Honeypot: hidden from people, filled by bots. */}
      <input tabIndex={-1} autoComplete="off" aria-hidden value={website} onChange={(e) => setWebsite(e.target.value)} name="website" className="hidden" />
      <div className="sm:col-span-2">
        {state.kind === "error" && (
          <p role="alert" className="mb-2 text-sm text-red-300">
            {state.msg}
          </p>
        )}
        <button
          type="submit"
          disabled={state.kind === "loading"}
          className="min-h-11 w-full rounded-xl bg-gradient-to-r from-brand-500 to-emerald-400 px-5 text-sm font-extrabold text-ink-950 shadow-md shadow-brand-500/20 transition-transform hover:scale-[1.01] disabled:opacity-60 sm:w-auto"
        >
          {state.kind === "loading" ? "Sending…" : "Apply for my code →"}
        </button>
      </div>
    </form>
  );
}
