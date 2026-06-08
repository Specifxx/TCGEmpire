import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { equipCosmetic, getPointsState } from "@/lib/points";

export const dynamic = "force-dynamic";

const schema = z.object({
  slot: z.enum(["flair", "badge"]),
  // null clears the slot (un-equip).
  rewardKey: z.string().min(1).max(64).nullable(),
});

// Equip or clear an owned flair/badge cosmetic.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const result = await equipCosmetic(user.id, parsed.data.slot, parsed.data.rewardKey);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  const state = await getPointsState(user.id);
  return NextResponse.json({ ok: true, state });
}
