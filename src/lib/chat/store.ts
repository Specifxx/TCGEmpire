// Live chat pilot: the database side (lib/chat/core.ts has the rules). One small table, bounded reads (`take` 50 on an indexed
// room+time), one write per message. The room read is held by the CDN for a few seconds, so the database sees about one read per room per
// poll window however many members watch. Purged lazily: a send deletes rows older than the TTL.
import { prisma } from "../db";
import { CHAT_MODE, CHAT_OFF_KEY, LIMITS, type RoomId } from "./core";

export interface ChatRow {
  id: string;
  name: string;
  body: string;
  at: string;
}

export async function chatOn(): Promise<boolean> {
  if (CHAT_MODE !== "on") return false;
  try {
    return !(await prisma.counter.findUnique({ where: { key: CHAT_OFF_KEY }, select: { value: true } }))?.value;
  } catch {
    return false;
  }
}

export async function readRoom(room: RoomId): Promise<ChatRow[]> {
  const rows = await prisma.chatMessage.findMany({
    where: { room, hidden: false },
    orderBy: { createdAt: "desc" },
    take: LIMITS.readTake,
    select: { id: true, name: true, body: true, createdAt: true },
  });
  return rows.reverse().map((r) => ({ id: r.id, name: r.name, body: r.body, at: r.createdAt.toISOString() }));
}

export async function banProblem(userId: string): Promise<string | null> {
  const b = await prisma.chatBan.findUnique({ where: { userId }, select: { until: true } });
  if (!b) return null;
  if (b.until && b.until.getTime() < Date.now()) return null;
  return "You can't post in chat right now.";
}

export async function postMessage(room: RoomId, userId: string, name: string, body: string): Promise<ChatRow> {
  const r = await prisma.chatMessage.create({ data: { room, userId, name, body }, select: { id: true, createdAt: true } });
  // Lazy purge: roughly one send in twenty clears what is past its life.
  if (Math.random() < 0.05) await prisma.chatMessage.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - LIMITS.ttlMs) } } }).catch(() => undefined);
  return { id: r.id, name, body, at: r.createdAt.toISOString() };
}

/** A report adds one; at the threshold the message is hidden until a moderator looks. Returns false when it does not exist. */
export async function reportMessage(id: string): Promise<boolean> {
  const m = await prisma.chatMessage.findUnique({ where: { id }, select: { reports: true } });
  if (!m) return false;
  const reports = m.reports + 1;
  await prisma.chatMessage.update({ where: { id }, data: { reports, hidden: reports >= LIMITS.autoHideReports } });
  return true;
}
