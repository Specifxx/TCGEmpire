// Live chat pilot (docs/chat.md). GET: a room's latest messages, public and held by the CDN for a few seconds (the read never depends on a
// cookie, so every viewer shares one cached copy). POST: one message, signed-in members only.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { LIMITS, checkMessage, chatName, isRoom, rateProblem } from "@/lib/chat/core";
import { banProblem, chatOn, postMessage, readRoom } from "@/lib/chat/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROOM_CACHE = { "Cache-Control": `public, s-maxage=${LIMITS.cacheSeconds}, stale-while-revalidate=${LIMITS.cacheSeconds * 2}` };

export async function GET(req: Request) {
  const room = new URL(req.url).searchParams.get("room");
  if (!isRoom(room)) return NextResponse.json({ error: "Unknown room" }, { status: 400 });
  if (!(await chatOn())) return NextResponse.json({ on: false, messages: [] }, { headers: { "Cache-Control": "public, s-maxage=60" } });
  try {
    return NextResponse.json({ on: true, messages: await readRoom(room) }, { headers: ROOM_CACHE });
  } catch {
    return NextResponse.json({ on: false, messages: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to chat." }, { status: 401 });
  if (!user.emailVerified) return NextResponse.json({ error: "Verify your email to chat." }, { status: 403 });
  if (!(await chatOn())) return NextResponse.json({ error: "Chat is off right now." }, { status: 503 });
  let j: { room?: unknown; body?: unknown };
  try {
    j = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (!isRoom(j.room)) return NextResponse.json({ error: "Unknown room" }, { status: 400 });
  const c = checkMessage(j.body);
  if (!c.ok) return NextResponse.json({ error: c.error }, { status: 400 });
  const wait = rateProblem(user.id);
  if (wait) return NextResponse.json({ error: wait }, { status: 429 });
  try {
    const ban = await banProblem(user.id);
    if (ban) return NextResponse.json({ error: ban }, { status: 403 });
    return NextResponse.json({ message: await postMessage(j.room, user.id, chatName(user.displayName), c.body) });
  } catch {
    return NextResponse.json({ error: "Couldn't send that. Try again." }, { status: 500 });
  }
}
