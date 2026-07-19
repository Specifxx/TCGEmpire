import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Lightweight poll target for the navbar bell badge — a single indexed count,
// not the full feed (see /api/notifications for that).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ unreadCount: 0 });

  const unreadCount = await prisma.notification.count({ where: { userId: user.id, readAt: null } });
  return NextResponse.json({ unreadCount });
}
