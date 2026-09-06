import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Admin-only moderation for the feedback / review queue. Same dual gate as the
// other admin mutations (logged-in admin OR ADMIN_TOKEN via ?key=), so it works
// from either an admin session or a key link — see
// /api/admin/store-suggestions, which this mirrors.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && body?.key === token;
  const user = await getCurrentUser();
  if (!(keyOk || user?.isAdmin)) {
    return NextResponse.json({ error: "Not authorised" }, { status: 404 });
  }

  const id = typeof body?.id === "string" ? body.id : "";
  const action = body?.action;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    if (action === "delete") {
      await prisma.feedback.delete({ where: { id } });
    } else if (action === "approve") {
      // CONSENT IS ENFORCED HERE, not just in the UI. Approving publishes
      // someone's words under their name on a public page; the only thing that
      // makes that OK is that they ticked the box asking for it. A UI-only
      // check would be one careless render away from publishing feedback from
      // someone who never agreed to it, so the server refuses outright.
      const row = await prisma.feedback.findUnique({ where: { id }, select: { consentPublic: true } });
      if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (!row.consentPublic) {
        return NextResponse.json(
          { error: "This submitter did not consent to public display — it cannot be approved as a review." },
          { status: 400 }
        );
      }
      await prisma.feedback.update({
        where: { id },
        data: { status: "APPROVED", publishedAt: new Date() },
      });
    } else if (action === "hide" || action === "spam" || action === "reopen") {
      const status = action === "hide" ? "HIDDEN" : action === "spam" ? "SPAM" : "NEW";
      await prisma.feedback.update({
        where: { id },
        // Clearing publishedAt on un-approve is what actually removes it from
        // the public list (see lib/reviews.ts) rather than leaving a stale
        // "published" timestamp on something now hidden.
        data: { status, publishedAt: null },
      });
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
