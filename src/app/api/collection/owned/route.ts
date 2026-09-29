import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { setByCode } from "@/lib/constants";
import { ownedBySet } from "@/lib/set-owned";

export const dynamic = "force-dynamic";

// GET /api/collection/owned?set=OGN — which cards of ONE set the signed-in
// account holds, as {cardId: copies} (any finish and condition).
//
// The set tracker's client overlay reads this (components/SetOwned.tsx, mounted
// on a released /sets/[set] page) instead of the page reading the session: that
// page is force-dynamic with memoised default views shared by every visitor,
// and one cookie read there would break the shared memo and add a per-request
// read for everyone. It follows use-watchlist's pattern: a signed-out visitor is
// known from /api/me and never calls this, a 401 is not an error state.
//
// Authenticated and never cached (no-store): the answer is one account's
// binder. One groupBy scoped by userId, narrow, capped (lib/set-owned.ts).
const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401, headers: NO_STORE });

  const code = new URL(req.url).searchParams.get("set")?.trim().toUpperCase() ?? "";
  if (!code || !setByCode(code)) return NextResponse.json({ error: "Unknown set" }, { status: 400, headers: NO_STORE });

  try {
    const owned = await ownedBySet(prisma, user.id, code);
    return NextResponse.json({ set: code, owned }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "Couldn't load your binder right now — please try again." }, { status: 500, headers: NO_STORE });
  }
}
