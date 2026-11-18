// Report a chat message (signed-in members). Three reports hide it until a moderator looks (lib/chat/store.ts).
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { chatOn, reportMessage } from "@/lib/chat/store";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to report." }, { status: 401 });
  if (!rateLimit(`chat-report:${user.id}`, 10, 3600_000).ok) return NextResponse.json({ error: "Too many reports." }, { status: 429 });
  if (!(await chatOn())) return NextResponse.json({ error: "Chat is off right now." }, { status: 503 });
  const j = (await req.json().catch(() => ({}))) as { id?: unknown };
  if (typeof j.id !== "string" || j.id.length > 40) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const ok = await reportMessage(j.id).catch(() => false);
  return NextResponse.json({ ok });
}
