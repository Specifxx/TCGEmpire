"use client";

import { useState } from "react";
import { trackEvent } from "@/lib/analytics";

// "Get featured" on /creators. Posts to the existing /api/contact route (saved to
// ContactMessage, shown in /admin/messages, emailed to the owner by
// notifyOwnerBounded), with a "Creator application" subject so it stands out in
// the inbox. No new table: an application is a message to a person, who replies.

type State = { kind: "idle" | "loading" | "ok" } | { kind: "error"; msg: string };

const PLATFORMS = ["YouTube", "TikTok", "Twitch", "Instagram", "X", "Other"] as const;
const inputCls = "input w-full text-base sm:text-sm";

export function CreatorApplyForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]>("YouTube");
  const [channel, setChannel] = useState("");
  const [audience, setAudience] = useState("");
  const [tip, setTip] = useState("");
  const [note, setNote] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind === "loading") return;
    setState({ kind: "loading" });
    const message = [
      `Creator application`,
      `Main platform: ${platform}`,
      `Channel: ${channel}`,
      audience ? `Audience: ${audience}` : null,
      tip ? `Tip page ("Buy them a pack"): ${tip}` : null,
      note ? `\n${note}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject: `Creator application: ${name} (${platform})`, message, website }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({ kind: "error", msg: data?.error ?? "Something went wrong. Please try again." });
        return;
      }
      trackEvent("creator_apply", { platform });
      setState({ kind: "ok" });
    } catch {
      setState({ kind: "error", msg: "Network error. Please try again." });
    }
  }

  if (state.kind === "ok") {
    return (
      <div role="status" className="rounded-2xl border border-brand-500/40 bg-brand-500/10 p-6 text-center">
        <p className="text-lg font-extrabold text-brand-200">Thank you! ✨</p>
        <p className="mt-1 text-sm text-slate-300">
          A real person will look at your channel and reply to {email}, usually within a couple of days.
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
        <span className="mb-1 block text-sm font-semibold text-slate-200">Email</span>
        <input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} className={inputCls} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-slate-200">Main platform</span>
        <select value={platform} onChange={(e) => setPlatform(e.target.value as (typeof PLATFORMS)[number])} className={inputCls}>
          {PLATFORMS.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-slate-200">Link to your channel</span>
        <input required type="url" placeholder="https://" value={channel} onChange={(e) => setChannel(e.target.value)} maxLength={300} className={inputCls} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-slate-200">
          Audience size <span className="font-normal text-slate-500">(optional)</span>
        </span>
        <input placeholder="e.g. 4k followers" value={audience} onChange={(e) => setAudience(e.target.value)} maxLength={80} className={inputCls} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-slate-200">
          Tip page <span className="font-normal text-slate-500">(Ko-fi, Patreon… optional)</span>
        </span>
        <input type="url" placeholder="https://ko-fi.com/…" value={tip} onChange={(e) => setTip(e.target.value)} maxLength={300} className={inputCls} />
      </label>
      <label className="block sm:col-span-2">
        <span className="mb-1 block text-sm font-semibold text-slate-200">What do you make?</span>
        <textarea
          required
          rows={4}
          minLength={10}
          maxLength={2000}
          placeholder="Deck techs, pack openings, tournament coverage, lore…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={inputCls}
        />
      </label>
      {/* Honeypot: hidden from people, filled by bots. */}
      <input
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        name="website"
        className="hidden"
      />
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
          {state.kind === "loading" ? "Sending…" : "Apply to be featured →"}
        </button>
      </div>
    </form>
  );
}
