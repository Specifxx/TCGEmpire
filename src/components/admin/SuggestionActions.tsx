"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Approve/reject/delete buttons for one store suggestion. Sends the admin key (from
// the page's ?key= param, when that's how you're authed) so the mutation passes the
// same gate as the page.
export function SuggestionActions({ id, status, adminKey }: { id: string; status: string; adminKey: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(action: "added" | "rejected" | "pending" | "delete") {
    if (busy) return;
    if (action === "delete" && !confirm("Delete this suggestion permanently?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/store-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, key: adminKey }),
      });
      if (res.ok) router.refresh();
      else alert("Action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {status !== "added" && (
        <BtnAction onClick={() => act("added")} disabled={busy} className="border-brand-500/50 text-brand-300 hover:bg-brand-500/10">
          ✓ Mark added
        </BtnAction>
      )}
      {status !== "rejected" && (
        <BtnAction onClick={() => act("rejected")} disabled={busy} className="border-ink-600 text-slate-400 hover:bg-ink-800">
          ✕ Reject
        </BtnAction>
      )}
      {status !== "pending" && (
        <BtnAction onClick={() => act("pending")} disabled={busy} className="border-ink-600 text-slate-400 hover:bg-ink-800">
          ↺ Reopen
        </BtnAction>
      )}
      <BtnAction onClick={() => act("delete")} disabled={busy} className="border-red-500/40 text-red-300 hover:bg-red-500/10">
        🗑
      </BtnAction>
    </div>
  );
}

function BtnAction({
  onClick,
  disabled,
  className,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border px-2 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}
