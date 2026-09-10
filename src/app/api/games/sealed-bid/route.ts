import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCountry } from "@/lib/get-country";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { SbError, cleanName, normalizeSettings, viewFor } from "@/lib/sealed-bid-engine";
import { createRoom, newIdentity } from "@/lib/sealed-bid";

export const dynamic = "force-dynamic";

// POST /api/games/sealed-bid — open a new room. The caller becomes the host.
// Guests are welcome (no account needed): identity is the bearer token we mint
// here, which the client keeps in localStorage per room. A signed-in player's
// userId rides along so their final score reaches the leaderboard.
export async function POST(req: Request) {
  const rl = rateLimit(`sb-create:${clientIp(req)}`, 12, 10 * 60 * 1000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  try {
    const body = (await req.json().catch(() => ({}))) as { name?: unknown; rounds?: unknown; timerSec?: unknown };
    const user = await getCurrentUser();
    const name = cleanName(body.name ?? user?.displayName);
    const host = newIdentity(name, user?.id ?? null);
    const state = await createRoom({ host, country: getCountry(), settings: normalizeSettings(body) });
    return NextResponse.json(
      { code: state.code, token: host.token, pid: host.pid, view: viewFor(state, host.token, Date.now()) },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (e) {
    if (e instanceof SbError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[sealed-bid] create failed", e);
    return NextResponse.json({ error: "Couldn't open a room right now — try again." }, { status: 503 });
  }
}
