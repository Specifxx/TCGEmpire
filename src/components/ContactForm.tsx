"use client";

import { useState } from "react";

type State = { kind: "idle" | "loading" | "ok" } | { kind: "error"; msg: string };

const inputCls =
  "input w-full text-base sm:text-sm";

// The /contact form → /api/contact → ContactMessage → /admin/messages.
export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind === "loading") return;
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message, website }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({ kind: "error", msg: data?.error ?? "Something went wrong — please try again." });
        return;
      }
      setState({ kind: "ok" });
    } catch {
      setState({ kind: "error", msg: "Network error — please try again." });
    }
  }

  if (state.kind === "ok") {
    return (
      <div role="status" className="rounded-xl border border-brand-500/40 bg-brand-500/10 p-6 text-center">
        <p className="font-bold text-brand-200">Thanks — message received.</p>
        <p className="mt-1 text-sm text-slate-300">We&apos;ll reply to {email}, usually within a day or two.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 text-left">
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-slate-200">Name</span>
        <input required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={inputCls} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-slate-200">Email</span>
        <input
          required
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={200}
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-slate-200">
          Subject <span className="font-normal text-slate-500">— optional</span>
        </span>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} className={inputCls} />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-slate-200">Message</span>
        <textarea
          required
          rows={5}
          minLength={10}
          maxLength={4000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={`${inputCls} resize-y`}
        />
      </label>
      {/* Honeypot — display:none (never autofilled), same as the wrong-price form. */}
      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />
      {state.kind === "error" && (
        <p role="alert" className="text-sm text-red-400">
          {state.msg}
        </p>
      )}
      <button type="submit" disabled={state.kind === "loading"} className="btn-primary w-full">
        {state.kind === "loading" ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
