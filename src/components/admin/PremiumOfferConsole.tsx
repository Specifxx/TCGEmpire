"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

// The interactive half of /admin/premium-offer — the one-off price-drop
// announcement (2026-09-27; lib/premium-offer.ts). Everything it does goes
// through /api/admin/premium-offer (preview / send / test); when the page was
// opened via the ?key= link rather than an admin session, the key is passed
// through so the route's dual gate accepts it — same pattern as
// GrantPremiumForm. The old "month on us" offer's grant buttons are gone: this
// email promises nothing to grant (any grant still owed from the old offer is
// done from /admin/accounts).

export interface ConsoleRow {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  premiumUntil: string | null;
  sentAt: string | null;
  clickedAt: string | null;
  status: "pending" | "sent" | "paying" | "optedOut";
}

type Filter = "pending" | "sent" | "clicked" | "paying" | "optedOut" | "all";

interface RunResult {
  ok: boolean;
  error?: string;
  dryRun?: boolean;
  audienceSize?: number;
  pending?: number;
  alreadySent?: number;
  paying?: number;
  admins?: number;
  suppressed?: number;
  sent?: number;
  failed?: number;
  remaining?: number;
  errors?: string[];
}

const FILTERS: { id: Filter; label: string }[] = [
  { id: "pending", label: "Not yet emailed" },
  { id: "sent", label: "Emailed" },
  { id: "clicked", label: "Clicked a link" },
  { id: "paying", label: "Paying now" },
  { id: "optedOut", label: "Opted out" },
  { id: "all", label: "Everyone" },
];

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—";

export function PremiumOfferConsole({
  rows,
  adminKey,
  adminEmail,
  pendingTotal,
  batch,
}: {
  rows: ConsoleRow[];
  adminKey?: string;
  adminEmail: string;
  // The server-side dry run's pending count — every account, not only the
  // table's 1,000 newest — so the send button names the real reach.
  pendingTotal: number;
  batch: number;
}) {
  const router = useRouter();
  const [via, setVia] = useState<"brevo" | "resend">("brevo");
  const [filter, setFilter] = useState<Filter>("pending");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [testTo, setTestTo] = useState(adminEmail);

  const counts = useMemo(() => {
    const c = { pending: 0, sent: 0, clicked: 0, paying: 0, optedOut: 0, all: rows.length };
    for (const r of rows) {
      c[r.status]++;
      if (r.clickedAt) c.clicked++;
    }
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "clicked" ? !r.clickedAt : filter !== "all" && r.status !== filter) return false;
      if (!needle) return true;
      return r.email.toLowerCase().includes(needle) || r.displayName.toLowerCase().includes(needle);
    });
  }, [rows, filter, q]);

  const sendable = (r: ConsoleRow) => r.status === "pending" || r.status === "sent";
  const selectedSendable = rows.filter((r) => selected.has(r.id) && sendable(r));
  const selectedAlreadySent = selectedSendable.filter((r) => r.status === "sent").length;
  const allVisibleSelected = visible.length > 0 && visible.every((r) => !sendable(r) || selected.has(r.id));

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleVisible() {
    setSelected((s) => {
      const n = new Set(s);
      if (allVisibleSelected) visible.forEach((r) => n.delete(r.id));
      else visible.forEach((r) => sendable(r) && n.add(r.id));
      return n;
    });
  }

  async function call(payload: Record<string, unknown>): Promise<RunResult> {
    const res = await fetch("/api/admin/premium-offer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, via, ...(adminKey ? { key: adminKey } : {}) }),
    });
    const data = (await res.json().catch(() => null)) as RunResult | null;
    return data ?? { ok: false, error: `failed (${res.status})` };
  }

  const ids = selectedSendable.length ? selectedSendable.map((r) => r.id) : undefined;
  const resend = selectedAlreadySent > 0;

  async function preview() {
    setBusy("preview");
    setNotice(null);
    try {
      setResult(await call({ action: "preview", userIds: ids, resend }));
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    const who = ids
      ? `the ${ids.length} selected account${ids.length === 1 ? "" : "s"}`
      : `the next ${Math.min(batch, pendingTotal)} of ${pendingTotal} accounts not yet emailed`;
    const extra = resend ? ` ${selectedAlreadySent} of them already received it and will get it AGAIN.` : "";
    if (!window.confirm(`Send the price-drop email (via ${via}) to ${who}?${extra}`)) return;
    setBusy("send");
    setNotice(null);
    try {
      const r = await call({ action: "send", userIds: ids, resend });
      setResult(r);
      if (r.ok) {
        setSelected(new Set());
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    setNotice(null);
    try {
      const r = (await call({ action: "test", to: testTo })) as RunResult & { to?: string };
      setNotice(r.ok ? `✓ Test sent to ${r.to ?? testTo}` : `✗ ${r.error ?? "test failed"}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-6 space-y-5">
      {/* ── Campaign controls ─────────────────────────────────────────── */}
      <div className="card-surface p-4">
        <h2 className="text-sm font-extrabold text-white">Send the price-drop email</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-400">
            Send via
            <select value={via} onChange={(e) => setVia(e.target.value as "brevo" | "resend")} className="input mt-1 block" disabled={!!busy}>
              <option value="brevo">Brevo (300/day, keeps Resend for transactional)</option>
              <option value="resend">Resend (100/day)</option>
            </select>
          </label>
          <button type="button" onClick={preview} disabled={!!busy} className="btn-ghost text-sm">
            {busy === "preview" ? "Checking…" : ids ? `Preview (${ids.length} selected)` : `Preview (${pendingTotal} pending)`}
          </button>
          <button type="button" onClick={send} disabled={!!busy || (ids ? ids.length === 0 : pendingTotal === 0)} className="btn-primary text-sm">
            {busy === "send"
              ? "Sending…"
              : ids
                ? `Send to ${ids.length} selected`
                : `Send next batch (${Math.min(batch, pendingTotal)} of ${pendingTotal} pending)`}
          </button>
        </div>
        {resend && (
          <p className="mt-2 text-xs text-amber-300">
            {selectedAlreadySent} selected account{selectedAlreadySent === 1 ? " has" : "s have"} already been emailed and will receive it again.
          </p>
        )}
        <p className="mt-2 text-xs text-slate-500">
          Tick rows below to narrow the send; with nothing ticked it goes to everyone not yet emailed. Sends are batched
          ({batch} at a time, under the provider&apos;s daily cap) and resume where they left off — if <em>remaining</em> is above zero, press
          send again tomorrow.
        </p>
        {result && (
          <div className={`mt-3 rounded-lg border p-3 text-xs ${result.ok ? "border-ink-700 bg-ink-850 text-slate-300" : "border-rose-500/40 bg-rose-500/10 text-rose-300"}`}>
            {result.ok ? (
              <>
                <span className="font-bold text-white">{result.dryRun ? "Preview" : "Sent"}</span> · reachable{" "}
                <span className="num font-bold text-slate-100">{result.audienceSize ?? 0}</span> · pending{" "}
                <span className="num font-bold text-slate-100">{result.pending ?? 0}</span> · already emailed {result.alreadySent ?? 0} ·
                skipped as paying {result.paying ?? 0} · admins {result.admins ?? 0} · opted out {result.suppressed ?? 0}
                {!result.dryRun && (
                  <>
                    {" "}· <span className="font-bold text-brand-400">sent {result.sent ?? 0}</span> · failed {result.failed ?? 0} ·
                    remaining <span className="num font-bold text-slate-100">{result.remaining ?? 0}</span>
                  </>
                )}
              </>
            ) : (
              <>✗ {result.error ?? "failed"}</>
            )}
            {result.errors?.length ? (
              <ul className="mt-2 list-disc pl-4 text-rose-300">
                {result.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            ) : null}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink-800 pt-3">
          <input
            type="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="your email"
            className="input max-w-xs"
            disabled={!!busy}
          />
          <button type="button" onClick={test} disabled={!!busy || !testTo} className="btn-ghost text-sm">
            {busy === "test" ? "Sending…" : "Send me a test"}
          </button>
          {notice && <span className={`text-xs ${notice.startsWith("✓") ? "text-brand-400" : "text-rose-400"}`}>{notice}</span>}
        </div>
      </div>

      {/* ── Audience ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`chip ${filter === f.id ? "bg-brand-500/20 text-brand-300" : "bg-ink-800 text-slate-400 hover:text-slate-200"}`}
          >
            {f.label} · {counts[f.id]}
          </button>
        ))}
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="search name or email"
          className="input ml-auto max-w-xs"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-ink-700 bg-ink-850">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} aria-label="select all visible" />
              </th>
              <th className="px-3 py-2 font-medium">Account</th>
              <th className="px-3 py-2 font-medium">Joined</th>
              <th className="px-3 py-2 font-medium">Emailed</th>
              <th className="px-3 py-2 font-medium">Clicked</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">Nobody matches this filter.</td>
              </tr>
            )}
            {visible.map((r) => {
              const canSend = sendable(r);
              return (
                <tr key={r.id} className="border-b border-ink-800 last:border-0 align-top hover:bg-ink-800/50">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      disabled={!canSend}
                      aria-label={`select ${r.email}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-white">{r.displayName}</div>
                    <div className="text-xs text-slate-500">{r.email}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-300">{fmt(r.createdAt)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-300">{fmt(r.sentAt)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-300">
                    {r.clickedAt ? <span className="text-brand-400">✓ {fmt(r.clickedAt)}</span> : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {r.status === "paying" ? (
                      <span className="chip bg-brand-500/15 text-brand-300">✓ paying until {fmt(r.premiumUntil)}</span>
                    ) : r.status === "optedOut" ? (
                      <span className="chip bg-rose-500/15 text-rose-300">opted out</span>
                    ) : r.status === "sent" ? (
                      <span className="chip bg-ink-800 text-slate-400">emailed</span>
                    ) : (
                      <span className="chip bg-ink-800 text-slate-500">free</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length >= 1000 && <p className="text-xs text-slate-500">Showing the 1,000 most recent accounts.</p>}
    </div>
  );
}
