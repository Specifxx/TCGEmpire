import { loadSisterAccounts, type PlanStatus } from "@/lib/admin-sister";

const LABEL: Record<PlanStatus, string> = { paid: "Premium", trial: "Trial", lapsed: "Lapsed", free: "Free", "no-account": "No account" };
const CHIP: Record<PlanStatus, string> = {
  paid: "bg-gold/20 text-gold",
  trial: "bg-brand-500/15 text-brand-400",
  lapsed: "bg-ink-800 text-slate-500",
  free: "bg-ink-800 text-slate-400",
  "no-account": "bg-ink-800 text-slate-600",
};

const fmt = (d: Date | null) => (d ? new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—");
const num = (n: number) => n.toLocaleString();

/** Read-only DexCompare view for /admin/accounts?site=dex. */
export async function DexTab() {
  let data: Awaited<ReturnType<typeof loadSisterAccounts>> | null = null;
  try {
    data = await loadSisterAccounts("dex");
  } catch (e) {
    console.error("DexTab: loadSisterAccounts failed", e);
    data = null;
  }
  if (!data) {
    return <div className="mt-6 rounded-xl border border-ink-700 bg-ink-850 p-8 text-center text-sm text-slate-400">Couldn&apos;t load DexCompare accounts right now.</div>;
  }
  const { rows, summary: s, truncated } = data;
  return (
    <>
      <p className="mt-1 text-sm text-slate-400">
        DexCompare has no accounts of its own. <b>Members</b> are RiftCompare accounts that signed in through DexCompare&apos;s Premium door (recorded from 10 Nov 2026);
        alert subscribers are emails with a DexCompare price alert. Plan is read live from the RiftCompare account.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <Stat label="People" value={num(s.people)} sub="members + alert emails" />
        <Stat label="Members" value={num(s.members)} sub="signed in via Dex" />
        <Stat label="Alert emails" value={num(s.alertEmails)} />
        <Stat label="Premium" value={num(s.paid)} sub="paid, active" />
        <Stat label="Trials" value={num(s.trial)} />
        <Stat label="Lapsed" value={num(s.lapsed)} />
        <Stat label="Conversion" value={`${s.conversionPct}%`} sub="members on paid Premium" />
        <Stat label="New · 7d / 30d" value={`${num(s.new7)} / ${num(s.new30)}`} />
      </div>
      {rows.length === 0 ? (
        <div className="mt-6 rounded-xl border border-ink-700 bg-ink-850 p-8 text-center text-sm text-slate-400">No DexCompare members or alert subscribers yet.</div>
      ) : (
        <>
          <p className="mt-5 text-xs text-slate-500">Showing {num(rows.length)}{truncated ? ` of ${num(s.people)} (newest first)` : ""}.</p>
          <div className="mt-2 overflow-x-auto rounded-xl border border-ink-700 bg-ink-850">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Joined Dex</th>
                  <th className="px-3 py-2 font-medium">Last sign-in</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Alerts</th>
                  <th className="px-3 py-2 font-medium">Plan</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.email} className="border-b border-ink-800 last:border-0 hover:bg-ink-800/50">
                    <td className="px-3 py-2 text-white">{r.email}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-300">{fmt(r.signedUp)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-400">{fmt(r.lastSeen)}</td>
                    <td className="px-3 py-2 text-slate-400">{r.member ? "Member" : "Alerts only"}</td>
                    <td className="px-3 py-2 text-slate-400">
                      {r.alerts > 0 ? `${r.alerts}${r.confirmed ? " ✓" : " (unconfirmed)"}` : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className={`chip ${CHIP[r.plan]}`}>{LABEL[r.plan]}{r.premiumUntil && r.plan !== "free" ? ` · ${fmt(r.premiumUntil)}` : ""}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850 p-4">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="num mt-1 text-2xl font-extrabold text-white">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}
