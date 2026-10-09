import { NextResponse } from "next/server";
import { meterAndStore, quotaContext } from "@/lib/search-quota-server";

// Counts one /browse text search against the day's allowance (lib/search-quota.ts).
// Called by <SearchQuotaTick> because the page, a server component, cannot set
// the counter cookie. Returns what is left so a client could show it.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { q?: unknown };
  const q = typeof body.q === "string" ? body.q.trim().slice(0, 120) : "";
  if (q.length < 2) return NextResponse.json({ ok: true });
  const ctx = await quotaContext();
  if (!ctx.metered) return NextResponse.json({ ok: true, unlimited: true });
  const d = meterAndStore(ctx, q);
  return NextResponse.json(
    { ok: d.allowed, used: d.used, limit: ctx.limit, tier: ctx.tier },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
