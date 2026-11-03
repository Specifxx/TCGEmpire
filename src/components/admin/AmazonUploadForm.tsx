"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";

// /admin/earnings: upload an Amazon Associates Earnings report (lib/earnings/amazon.ts).
// Posts the file to /api/admin/earnings/amazon, then re-renders the page so the totals move.
export function AmazonUploadForm({
  stores,
  adminKey,
}: {
  stores: { key: string; label: string; from: string | null; to: string | null }[];
  adminKey: string | null;
}) {
  const router = useRouter();
  const [store, setStore] = useState(stores[0]?.key ?? "au");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

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

  return (
    <div className="mt-3 space-y-3">
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
      <ul className="divide-y divide-ink-800 rounded-xl border border-ink-700 text-sm">
        {stores.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="text-slate-300">{s.label}</span>
            <span className="text-xs text-slate-400">{s.to ? `${s.from} to ${s.to}` : "No report yet"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
