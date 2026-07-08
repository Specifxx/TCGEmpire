"use client";

import { useState } from "react";

type State = { kind: "idle" | "loading" | "ok" | "already" | "error"; msg?: string };

const MARKETS: { value: string; label: string }[] = [
  { value: "AU", label: "🇦🇺 Australia" },
  { value: "NZ", label: "🇳🇿 New Zealand" },
  { value: "US", label: "🇺🇸 United States" },
  { value: "UK", label: "🇬🇧 United Kingdom" },
  { value: "OTHER", label: "🌐 Other" },
];

export function SuggestStoreForm() {
  const [storeName, setStoreName] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const [country, setCountry] = useState("AU");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind === "loading") return;
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/stores/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeName, storeUrl, country, email, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({ kind: "error", msg: data?.error ?? "Something went wrong — please try again." });
        return;
      }
      setState({ kind: data.already ? "already" : "ok", msg: data.message });
    } catch {
      setState({ kind: "error", msg: "Network error — please try again." });
    }
  }

  if (state.kind === "ok" || state.kind === "already") {
    return (
      <div className="rounded-2xl border border-brand-500/40 bg-brand-500/10 p-8 text-center shadow-[0_0_30px_rgba(52,209,126,0.12)]">
        <div className="text-3xl">{state.kind === "already" ? "✅" : "🎉"}</div>
        <h2 className="mt-3 text-lg font-bold text-brand-200">
          {state.kind === "already" ? "We already track that store!" : "Thanks — got it!"}
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-300">
          {state.msg ??
            "We'll review the store and add it to the comparison, usually within a few days. If it's a Shopify store, it'll start showing live prices automatically once it's in."}
        </p>
        <button
          onClick={() => {
            setStoreName("");
            setStoreUrl("");
            setEmail("");
            setNote("");
            setState({ kind: "idle" });
          }}
          className="btn-ghost mt-5 text-sm"
        >
          Suggest another store
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Store name" required>
        <input
          required
          value={storeName}
          onChange={(e) => setStoreName(e.target.value)}
          placeholder="e.g. Dragon's Den Games"
          className={inputCls}
        />
      </Field>

      <Field label="Store website" required hint="A link to the shop (the homepage is fine).">
        <input
          required
          value={storeUrl}
          onChange={(e) => setStoreUrl(e.target.value)}
          placeholder="dragonsdengames.com.au"
          inputMode="url"
          className={inputCls}
        />
      </Field>

      <Field label="Market">
        <select value={country} onChange={(e) => setCountry(e.target.value)} className={inputCls}>
          {MARKETS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Your email" hint="Optional — only if you'd like us to reply.">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          inputMode="email"
          className={inputCls}
        />
      </Field>

      <Field label="Anything else?" hint="Optional — e.g. the direct link to their Riftbound singles.">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Their Riftbound singles collection is at /collections/riftbound…"
          className={`${inputCls} resize-y`}
        />
      </Field>

      {state.kind === "error" && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{state.msg}</p>
      )}

      <button type="submit" disabled={state.kind === "loading"} className="btn-primary w-full justify-center">
        {state.kind === "loading" ? "Submitting…" : "Submit store →"}
      </button>
      <p className="text-center text-xs text-slate-500">
        We manually review every store before it goes live. No spam — we only add real Riftbound sellers.
      </p>
    </form>
  );
}

const inputCls =
  "w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500/40";

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-slate-200">
        {label}
        {required && <span className="text-brand-400">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}
