"use client";

import { useState } from "react";

const CATEGORIES: { key: string; label: string }[] = [
  { key: "ORDER", label: "Order problem" },
  { key: "PAYMENT", label: "Payment / billing" },
  { key: "ACCOUNT", label: "Account" },
  { key: "SELLER", label: "Selling on RiftCompare" },
  { key: "OTHER", label: "Something else" },
];

export interface SupportOrderOption {
  id: string;
  label: string; // e.g. "RC-100004 — Ionia, Ambition's Ideal"
}

export function SupportForm({
  defaultName,
  defaultEmail,
  defaultCategory,
  defaultSubject,
  orders = [],
}: {
  defaultName?: string;
  defaultEmail?: string;
  defaultCategory?: string;
  defaultSubject?: string;
  orders?: SupportOrderOption[];
}) {
  const [name, setName] = useState(defaultName ?? "");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [category, setCategory] = useState(CATEGORIES.some((c) => c.key === defaultCategory) ? defaultCategory! : "OTHER");
  const [orderId, setOrderId] = useState("");
  const [subject, setSubject] = useState(defaultSubject ?? "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, category, subject, message, orderId: orderId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ ok: false, text: data.error ?? "Couldn't send your message — try again shortly." });
      } else {
        setResult({ ok: true, text: `Sent — your ticket is ${data.ticket}. We'll reply by email.` });
        setSubject("");
        setMessage("");
      }
    } catch {
      setResult({ ok: false, text: "Network error — try again." });
    } finally {
      setBusy(false);
    }
  }

  if (result?.ok) {
    return (
      <div className="card-surface p-6 text-center">
        <p className="text-lg font-bold text-brand-300">✓ {result.text}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card-surface flex flex-col gap-3 p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-slate-400">Your name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} className="input" />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-400">Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={200} className="input" />
        </label>
      </div>

      <label className="text-sm">
        <span className="mb-1 block text-slate-400">What's this about?</span>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="input">
          {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </label>

      {orders.length > 0 && (
        <label className="text-sm">
          <span className="mb-1 block text-slate-400">Related order (optional)</span>
          <select value={orderId} onChange={(e) => setOrderId(e.target.value)} className="input">
            <option value="">— none —</option>
            {orders.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </label>
      )}

      <label className="text-sm">
        <span className="mb-1 block text-slate-400">Subject</span>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} required maxLength={150} className="input" />
      </label>

      <label className="text-sm">
        <span className="mb-1 block text-slate-400">Message</span>
        <textarea value={message} onChange={(e) => setMessage(e.target.value.slice(0, 4000))} required minLength={10} rows={6} className="input resize-none" />
      </label>

      {result && !result.ok && <p className="text-sm text-rose-300">{result.text}</p>}

      <button type="submit" disabled={busy} className="btn-primary self-start disabled:opacity-50">
        {busy ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
