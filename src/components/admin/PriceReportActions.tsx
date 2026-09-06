"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { REPORT_STATUSES } from "@/lib/price-report";

// Triage buttons for one wrong-price report. Mirrors FeedbackActions: sends the
// admin key (when that's how you're authed) so the mutation passes the same gate
// as the page itself.
//
// The current status is rendered as a disabled button rather than hidden, so the
// row always shows the full set of choices and where it currently sits among
// them — a queue where the options move around as you triage is a queue you
// misclick.
const LABEL: Record<string, string> = {
  NEW: "Reopen",
  CONFIRMED: "Confirm",
  REJECTED: "Reject",
  FIXED: "Fixed",
};

export function PriceReportActions({ id, status, adminKey }: { id: string; status: string; adminKey: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function act(action: string) {
    if (busy) return;
    if (action === "delete" && !confirm("Delete this report permanently?")) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/price-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, key: adminKey }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        setErr(d?.error ?? "Action failed.");
      }
    } catch {
      setErr("Action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {REPORT_STATUSES.map((s) => (
        <button
          key={s}
          type="button"
          disabled={busy || s === status}
          onClick={() => act(s)}
          className="btn-ghost px-2 py-1 text-[11px] disabled:opacity-40"
        >
          {LABEL[s] ?? s}
        </button>
      ))}
      <button
        type="button"
        disabled={busy}
        onClick={() => act("delete")}
        className="btn-ghost px-2 py-1 text-[11px] text-red-400 disabled:opacity-40"
      >
        Delete
      </button>
      {err && <span className="text-[11px] text-red-400">{err}</span>}
    </div>
  );
}
