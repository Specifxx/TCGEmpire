"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Reply and Delete for one contact message on /admin/messages. Sends the admin
// key when that is how the page was opened, like FeedbackActions.
export function MessageActions({ id, replyHref, adminKey }: { id: string; replyHref: string; adminKey: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function remove() {
    if (busy || !confirm("Delete this message permanently?")) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "delete", key: adminKey }),
      });
      if (res.ok) router.refresh();
      else setErr(((await res.json().catch(() => ({}))) as { error?: string })?.error ?? "Delete failed.");
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <a href={replyHref} className="text-xs font-medium text-brand-400 hover:underline">
        Reply →
      </a>
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        className="rounded-md border border-red-500/40 px-2 py-1 text-xs font-medium text-red-300 hover:bg-red-500/10 disabled:opacity-50"
      >
        {busy ? "Deleting…" : "Delete"}
      </button>
      {err && <span className="text-xs text-red-300">{err}</span>}
    </div>
  );
}
