import { prisma } from "./db";

// In-app notification center — one call site for every lifecycle event a user
// should see (order sold/purchased/shipped/completed/cancelled, etc). Sits
// alongside the existing email sends in marketplace-email.ts's call sites, not
// instead of them; this is the in-app equivalent of the same events.
//
// Always call this fire-and-forget (.catch(() => {})) exactly like every email
// send in this codebase — a failed notification insert must never fail the
// actual order action that triggered it.
export async function notify(userId: string, type: string, title: string, body: string, href?: string): Promise<void> {
  await prisma.notification.create({
    data: { userId, type, title, body, href: href ?? null },
  });
}
