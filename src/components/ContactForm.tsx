"use client";

import { useState } from "react";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message, website }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        setStatus("error");
        return;
      }
      setStatus("sent");
      setName(""); setEmail(""); setSubject(""); setMessage("");
    } catch {
      setError("Network error — please try again");
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="card-surface p-8 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-brand-500/20 text-2xl text-brand-400">✓</div>
        <h3 className="text-lg font-bold text-white">Thanks for your feedback!</h3>
        <p className="mt-1 text-sm text-slate-400">We&apos;ve received your message and will read it shortly.</p>
        <button onClick={() => setStatus("idle")} className="btn-ghost mt-4">Send another</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card-surface flex flex-col gap-4 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-400">Your name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-400">Your email</span>
          <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-400">Subject (optional)</span>
        <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Missing store, wrong price, feature idea…" maxLength={160} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-slate-400">Message</span>
        <textarea className="input" rows={6} value={message} onChange={(e) => setMessage(e.target.value)} required minLength={5} maxLength={5000} placeholder="Tell us what you think, report a bug, or suggest a store to add." />
      </label>

      {/* Honeypot: hidden from humans */}
      <input type="text" value={website} onChange={(e) => setWebsite(e.target.value)} className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />

      {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

      <button type="submit" className="btn-primary" disabled={status === "sending"}>
        {status === "sending" ? "Sending…" : "Send feedback"}
      </button>
    </form>
  );
}
