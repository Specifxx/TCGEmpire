import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { CREATORS } from "@/lib/content/creators";
import { validateProfileEdit } from "@/lib/content/creator-edit";
import { hashEditToken } from "@/lib/creator-edit-token";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { notifyOwnerBounded } from "@/lib/ops/notify-owner";

export const dynamic = "force-dynamic";

// A creator saves their own card from their private link (/creators/edit/<token>).
export async function POST(req: Request) {
  const rl = rateLimit(`creator-profile:${clientIp(req)}`, 10, 60 * 60 * 1000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const token = typeof body?.token === "string" ? body.token : "";
  if (!token) return NextResponse.json({ error: "This link isn't valid." }, { status: 404 });
  const row = await prisma.creatorProfileEdit.findUnique({ where: { editTokenHash: hashEditToken(token) }, select: { slug: true } });
  const creator = row && CREATORS.find((c) => c.slug === row.slug);
  if (!creator) return NextResponse.json({ error: "This link isn't valid any more. Ask us for a new one." }, { status: 404 });
  const v = validateProfileEdit(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const e = v.edit;
  await prisma.creatorProfileEdit.update({
    where: { slug: creator.slug },
    data: { blurb: e.blurb, links: JSON.stringify(e.links), tipUrl: e.tipUrl, tags: e.tags.join(","), region: e.region, editedAt: new Date() },
  });
  revalidatePath("/creators");
  await notifyOwnerBounded({
    kind: "creator-profile",
    headline: `${creator.name} updated their creator card`,
    fields: [
      ["Description", e.blurb],
      ["Links", e.links.map((l) => `${l.platform}: ${l.url}`).join(" · ")],
      ["Tip page", e.tipUrl],
      ["Tags", e.tags.join(", ")],
      ["Region", e.region],
    ],
  });
  return NextResponse.json({ ok: true });
}
