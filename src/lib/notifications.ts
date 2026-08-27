import { prisma } from "./db";

// In-app notification center — the one write path for any lifecycle event a
// user should see in the notification bell (see NotificationBell.tsx and
// /api/notifications). Its previous callers were all peer-to-peer marketplace
// order events; the marketplace was removed (2026-08), so nothing calls this
// right now, but the bell/read/unread-count infrastructure is generic and stays
// available for a future in-app event to write to.
//
// Always call this fire-and-forget (.catch(() => {})) exactly like every email
// send in this codebase — a failed notification insert must never fail the
// action that triggered it.
export async function notify(userId: string, type: string, title: string, body: string, href?: string): Promise<void> {
  await prisma.notification.create({
    data: { userId, type, title, body, href: href ?? null },
  });
}
