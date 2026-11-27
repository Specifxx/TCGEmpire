"use client";

import { useState } from "react";

type Counts = Record<string, { pending?: number; [k: string]: unknown }> | undefined;
interface Batch { ok: boolean; error?: string; site: string | null; granted: number; failed: number; remaining: number; emails: string[]; subject?: string; html?: string; text?: string }

export function GiftPassConsole({ sites, adminKey }: { sites: string[]; adminKey: string | null }) {
  const [site, setSite] = useState(sites[0] ?? "rift");
  const [limit, setLimit] = useState(450);
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState<Counts>();
  const [pending, setPending] = useState<number | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [note, setNote] = useState("");

  async function call(action: "preview" | "grant") {
    setBusy(true);
    setNote("");
    try {
      const res = await fetch("/api/admin/premium-gift-pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, site, limit, ...(adminKey ? { key: adminKey } : {}) }),
      });
      const j = await res.json();
      if (action === "preview") {
        setCounts(j.bySite);
        setPending(typeof j.pending === "number" ? j.pending : null);
      } else {
        setBatch(j);
        if (!j.ok) setNote(j.error ?? "failed");
      }
    } catch {
      setNote("request failed");
    } finally {
      setBusy(false);
    }
  }

  async function copyHtml() {
    if (!batch?.html) return;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "text/html": new Blob([batch.html], { type: "text/html" }), "text/plain": new Blob([batch.text ?? ""], { type: "text/plain" }) }),
      ]);
      setNote("Email copied: paste it into the Gmail body.");
    } catch {
      setNote("Copy failed: select the preview and copy it by hand.");
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">Site<br />
          <select id="gp-site" value={site} onChange={(e) => { setSite(e.target.value); setBatch(null); }} className="rounded border px-2 py-1 text-black">
            {sites.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="text-sm">Batch size<br />
          <input id="gp-limit" type="number" min={1} max={450} value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="w-24 rounded border px-2 py-1 text-black" />
        </label>
        <button id="gp-preview" disabled={busy} onClick={() => call("preview")} className="rounded border px-3 py-1.5">Count pending</button>
        <button id="gp-grant" disabled={busy} onClick={() => call("grant")} className="rounded bg-green-600 px-3 py-1.5 font-semibold text-white">Grant batch</button>
      </div>
      {pending !== null && <p id="gp-pending" className="text-sm">Pending for {site}: {pending}</p>}
      {counts && <pre id="gp-counts" className="max-h-60 overflow-auto rounded border p-2 text-xs">{JSON.stringify(counts, null, 1)}</pre>}
      {note && <p id="gp-note" className="text-sm font-semibold">{note}</p>}
      {batch?.ok && (
        <div className="space-y-3">
          <p id="gp-result" className="text-sm">Granted {batch.granted} on {batch.site} (failed {batch.failed}, still pending {batch.remaining}).</p>
          <label className="block text-sm">BCC ({batch.emails.length})
            <textarea id="gp-emails" readOnly value={batch.emails.join(", ")} className="mt-1 h-32 w-full rounded border p-2 text-xs text-black" />
          </label>
          <label className="block text-sm">Subject
            <input id="gp-subject" readOnly value={batch.subject ?? ""} className="mt-1 w-full rounded border p-2 text-sm text-black" />
          </label>
          <button id="gp-copy" onClick={copyHtml} className="rounded border px-3 py-1.5">Copy email body</button>
          <textarea id="gp-html" readOnly value={batch.html ?? ""} className="hidden" />
          <iframe title="Email preview" srcDoc={batch.html} className="h-[900px] w-full rounded border bg-white" />
        </div>
      )}
    </div>
  );
}
