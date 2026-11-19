import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin-emails";
import { GIVEAWAYS, giveawayState, giveawayFunnel, sydneyDay, MAX_REFERRAL_ENTRIES } from "@/lib/giveaway";
import { giveawayEntrants, type Entrant } from "@/lib/giveaway-server";
import { GiveawayDrawButton } from "@/components/giveaway/GiveawayDrawButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Giveaways", robots: { index: false, follow: false } };

// /admin/giveaway (admin only; owner, 2026-11-19: "an admin page so I can see who's entered the giveaway"). Every
// entrant with their account email, entries and why, the totals, entries per day (Sydney), a CSV of the lot and the
// weighted draw once entries close. Uncached, per request; emails never leave this page and its CSV.
const WHY: Record<Entrant["reason"], string> = { premium: "Premium", watch: "Price watch", base: "Entry" };
const when = (d: Date) =>
  new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(d);

function why(e: Entrant): string {
  const bits = [WHY[e.reason]];
  if (e.referrals > 0) bits.push(`${e.referrals} friend${e.referrals === 1 ? "" : "s"}${e.referrals > MAX_REFERRAL_ENTRIES ? ` (cap ${MAX_REFERRAL_ENTRIES})` : ""}`);
  if (!e.showName) bits.push("name hidden");
  return bits.join(" · ");
}

export default async function GiveawayAdminPage() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) notFound();
  const now = new Date();
  const sections = await Promise.all(
    GIVEAWAYS.map(async (g) => {
      const rows = await giveawayEntrants(g, isAdminEmail).catch(() => null);
      return { g, state: giveawayState(g, now), rows };
    }),
  );
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
      <h1 className="text-2xl font-bold">Giveaways</h1>
      {sections.map(({ g, state, rows }) => {
        const valid = rows?.filter((r) => !r.admin) ?? [];
        const entries = valid.reduce((s, r) => s + r.weight, 0);
        const perDay = new Map<string, number>();
        for (const r of valid) perDay.set(sydneyDay(r.enteredAt), (perDay.get(sydneyDay(r.enteredAt)) ?? 0) + 1);
        const newestFirst = [...(rows ?? [])].reverse();
        const funnel = giveawayFunnel(valid, g);
        const pct = (n: number) => (funnel.entrants ? `${Math.round((100 * n) / funnel.entrants)}% of entrants` : "");
        return (
          <section key={g.key} className="mt-6 rounded-xl border border-white/10 p-4">
            <h2 className="font-semibold">{g.title}</h2>
            <p className="text-sm opacity-80">
              {state} · closes {when(new Date(g.closesAt))} Sydney · draw {g.drawOn}
            </p>
            {rows === null ? (
              <p className="mt-3">Entries unavailable (the database didn&apos;t answer).</p>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="Entrants" value={valid.length} />
                  <Stat label="Entries in the draw" value={entries} />
                  <Stat label="On 3+ entries" value={valid.filter((r) => r.weight >= 3).length} />
                  <Stat label="Team (excluded)" value={(rows?.length ?? 0) - valid.length} />
                </div>

                {/* Owner, 20 Nov 2026: judged as an acquisition campaign (accounts, watches, returns, referrals), not entries. */}
                <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide opacity-70">Did it bring people in?</h3>
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label={`New accounts · ${pct(funnel.newAccounts)}`} value={funnel.newAccounts} />
                  <Stat label={`Signed up on /giveaway · ${pct(funnel.fromGiveawayPage)}`} value={funnel.fromGiveawayPage} />
                  <Stat label={`Watching a price · ${pct(funnel.watching)}`} value={funnel.watching} />
                  <Stat label={`Came back another day · ${pct(funnel.cameBack)}`} value={funnel.cameBack} />
                  <Stat label={`Invited a friend who joined · ${pct(funnel.referrers)}`} value={funnel.referrers} />
                  <Stat label="Confirmed friends joined" value={funnel.confirmedReferrals} />
                  <Stat label={`Active after the close · ${state === "closed" ? pct(funnel.activeAfterClose) : "reads after the close"}`} value={funnel.activeAfterClose} />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <a href={`/api/admin/giveaway?giveaway=${encodeURIComponent(g.key)}`} className="btn-primary" download>
                    Download CSV
                  </a>
                  <a href="/giveaway" className="text-sm underline">
                    Public page and leaderboard
                  </a>
                </div>

                <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide opacity-70">New entrants per day (Sydney)</h3>
                <ul className="mt-2 flex flex-wrap gap-2 text-sm">
                  {[...perDay.entries()].reverse().map(([day, n]) => (
                    <li key={day} className="rounded-md border border-white/10 px-2 py-1">
                      {day}: <strong>{n}</strong>
                    </li>
                  ))}
                  {perDay.size === 0 && <li className="opacity-70">No entries yet.</li>}
                </ul>

                <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide opacity-70">Entrants, newest first</h3>
                {/* Phone: one card per entrant. */}
                <ul className="mt-2 space-y-2 sm:hidden">
                  {newestFirst.map((r) => (
                    <li key={r.userId} className={`rounded-lg border border-white/10 p-3 text-sm ${r.admin ? "opacity-50" : ""}`}>
                      <div className="flex justify-between gap-2">
                        <strong className="truncate">{r.name}</strong>
                        <span className="shrink-0 font-semibold">{r.weight}×</span>
                      </div>
                      <div className="truncate opacity-80">{r.email}</div>
                      <div className="opacity-70">
                        {when(r.enteredAt)} · {r.country ?? "?"} · {why(r)}
                        {r.admin ? " · team" : ""}
                      </div>
                    </li>
                  ))}
                </ul>
                {/* Wider screens: a table. */}
                <div className="mt-2 hidden overflow-x-auto sm:block">
                  <table className="w-full text-left text-sm">
                    <thead className="opacity-70">
                      <tr>
                        <th className="py-2 pr-3">Name</th>
                        <th className="py-2 pr-3">Email</th>
                        <th className="py-2 pr-3">Entered (Sydney)</th>
                        <th className="py-2 pr-3">Country</th>
                        <th className="py-2 pr-3">Entries</th>
                        <th className="py-2">Why</th>
                      </tr>
                    </thead>
                    <tbody>
                      {newestFirst.map((r) => (
                        <tr key={r.userId} className={`border-t border-white/10 ${r.admin ? "opacity-50" : ""}`}>
                          <td className="py-2 pr-3">{r.name}</td>
                          <td className="py-2 pr-3">{r.email}</td>
                          <td className="whitespace-nowrap py-2 pr-3">{when(r.enteredAt)}</td>
                          <td className="py-2 pr-3">{r.country ?? "?"}</td>
                          <td className="py-2 pr-3 font-semibold">{r.weight}</td>
                          <td className="py-2">
                            {why(r)}
                            {r.admin ? " · team, excluded" : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide opacity-70">Draw</h3>
                {state === "closed" ? (
                  <GiveawayDrawButton giveaway={g.key} />
                ) : (
                  <p className="mt-2 text-sm opacity-80">The draw button appears here once entries close. Each entrant&apos;s chance is their entries over the total.</p>
                )}
              </>
            )}
          </section>
        );
      })}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 p-3">
      <div className="text-2xl font-bold">{value.toLocaleString("en-AU")}</div>
      <div className="text-xs opacity-70">{label}</div>
    </div>
  );
}
