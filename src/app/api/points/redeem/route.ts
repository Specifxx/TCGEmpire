import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import { getPointsState, redeemReward } from "@/lib/points";

export const dynamic = "force-dynamic";

const schema = z.object({
  rewardKey: z.string().min(1).max(64),
  note: z.string().max(500).optional(),
});

// Spend Shards on a reward from the catalogue.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  // Light throttle so a misbehaving client can't hammer redemptions.
  const rl = rateLimit(`points:redeem:${user.id}`, 15, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const result = await redeemReward(user.id, parsed.data.rewardKey, parsed.data.note);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const state = await getPointsState(user.id);
  return NextResponse.json({ ok: true, status: result.status, state });
}
