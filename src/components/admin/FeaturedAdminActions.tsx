"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function FeaturedAdminActions({ id, adminKey }: { id: string; adminKey: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function act(action: "remove" | "recheck") {
    setBusy(true);
    await fetch("/api/admin/featured", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, key: adminKey || undefined }),
    }).catch(() => {});
    setBusy(false);
    router.refresh();
  }
  return (
    <span className="flex gap-2">
      <button type="button" disabled={busy} onClick={() => act("recheck")} className="text-xs text-slate-400 hover:text-white">
        Recheck
      </button>
      <button type="button" disabled={busy} onClick={() => act("remove")} className="text-xs text-rose-400 hover:text-rose-300">
        Remove
      </button>
    </span>
  );
}
