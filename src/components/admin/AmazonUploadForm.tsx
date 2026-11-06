"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";

// /admin/earnings: Amazon Associates figures (lib/earnings/amazon.ts). The "Amazon
// figures" box takes what Claude in Chrome read on each store's Reports page
// (owner, 2026-11-06: no downloads, no uploads) and posts it to
// /api/admin/earnings/amazon/entry; the report upload below it stays as the
// by-hand fallback (/api/admin/earnings/amazon). Both re-render the page so the
// totals move.
export function AmazonUploadForm({
  stores,
  prompt,
  adminKey,
}: {
  stores: { key: string; label: string; from: string | null; to: string | null }[];
  /** The Chrome prompt for this run, with each store's dates filled in (lib/earnings/amazon.ts). */
  prompt: string;
  adminKey: string | null;
}) {
  const router = useRouter();
  const [store, setStore] = useState(stores[0]?.key ?? "au");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const promptHref = `data:text/plain;charset=utf-8,${encodeURIComponent(prompt)}`;

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const body = new FormData();
      body.set("store", store);
      body.set("file", file);
      if (adminKey) body.set("key", adminKey);
      const r = await fetch("/api/admin/earnings/amazon", { method: "POST", body });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d.error ?? "Couldn't read that report.");
        return;
      }
      setDone(
        `${stores.find((s) => s.key === d.store)?.label ?? d.store}: ${d.from} to ${d.to}, ${formatMoney(d.cents, d.currency)} from ${d.items} items across ${d.trackingIds} tracking IDs.`,
      );
      setFile(null);
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!text.trim()) return;
    setSaving(true);
    setSaveError(null);
    setSaved(null);
    try {
      const r = await fetch("/api/admin/earnings/amazon/entry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(adminKey ? { text, key: adminKey } : { text }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setSaveError(d.error ?? "Couldn't read those figures.");
        return;
      }
      const parts = (d.saved as { store: string; from: string; to: string; cents: number; currency: string; items: number; trackingIds: number }[]).map(
        (x) => `${stores.find((s) => s.key === x.store)?.label ?? x.store}: ${x.from} to ${x.to}, ${formatMoney(x.cents, x.currency)} from ${x.items} items across ${x.trackingIds} tracking IDs`,
      );
      setSaved(`Saved. ${parts.join(". ")}.`);
      setText("");
      router.refresh();
    } catch {
      setSaveError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2" data-amazon-prompt>
        <a href={promptHref} download="amazon-earnings-upload-prompt.md" className="btn-primary min-h-10 px-4 text-sm">
          Download Chrome prompt
        </a>
        <button
          type="button"
          className="min-h-10 rounded-lg border border-ink-700 px-3 text-sm text-slate-200 hover:bg-ink-800"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(prompt);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              setError("Couldn't copy; download it instead.");
            }
          }}
        >
          {copied ? "Copied" : "Copy prompt"}
        </button>
        <span className="text-xs text-slate-500">Paste it into Claude in Chrome: it reads each store&apos;s Reports page and types the figures into the box below.</span>
      </div>
      <form
        className="card-surface space-y-2 rounded-xl border border-ink-700 p-3 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Amazon figures
          <textarea
            name="amazon-figures"
            aria-label="Amazon figures"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            spellCheck={false}
            placeholder={"store: au\nrange: 2026-10-21 to 2026-11-06\nday 2026-10-21 3.40 2\nday 2026-10-22 0 0\nid riftcompare-22 20.10 7\nid compareempire-22 1.05 1"}
            className="w-full rounded-lg border border-ink-700 bg-ink-900 px-2 py-1.5 font-mono text-sm text-white"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={saving || !text.trim()} className="btn-primary min-h-10 px-4 text-sm disabled:opacity-60">
            {saving ? "Saving…" : "Save figures"}
          </button>
          <span className="text-xs text-slate-500">
            One block per store: <code>store:</code>, <code>range:</code>, a <code>day</code> line per day (date, earnings, items shipped) and an <code>id</code> line per tracking ID (its earnings and items over the range). Saving replaces the store&apos;s range.
          </span>
        </div>
        {saveError && <p role="alert" className="text-sm text-rose-400">{saveError}</p>}
        {saved && <p className="text-sm text-up">{saved}</p>}
      </form>
      <details className="text-sm text-slate-400">
        <summary className="cursor-pointer">Or upload a downloaded Earnings report (ZIP or CSV)</summary>
      <form
        className="card-surface flex flex-wrap items-end gap-2 rounded-xl border border-ink-700 p-3 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          void upload();
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Amazon store
          <select value={store} onChange={(e) => setStore(e.target.value)} className="rounded-lg border border-ink-700 bg-ink-900 px-2 py-1.5 text-sm text-white">
            {stores.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-slate-400">
          Earnings report (ZIP or CSV)
          <input
            type="file"
            accept=".zip,.csv,.tsv,.txt,application/zip,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            required
            className="text-sm text-slate-200 file:mr-2 file:rounded-lg file:border-0 file:bg-ink-800 file:px-3 file:py-1.5 file:text-slate-200"
          />
        </label>
        <button type="submit" disabled={busy || !file} className="btn-primary min-h-10 px-4 text-sm disabled:opacity-60">
          {busy ? "Reading…" : "Upload report"}
        </button>
      </form>
      {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
      {done && <p className="text-sm text-up">{done}</p>}
      </details>
      <ul className="divide-y divide-ink-800 rounded-xl border border-ink-700 text-sm">
        {stores.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="text-slate-300">{s.label}</span>
            <span className="text-xs text-slate-400">{s.to ? `Covered ${s.from} to ${s.to}; next run reads from the day after` : "Nothing yet; first run reads the last 90 days"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
