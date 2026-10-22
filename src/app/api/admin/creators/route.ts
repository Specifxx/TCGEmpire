import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { SITE_URL } from "@/lib/site";
import { CREATORS } from "@/lib/content/creators";
import { hashEditToken, newEditToken } from "@/lib/creator-edit-token";

export const dynamic = "force-dynamic";

// Makes (or replaces) a creator's private edit link. A new link revokes the old one.
async function isAdmin(req: Request): Promise<boolean> {
  const token = process.env.ADMIN_TOKEN;
  const key = new URL(req.url).searchParams.get("key");
  if (token && key === token) return true;
  return !!(await getCurrentUser())?.isAdmin;
}

export async function POST(req: Request) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { slug?: unknown } | null;
  const slug = typeof body?.slug === "string" ? body.slug : "";
  if (!CREATORS.some((c) => c.slug === slug)) return NextResponse.json({ error: "No such creator." }, { status: 404 });
  const token = newEditToken();
  const editTokenHash = hashEditToken(token);
  await prisma.creatorProfileEdit.upsert({ where: { slug }, create: { slug, editTokenHash }, update: { editTokenHash } });
  return NextResponse.json({ ok: true, url: `${SITE_URL}/creators/edit/${token}` });
}
