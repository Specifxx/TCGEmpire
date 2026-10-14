// The monitor's latest report, as /admin/health and the admin home read it: one row.
// A missing row or table (before the first run, or before the release that creates
// the table) is "no report yet", never an error.
import { prisma } from "../db";
import type { OpsReport } from "./types";

export const SNAPSHOT_KEY = "latest";
/** After this long without a report the monitor itself is presumed stopped. */
export const SNAPSHOT_STALE_HOURS = 8;

export async function getLatestReport(): Promise<OpsReport | null> {
  try {
    const row = await prisma.opsSnapshot.findUnique({ where: { key: SNAPSHOT_KEY } });
    const j = row?.json as unknown as OpsReport | null | undefined;
    if (!j || j.version !== 1 || !Array.isArray(j.results)) return null;
    return j;
  } catch {
    return null;
  }
}
