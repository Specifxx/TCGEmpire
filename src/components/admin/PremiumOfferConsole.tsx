"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

// The interactive half of /admin/premium-offer. Everything it does goes
// through /api/admin/premium-offer (preview / send / test) and the existing
// /api/admin/grant-premium (the manual extension the email promises); when the
// page was opened via the ?key= link rather than an admin session, the key is
// passed through so both routes' dual gate accepts it — same pattern as
// GrantPremiumForm.

export interface ConsoleRow {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  trialAvailable: boolean;
  premiumUntil: string | null;
  offerSentAt: string | null;
  clickedOfferAt: string | null;
  status: "pending" | "sent" | "premium" | "optedOut";
}

type Filter = "pending" | "sent" | "clicked" | "premium" | "optedOut" | "all";

interface RunResult {
  ok: boolean;
  error?: string;
  dryRun?: boolean;
  audienceSize?: number;
  pending?: number;
  alreadySent?: number;
  premium?: number;
  suppressed?: number;
  sent?: number;
  failed?: number;
  remaining?: number;
}

const FILTERS: { id: Filter; label: string }[] = [
  { id: "pending", label: "Not yet emailed" },
  { id: "sent", label: "Emailed" },
  { id: "clicked", label: "Opened the offer" },
  { id: "premium", label: "Premium now" },
  { id: "optedOut", label: "Opted out" },
  { id: "all", label: "Everyone" },
];

function defaultDeadline(): string {
  const d = new Date(Date.now() + 21 * 86_400_000);
  return d.toISOString().slice(0, 10);
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—";

export function PremiumOfferConsole({
  rows,
  adminKey,
  adminEmail,
  trialDays,
  offerDays,
}: {
  rows: ConsoleRow[];
  adminKey?: string;
  adminEmail: string;
  trialDays: number;
  offerDays: number;
}) {
  const router = useRouter();
  const [offerEnds, setOfferEnds] = useState(defaultDeadline);
  const [via, setVia] = useState<"brevo" | "resend">("brevo");
  const [filter, setFilter] = useState<Filter>("pending");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [testTo, setTestTo] = useState(adminEmail);
  const [grantNote, setGrantNote] = useState<Record<string, string>>({});
  const [customDays, setCustomDays] = useState<Record<string, string>>({});

  const now = Date.now();
  const counts = useMemo(() => {
    const c = { pending: 0, sent: 0, clicked: 0, premium: 0, optedOut: 0, all: rows.length };
    for (const r of rows) {
      c[r.status]++;
      if (r.clickedOfferAt) c.clicked++;
    }
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "clicked" ? !r.clickedOfferAt : filter !== "all" && r.status !== filter) return false;
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
      body: JSON.stringify({ ...payload, offerEnds, via, ...(adminKey ? { key: adminKey } : {}) }),
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
    const who = ids ? `the ${ids.length} selected account${ids.length === 1 ? "" : "s"}` : `all ${counts.pending} accounts not yet emailed`;
    const extra = resend ? ` ${selectedAlreadySent} of them already received it and will get it AGAIN.` : "";
    if (!window.confirm(`Send the Premium offer email (deadline ${offerEnds}, via ${via}) to ${who}?${extra}`)) return;
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
      setNotice(r.ok ? `✓ Both wordings sent to ${r.to ?? testTo}` : `✗ ${r.error ?? "test failed"}`);
    } finally {
      setBusy(null);
    }
  }

  async function grant(row: ConsoleRow, days: number) {
    if (!Number.isFinite(days) || days < 1) return;
    setBusy(`grant:${row.id}`);
    try {
      const res = await fetch("/api/admin/grant-premium", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: row.email, days, ...(adminKey ? { key: adminKey } : {}) }),
      });
      const data = await res.json().catch(() => null);
      setGrantNote((g) => ({
        ...g,
        [row.id]: !res.ok || !data?.ok ? `✗ ${data?.error ?? `failed (${res.status})`}` : `✓ +${days}d → ${fmt(data.premiumUntil)}`,
      }));
      if (res.ok && data?.ok) router.refresh();
    } catch {
      setGrantNote((g) => ({ ...g, [row.id]: "✗ network error" }));
    } finally {
      setBusy(null);
    }
  }

  const deadlineOk = /^\d{4}-\d{2}-\d{2}$/.test(offerEnds) && new Date(`${offerEnds}T23:59:59Z`).getTime() > now;

  return (
    <div className="mt-6 space-y-5">
      {/* ── Campaign controls ─────────────────────────────────────────── */}
      <div className="card-surface p-4">
        <h2 className="text-sm font-extrabold text-white">Send the offer</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-400">
            Offer deadline
            <input
              type="date"
              value={offerEnds}
              onChange={(e) => setOfferEnds(e.target.value)}
              className="input mt-1 block"
              disabled={!!busy}
            />
          </label>
          <label className="text-xs text-slate-400">
            Send via
            <select value={via} onChange={(e) => setVia(e.target.value as "brevo" | "resend")} className="input mt-1 block" disabled={!!busy}>
              <option value="brevo">Brevo (300/day, keeps Resend for transactional)</option>
              <option value="resend">Resend (100/day)</option>
            </select>
          </label>
          <button type="button" onClick={preview} disabled={!!busy || !deadlineOk} className="btn-ghost text-sm">
            {busy === "preview" ? "Checking…" : ids ? `Preview (${ids.length} selected)` : `Preview (${counts.pending} pending)`}
          </button>
          <button type="button" onClick={send} disabled={!!busy || !deadlineOk || (ids ? ids.length === 0 : counts.pending === 0)} className="btn-primary text-sm">
            {busy === "send" ? "Sending…" : ids ? `Send to ${ids.length} selected` : `Send to all ${counts.pending} pending`}
          </button>
        </div>
        {!deadlineOk && <p className="mt-2 text-xs text-rose-400">Pick a deadline in the future — the email says &ldquo;subscribe before this date&rdquo;.</p>}
        {resend && (
          <p className="mt-2 text-xs text-amber-300">
            {selectedAlreadySent} selected account{selectedAlreadySent === 1 ? " has" : "s have"} already been emailed and will receive it again.
          </p>
        )}
        <p className="mt-2 text-xs text-slate-500">
          Tick rows below to narrow the send; with nothing ticked it goes to everyone not yet emailed. Sends are batched
          under the provider&apos;s daily cap and resume where they left off — if <em>remaining</em> is above zero, press
          send again tomorrow.
        </p>
        {result && (
          <div className={`mt-3 rounded-lg border p-3 text-xs ${result.ok ? "border-ink-700 bg-ink-850 text-slate-300" : "border-rose-900 bg-rose-950/40 text-rose-300"}`}>
            {result.ok ? (
              <>
                <span className="font-bold text-white">{result.dryRun ? "Preview" : "Sent"}</span> · reachable{" "}
                <span className="num font-bold text-slate-100">{result.audienceSize ?? 0}</span> · pending{" "}
                <span className="num font-bold text-slate-100">{result.pending ?? 0}</span> · already emailed {result.alreadySent ?? 0} ·
                skipped as Premium/admin {result.premium ?? 0} · opted out {result.suppressed ?? 0}
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
          <button type="button" onClick={test} disabled={!!busy || !testTo || !deadlineOk} className="btn-ghost text-sm">
            {busy === "test" ? "Sending…" : "Send me a test (both wordings)"}
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
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} aria-label="select all visible" />
              </th>
              <th className="px-3 py-2 font-medium">Account</th>
              <th className="px-3 py-2 font-medium">Joined</th>
              <th className="px-3 py-2 font-medium">Trial</th>
              <th className="px-3 py-2 font-medium">Emailed</th>
              <th className="px-3 py-2 font-medium">Opened offer</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Grant</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-slate-500">Nobody matches this filter.</td>
              </tr>
            )}
            {visible.map((r) => {
              const canSend = sendable(r);
              const suggested = r.trialAvailable ? offerDays : offerDays - trialDays;
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
                  <td className="whitespace-nowrap px-3 py-2">
                    {r.trialAvailable ? (
                      <span className="chip bg-ink-800 text-slate-300">available</span>
                    ) : (
                      <span className="chip bg-ink-800 text-slate-500">used</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-300">{fmt(r.offerSentAt)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-300">
                    {r.clickedOfferAt ? <span className="text-brand-400">✓ {fmt(r.clickedOfferAt)}</span> : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {r.status === "premium" ? (
                      <span className="chip bg-brand-500/15 text-brand-300">✓ Premium until {fmt(r.premiumUntil)}</span>
                    ) : r.status === "optedOut" ? (
                      <span className="chip bg-rose-950 text-rose-300">opted out</span>
                    ) : r.status === "sent" ? (
                      <span className="chip bg-ink-800 text-slate-400">emailed</span>
                    ) : (
                      <span className="chip bg-ink-800 text-slate-500">free</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={() => grant(r, suggested)}
                        disabled={!!busy}
                        className="btn-ghost px-2 py-1 text-xs"
                        title={r.trialAvailable ? `No Stripe trial on record — the full ${offerDays} days` : `Stripe gave ${trialDays} days — top up to ${offerDays}`}
                      >
                        +{suggested}d
                      </button>
                      <input
                        type="number"
                        min={1}
                        max={1830}
                        value={customDays[r.id] ?? ""}
                        onChange={(e) => setCustomDays((c) => ({ ...c, [r.id]: e.target.value }))}
                        placeholder="days"
                        className="input w-16 px-2 py-1 text-xs"
                        aria-label={`custom days for ${r.email}`}
                      />
                      <button
                        type="button"
                        onClick={() => grant(r, Number(customDays[r.id]))}
                        disabled={!!busy || !Number(customDays[r.id])}
                        className="btn-ghost px-2 py-1 text-xs"
                      >
                        {busy === `grant:${r.id}` ? "…" : "Grant"}
                      </button>
                    </div>
                    {grantNote[r.id] && (
                      <div className={`mt-1 text-xs ${grantNote[r.id].startsWith("✓") ? "text-brand-400" : "text-rose-400"}`}>{grantNote[r.id]}</div>
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
