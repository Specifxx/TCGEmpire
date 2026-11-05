import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { CLIENT_CLAIMABLE, type TaskId } from "@/lib/coins";
import { claimTask, coinsEnabledFor } from "@/lib/coins-server";

export const dynamic = "force-dynamic";

const schema = z.object({ task: z.enum(CLIENT_CLAIMABLE as unknown as [TaskId, ...TaskId[]]) });

// POST — claim a task the browser completes (welcome, daily check-in, share a
// price, visit a store). Every one is capped and idempotent server-side
// (lib/coins-server.ts claimTask), so a replayed request pays nothing. Sent as
// a sendBeacon from share and store clicks, hence the text/plain body tolerance.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  if (!coinsEnabledFor(user)) return NextResponse.json({ error: "Coins are a Premium perk" }, { status: 403 });

  const rl = rateLimit(`coins:claim:${user.id}`, 20, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const body = await req.text().then((t) => (t ? JSON.parse(t) : null)).catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const result = await claimTask(user.id, parsed.data.task);
  return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
}
