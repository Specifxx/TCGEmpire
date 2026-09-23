"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

// The interactive half of /admin/premium-winback. Everything goes through
// /api/admin/premium-winback (preview / send / test); when the page was
// opened via ?key= rather than an admin session, the key is passed through
// so the route's dual gate accepts it — same pattern as PremiumOfferConsole.
//
// No "grant" column here, unlike PremiumOfferConsole: that campaign's grant
// is a manual owner step after Stripe checkout, this one's grant is
// automatic the moment the recipient claims their link, so there is nothing
// left for the admin to do once a row is "sent".

export interface WinbackConsoleRow {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  premiumUntil: string | null;
  sentAt: string | null;
  claimedAt: string | null;
  status: "pending" | "sent" | "claimed" | "paid" | "optedOut";
}

type Filter = WinbackConsoleRow["status"] | "all";

interface RunResult {
  ok: boolean;
  error?: string;
  dryRun?: boolean;
  audienceSize?: number;
  pending?: number;
  alreadySent?: number;
  paid?: number;
  tooOld?: number;
  suppressed?: number;
  sent?: number;
  failed?: number;
  remaining?: number;
  errors?: string[];
}

const FILTERS: { id: Filter; label: string }[] = [
  { id: "pending", label: "Not yet emailed" },
  { id: "sent", label: "Emailed, unclaimed" },
  { id: "claimed", label: "Claimed" },
  { id: "paid", label: "Plus/Premium now" },
  { id: "optedOut", label: "Opted out" },
  { id: "all", label: "Everyone" },
];

function defaultRegisteredAfter(): string {
  const d = new Date(Date.now() - 30 * 86_400_000);
  return d.toISOString().slice(0, 10);
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—";

export function PremiumWinbackConsole({
  rows,
  adminKey,
  adminEmail,
  trialDays,
}: {
  rows: WinbackConsoleRow[];
  adminKey?: string;
  adminEmail: string;
  trialDays: number;
}) {
  const router = useRouter();
  const [registeredAfter, setRegisteredAfter] = useState(defaultRegisteredAfter);
  const [via, setVia] = useState<"brevo" | "resend">("brevo");
  const [filter, setFilter] = useState<Filter>("pending");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [testTo, setTestTo] = useState(adminEmail);

  const counts = useMemo(() => {
    const c = { pending: 0, sent: 0, claimed: 0, paid: 0, optedOut: 0, all: rows.length };
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (!needle) return true;
      return r.email.toLowerCase().includes(needle) || r.displayName.toLowerCase().includes(needle);
    });
  }, [rows, filter, q]);

  // Only "pending" rows can be sent to — this campaign never re-sends
  // (a second send would mean a second claim link for the same account,
  // which the one-row-per-user schema doesn't support, deliberately).
  const selectedSendable = rows.filter((r) => selected.has(r.id) && r.status === "pending");
  const allVisibleSelected = visible.length > 0 && visible.every((r) => r.status !== "pending" || selected.has(r.id));

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
      else visible.forEach((r) => r.status === "pending" && n.add(r.id));
      return n;
    });
  }

  async function call(payload: Record<string, unknown>): Promise<RunResult> {
    const res = await fetch("/api/admin/premium-winback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, registeredAfter, via, ...(adminKey ? { key: adminKey } : {}) }),
    });
    const data = (await res.json().catch(() => null)) as RunResult | null;
    return data ?? { ok: false, error: `failed (${res.status})` };
  }

  const ids = selectedSendable.length ? selectedSendable.map((r) => r.id) : undefined;

  async function preview() {
    setBusy("preview");
    setNotice(null);
    try {
      setResult(await call({ action: "preview", userIds: ids }));
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    const who = ids ? `the ${ids.length} selected account${ids.length === 1 ? "" : "s"}` : `all ${counts.pending} accounts registered since ${registeredAfter}`;
    if (!window.confirm(`Send the ${trialDays}-day free-Premium claim link (via ${via}) to ${who}? Each link works once and grants immediately — there is no manual step after this.`)) return;
    setBusy("send");
    setNotice(null);
    try {
      const r = await call({ action: "send", userIds: ids });
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
      setNotice(r.ok ? `✓ Sent to ${r.to ?? testTo}` : `✗ ${r.error ?? "test failed"}`);
    } finally {
      setBusy(null);
    }
  }

  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(registeredAfter) && new Date(`${registeredAfter}T00:00:00Z`).getTime() <= Date.now();

  return (
    <div className="mt-6 space-y-5">
      {/* ── Campaign controls ─────────────────────────────────────────── */}
      <div className="card-surface p-4">
        <h2 className="text-sm font-extrabold text-white">Send the claim link</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-400">
            Registered on/after
            <input
              type="date"
              value={registeredAfter}
              onChange={(e) => setRegisteredAfter(e.target.value)}
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
          <button type="button" onClick={preview} disabled={!!busy || !dateOk} className="btn-ghost text-sm">
            {busy === "preview" ? "Checking…" : ids ? `Preview (${ids.length} selected)` : `Preview (${counts.pending} pending)`}
          </button>
          <button type="button" onClick={send} disabled={!!busy || !dateOk || (ids ? ids.length === 0 : counts.pending === 0)} className="btn-primary text-sm">
            {busy === "send" ? "Sending…" : ids ? `Send to ${ids.length} selected` : `Send to all ${counts.pending} pending`}
          </button>
        </div>
        {!dateOk && <p className="mt-2 text-xs text-rose-400">Pick a real date not in the future.</p>}
        <p className="mt-2 text-xs text-slate-500">
          Tick rows below to narrow the send; with nothing ticked it goes to everyone still pending. Each account is
          only ever sent this campaign once — there is no re-send. Sends are batched under the provider&apos;s daily
          cap and resume where they left off — if <em>remaining</em> is above zero, press send again tomorrow.
        </p>
        {result && (
          <div className={`mt-3 rounded-lg border p-3 text-xs ${result.ok ? "border-ink-700 bg-ink-850 text-slate-300" : "border-rose-500/40 bg-rose-500/10 text-rose-300"}`}>
            {result.ok ? (
              <>
                <span className="font-bold text-white">{result.dryRun ? "Preview" : "Sent"}</span> · reachable{" "}
                <span className="num font-bold text-slate-100">{result.audienceSize ?? 0}</span> · pending{" "}
                <span className="num font-bold text-slate-100">{result.pending ?? 0}</span> · already emailed {result.alreadySent ?? 0} ·
                skipped as Plus/Premium/admin {result.paid ?? 0} · too old {result.tooOld ?? 0} · opted out {result.suppressed ?? 0}
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
        <p className="mt-2 text-xs text-slate-500">
          The test email&apos;s claim link points at a token that doesn&apos;t exist, so it can&apos;t grant anything
          — it&apos;s for proofreading the copy only.
        </p>
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
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} aria-label="select all visible" />
              </th>
              <th className="px-3 py-2 font-medium">Account</th>
              <th className="px-3 py-2 font-medium">Joined</th>
              <th className="px-3 py-2 font-medium">Emailed</th>
              <th className="px-3 py-2 font-medium">Claimed</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">Nobody matches this filter.</td>
              </tr>
            )}
            {visible.map((r) => (
              <tr key={r.id} className="border-b border-ink-800 last:border-0 align-top hover:bg-ink-800/50">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                    disabled={r.status !== "pending"}
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
                  {r.claimedAt ? <span className="text-brand-400">✓ {fmt(r.claimedAt)}</span> : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {r.status === "paid" ? (
                    <span className="chip bg-brand-500/15 text-brand-300">Plus/Premium until {fmt(r.premiumUntil)}</span>
                  ) : r.status === "optedOut" ? (
                    <span className="chip bg-rose-500/15 text-rose-300">opted out</span>
                  ) : r.status === "claimed" ? (
                    <span className="chip bg-brand-500/15 text-brand-300">claimed</span>
                  ) : r.status === "sent" ? (
                    <span className="chip bg-ink-800 text-slate-400">emailed</span>
                  ) : (
                    <span className="chip bg-ink-800 text-slate-500">free</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length >= 1000 && <p className="text-xs text-slate-500">Showing the 1,000 most recent accounts.</p>}
    </div>
  );
}
