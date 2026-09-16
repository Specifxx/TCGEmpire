import { prisma } from "./db";

// In-app notification center — the one write path for any lifecycle event a
// user should see in the notification bell (see NotificationBell.tsx and
// /api/notifications). Its original callers were all peer-to-peer marketplace
// order events; the marketplace was removed (2026-08). Today it's called from
// price-alerts.ts (a watched card drops), premium.ts (trial ending, checkout
// recovery) and release-day.ts (a set you're tracking is live) — one in-app
// mirror per email send, never a substitute for the email itself.
//
// Always call this fire-and-forget (.catch(() => {})) exactly like every email
// send in this codebase — a failed notification insert must never fail the
// action that triggered it.
export async function notify(userId: string, type: string, title: string, body: string, href?: string): Promise<void> {
  await prisma.notification.create({
    data: { userId, type, title, body, href: href ?? null },
  });
}
