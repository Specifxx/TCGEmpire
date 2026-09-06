"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Moderation buttons for one feedback row. Mirrors SuggestionActions: sends the
// admin key (when that's how you're authed) so the mutation passes the same gate
// as the page itself.
export function FeedbackActions({
  id,
  status,
  consentPublic,
  adminKey,
}: {
  id: string;
  status: string;
  consentPublic: boolean;
  adminKey: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function act(action: "approve" | "hide" | "spam" | "reopen" | "delete") {
    if (busy) return;
    if (action === "delete" && !confirm("Delete this feedback permanently?")) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/feedback", {
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
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-1.5">
        {/* Approve is only offered when the submitter actually consented. The
            server enforces this too — this just avoids showing a button that
            is guaranteed to fail. */}
        {status !== "APPROVED" && consentPublic && (
          <Btn onClick={() => act("approve")} disabled={busy} className="border-brand-500/50 text-brand-300 hover:bg-brand-500/10">
            ✓ Publish as review
          </Btn>
        )}
        {status === "APPROVED" && (
          <Btn onClick={() => act("hide")} disabled={busy} className="border-ink-600 text-slate-400 hover:bg-ink-800">
            ↩ Unpublish
          </Btn>
        )}
        {status !== "HIDDEN" && status !== "APPROVED" && (
          <Btn onClick={() => act("hide")} disabled={busy} className="border-ink-600 text-slate-400 hover:bg-ink-800">
            Archive
          </Btn>
        )}
        {status !== "SPAM" && (
          <Btn onClick={() => act("spam")} disabled={busy} className="border-ink-600 text-slate-500 hover:bg-ink-800">
            Spam
          </Btn>
        )}
        {status !== "NEW" && (
          <Btn onClick={() => act("reopen")} disabled={busy} className="border-ink-600 text-slate-400 hover:bg-ink-800">
            ↺ Reopen
          </Btn>
        )}
        <Btn onClick={() => act("delete")} disabled={busy} className="border-red-500/40 text-red-400 hover:bg-red-500/10">
          Delete
        </Btn>
      </div>
      {err && <p className="mt-1.5 text-xs text-red-400">{err}</p>}
    </div>
  );
}

function Btn({
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
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}
