import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { coinsEnabledFor, spin, type SpinPayment } from "@/lib/coins-server";

export const dynamic = "force-dynamic";

const PAYMENTS: readonly SpinPayment[] = ["riftcoins", "pull", "shards"];

// POST { pay: "riftcoins" | "pull" | "shards" } — one spin of the slot: a
// champion coin and a chance at a profile badge. The rolls happen here, never
// in the browser (lib/coins-server.ts spin). The 2026-10-16 body
// ({ shards: true } or nothing) still works: it pays with shards or a pull.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !coinsEnabledFor(user)) return NextResponse.json({ error: "Sign in to spin" }, { status: 401 });

  const rl = rateLimit(`coins:pull:${user.id}`, 30, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const body = await req.json().catch(() => null);
  const pay: SpinPayment = PAYMENTS.includes(body?.pay) ? body.pay : body?.shards === true ? "shards" : "pull";
  const result = await spin(user.id, pay);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.reason === "cant-pay" ? "Not enough to spin" : "Try again" },
      { status: result.reason === "cant-pay" ? 409 : 503 }
    );
  }
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
