"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// The owner enters a month's all-site visitors (Vercel Analytics) and affiliate
// profit; every creator's payout for that month is computed from it.
export function CreatorMonthForm({ adminKey, defaultMonth }: { adminKey: string; defaultMonth: string }) {
  const router = useRouter();
  const [f, setF] = useState({ month: defaultMonth, totalVisitors: "", affiliateRevenue: "", sharePct: "25", currency: "AUD" });
  const [msg, setMsg] = useState("");
  const cls = "rounded border border-ink-700 bg-ink-900 px-2 py-1 text-sm text-white";
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const q = adminKey ? `?key=${encodeURIComponent(adminKey)}` : "";
    const res = await fetch(`/api/admin/creators${q}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "month", ...f }) }).catch(() => null);
    const d = (await res?.json().catch(() => null)) as { error?: string } | null;
    setMsg(res?.ok ? "Saved." : d?.error ?? "Failed");
    if (res?.ok) router.refresh();
  }
  const field = (k: keyof typeof f, label: string, w = "w-28") => (
    <label className="flex flex-col text-xs text-slate-400">
      {label}
      <input className={`${cls} ${w}`} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </label>
  );
  return (
    <form onSubmit={save} className="flex flex-wrap items-end gap-2">
      {field("month", "Month (YYYY-MM)")}
      {field("totalVisitors", "All visitors")}
      {field("affiliateRevenue", "Affiliate profit")}
      {field("currency", "Currency", "w-16")}
      {field("sharePct", "Creator share %", "w-16")}
      <button className="rounded bg-brand-500 px-3 py-1.5 text-sm font-bold text-white">Save month</button>
      {msg && <span className="text-sm text-slate-300">{msg}</span>}
    </form>
  );
}
