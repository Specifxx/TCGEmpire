// Pure aggregation behind scripts/funnel-report.ts's "by surface" tables —
// kept out of the script so a test can import it without running the report.
// See lib/premium-surface.ts for what a surface is and why it is recorded.
import { isActive } from "./subscription-metrics";

export type ClickRow = { createdAt: Date; source: string; surface: string | null };
export type SurfaceSub = { createdMs: number; trialEndMs: number | null; status: string; surface?: string | null };

/** Returns the three surface tables as plain, sorted [key, value] rows. */
export function surfaceTables(clicks: ClickRow[], subs: SurfaceSub[], sinceMs: number, nowMs: number) {
  const count = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  const bySource = new Map<string, number>();
  const checkoutsBySurface = new Map<string, number>();
  for (const c of clicks) {
    if (c.source === "checkout") count(checkoutsBySurface, c.surface ?? "(no tracked surface)");
    else count(bySource, c.source);
  }
  const trials = new Map<string, { started: number; matured: number; converted: number }>();
  for (const s of subs) {
    if (s.trialEndMs == null || s.createdMs < sinceMs) continue;
    const k = s.surface ?? "(untracked)";
    const t = trials.get(k) ?? { started: 0, matured: 0, converted: 0 };
    t.started++;
    if (s.trialEndMs <= nowMs) {
      t.matured++;
      if (isActive(s.status as Parameters<typeof isActive>[0])) t.converted++;
    }
    trials.set(k, t);
  }
  const sortDesc = <T,>(m: Map<string, T>, key: (v: T) => number) => [...m.entries()].sort((a, b) => key(b[1]) - key(a[1]));
  return {
    clicks: sortDesc(bySource, (n) => n),
    checkouts: sortDesc(checkoutsBySurface, (n) => n),
    trials: sortDesc(trials, (t) => t.started),
  };
}
