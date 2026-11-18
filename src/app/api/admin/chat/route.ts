// Moderation for the chat pilot (admin session only, fail closed): hide or restore a message, mute or unmute its author, or switch chat off.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CHAT_OFF_KEY } from "@/lib/chat/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Not authorised" }, { status: 404 });
  if (!(req.headers.get("origin") ?? "").includes(new URL(req.url).host)) return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  const j = (await req.json().catch(() => ({}))) as { action?: string; id?: string; days?: number; reason?: string };
  const id = typeof j.id === "string" ? j.id.slice(0, 40) : "";
  switch (j.action) {
    case "hide":
    case "restore":
      await prisma.chatMessage.update({ where: { id }, data: { hidden: j.action === "hide", ...(j.action === "restore" ? { reports: 0 } : {}) } });
      return NextResponse.json({ ok: true });
    case "mute": {
      const m = await prisma.chatMessage.findUnique({ where: { id }, select: { userId: true } });
      if (!m) return NextResponse.json({ error: "No such message" }, { status: 404 });
      const until = j.days && j.days > 0 ? new Date(Date.now() + Math.min(j.days, 365) * 86400_000) : null;
      await prisma.chatBan.upsert({ where: { userId: m.userId }, create: { userId: m.userId, until, reason: String(j.reason ?? "").slice(0, 200) }, update: { until, reason: String(j.reason ?? "").slice(0, 200) } });
      await prisma.chatMessage.updateMany({ where: { userId: m.userId, hidden: false }, data: { hidden: true } });
      return NextResponse.json({ ok: true });
    }
    case "off":
    case "on":
      await prisma.counter.upsert({ where: { key: CHAT_OFF_KEY }, create: { key: CHAT_OFF_KEY, value: j.action === "off" ? 1 : 0 }, update: { value: j.action === "off" ? 1 : 0 } });
      return NextResponse.json({ ok: true });
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
