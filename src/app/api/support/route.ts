import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { nextNumber } from "@/lib/order-number";
import { sendSupportTicketNotification, sendSupportTicketConfirmation } from "@/lib/support-email";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const CATEGORIES = ["ORDER", "PAYMENT", "ACCOUNT", "SELLER", "OTHER"] as const;

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(200),
  category: z.enum(CATEGORIES).default("OTHER"),
  subject: z.string().trim().min(3).max(150),
  message: z.string().trim().min(10).max(4000),
  orderId: z.string().trim().max(60).optional(),
});

// Public support-ticket intake — emails SUPPORT_EMAIL immediately (no admin login
// needed to be notified) and confirms to the submitter with their ticket number.
export async function POST(req: Request) {
  const ip = clientIp(req);
  const ipLimit = rateLimit(`support:ip:${ip}`, 3, 3600_000);
  if (!ipLimit.ok) return tooManyRequests(ipLimit.retryAfter);

  const user = await getCurrentUser();
  if (user) {
    const userLimit = rateLimit(`support:user:${user.id}`, 5, 86_400_000);
    if (!userLimit.ok) return tooManyRequests(userLimit.retryAfter);
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please fill in all required fields" }, { status: 400 });
  const d = parsed.data;

  const number = await nextNumber("support");
  await prisma.supportTicket.create({
    data: {
      number,
      userId: user?.id ?? null,
      email: d.email,
      name: d.name,
      category: d.category,
      orderId: d.orderId || null,
      subject: d.subject,
      message: d.message,
    },
  });

  const info = { number, name: d.name, email: d.email, category: d.category, subject: d.subject, message: d.message, orderId: d.orderId ?? null };
  await sendSupportTicketNotification(info).catch(() => {});
  await sendSupportTicketConfirmation(info).catch(() => {});

  return NextResponse.json({ ok: true, ticket: `RC-${number}` });
}
