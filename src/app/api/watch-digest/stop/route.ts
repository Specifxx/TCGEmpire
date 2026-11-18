import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/site";

// Stop the weekly watched-cards email by its token (lib/watch-digest.ts): the email's one-click List-Unsubscribe POST, and
// the button on /watch-digest/stop. POST only: a link scanner's GET never stops anything. Idempotent.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("t") ?? "";
  const row = token ? await prisma.watchDigestSub.findUnique({ where: { token }, select: { optedOutAt: true } }).catch(() => null) : null;
  if (row && !row.optedOutAt) await prisma.watchDigestSub.update({ where: { token }, data: { optedOutAt: new Date() } });
  // A form post from the page goes back to it; the one-click POST gets a plain answer.
  const body = await req.text().catch(() => "");
  const fromPage = (req.headers.get("content-type") ?? "").includes("application/x-www-form-urlencoded") && !body.includes("List-Unsubscribe");
  if (fromPage) {
    return NextResponse.redirect(`${SITE_URL}/watch-digest/stop?t=${encodeURIComponent(token)}&done=${row ? 1 : 0}`, 303);
  }
  return NextResponse.json({ ok: Boolean(row) }, { status: row ? 200 : 400 });
}
