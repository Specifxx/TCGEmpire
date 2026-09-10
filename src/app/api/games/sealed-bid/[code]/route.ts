import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { normalizeCountry } from "@/lib/country";
import {
  SbError,
  appraise,
  bid,
  cleanName,
  join,
  leave,
  setNextCode,
  shareText,
  start,
  viewFor,
} from "@/lib/sealed-bid-engine";
import { createRoom, dealRounds, mutateRoom, newIdentity, normalizeCode, pollRoom } from "@/lib/sealed-bid";

export const dynamic = "force-dynamic";

// The bearer token identifies the player. Header first (what the client sends),
// query fallback so a plain link can carry it when needed.
function tokenOf(req: Request): string | null {
  const h = req.headers.get("x-sb-token");
  if (h) return h;
  return new URL(req.url).searchParams.get("t");
}

function fail(e: unknown): NextResponse {
  if (e instanceof SbError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("[sealed-bid]", e);
  return NextResponse.json({ error: "Something went wrong — try again." }, { status: 500 });
}

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

// GET /api/games/sealed-bid/:code — the poll. Advances the room's clock,
// refreshes presence, returns what THIS player may see.
export async function GET(req: Request, { params }: { params: { code: string } }) {
  try {
    const code = normalizeCode(params.code);
    const token = tokenOf(req);
    const { state, now } = await pollRoom(code, token);
    const view = viewFor(state, token, now);
    const share = token && state.phase === "over" && view.you ? shareText(state, view.you.pid) : null;
    return NextResponse.json({ view, share }, { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}

type Action =
  | { action: "join"; name?: unknown }
  | { action: "leave" }
  | { action: "start" }
  | { action: "bid"; card: unknown; amount: unknown; surge?: unknown }
  | { action: "appraise"; card: unknown }
  | { action: "rematch" };

// POST /api/games/sealed-bid/:code — every in-room action. Each one is a pure
// engine transition applied under optimistic concurrency (see mutateRoom).
export async function POST(req: Request, { params }: { params: { code: string } }) {
  const rl = rateLimit(`sb-act:${clientIp(req)}`, 120, 60 * 1000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  try {
    const code = normalizeCode(params.code);
    const body = (await req.json().catch(() => ({}))) as Partial<Action>;
    let token = tokenOf(req);

    if (body.action === "join") {
      const user = await getCurrentUser();
      const name = cleanName((body as { name?: unknown }).name ?? user?.displayName);
      const id = newIdentity(name, user?.id ?? null);
      const { after } = await mutateRoom(code, (s, now) => join(s, id, now));
      const me = after.players.find((p) => p.pid === id.pid);
      if (!me) throw new SbError("Couldn't join that room.", 409);
      token = id.token;
      return NextResponse.json(
        { token: id.token, pid: id.pid, view: viewFor(after, token, Date.now()) },
        { headers: NO_STORE }
      );
    }

    if (!token) throw new SbError("You're not in this room — join it first.", 403);

    let share: string | null = null;
    const { after } = await mutateRoom(code, async (s, now) => {
      switch (body.action) {
        case "leave":
          return leave(s, token!, now);
        case "start": {
          // Deal from the live database for the room's market. Done inside the
          // transform so a lost race re-deals against the fresh state rather than
          // starting a room that someone else already started.
          const host = s.players.find((p) => p.token === token);
          if (!host || host.pid !== s.hostPid) throw new SbError("Only the host can start the game.", 403);
          if (s.phase !== "lobby") throw new SbError("The game has already started.", 409);
          const dealt = await dealRounds(normalizeCountry(s.country), s.settings.rounds);
          return start(s, token!, dealt, now);
        }
        case "bid":
          return bid(s, token!, body as { card: unknown; amount: unknown; surge?: unknown }, now);
        case "appraise":
          return appraise(s, token!, (body as { card: unknown }).card, now);
        case "rematch": {
          // Host opens a fresh room with the same settings + market; the old
          // room's final screen then shows a "join the rematch" button to everyone.
          const host = s.players.find((p) => p.token === token);
          if (!host || host.pid !== s.hostPid) throw new SbError("Only the host can open a rematch.", 403);
          if (s.phase !== "over") throw new SbError("Finish this game first.", 409);
          if (s.nextCode) return s;
          const fresh = await createRoom({
            host: { token: host.token, pid: host.pid, name: host.name, userId: host.userId },
            country: normalizeCountry(s.country),
            settings: s.settings,
          });
          return setNextCode(s, token!, fresh.code);
        }
        default:
          throw new SbError("Unknown action.");
      }
    });
    const now = Date.now();
    const view = viewFor(after, token, now);
    if (after.phase === "over" && view.you) share = shareText(after, view.you.pid);
    return NextResponse.json({ view, share }, { headers: NO_STORE });
  } catch (e) {
    return fail(e);
  }
}
