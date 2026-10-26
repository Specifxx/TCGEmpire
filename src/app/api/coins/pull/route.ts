import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { coinsEnabledFor, pull } from "@/lib/coins-server";

export const dynamic = "force-dynamic";

// POST — spend a pull (or, with { shards: true }, ten shards) and reveal a
// coin. The roll happens here, never in the browser (lib/coins-server.ts pull).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  if (!coinsEnabledFor(user)) return NextResponse.json({ error: "Coins are a Pro perk" }, { status: 403 });

  const rl = rateLimit(`coins:pull:${user.id}`, 30, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const body = await req.json().catch(() => null);
  const result = await pull(user.id, body?.shards === true);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason === "no-pulls" ? "No pulls left" : "Try again" }, { status: result.reason === "no-pulls" ? 409 : 503 });
  }
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
