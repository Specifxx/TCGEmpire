import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const schema = z.object({
  kind: z.enum(["WTB", "WTS"]),
  title: z.string().min(4, "Add a short title").max(140),
  cardName: z.string().max(120).optional(),
  setCode: z.string().max(8).optional(),
  condition: z.string().max(16).optional(),
  // Price in dollars (string or number); stored as cents.
  price: z.union([z.number(), z.string()]).optional(),
  body: z.string().min(5, "Add a few details").max(4000),
  contact: z.string().min(3, "Add a contact (email or Discord)").max(160),
  authorName: z.string().min(1, "Add your name").max(60),
  website: z.string().optional(), // honeypot — bots fill it, humans don't
});

export async function GET(req: Request) {
  const kind = new URL(req.url).searchParams.get("kind");
  const where =
    kind === "WTB" || kind === "WTS" ? { kind, status: "OPEN" } : { status: "OPEN" };
  const posts = await prisma.forumPost.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ posts }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const d = parsed.data;
  if (d.website) return NextResponse.json({ ok: true }); // honeypot tripped — drop silently

  const raw = d.price != null ? `${d.price}`.replace(/[^0-9.]/g, "") : "";
  const dollars = raw ? parseFloat(raw) : NaN;
  const priceCents = Number.isFinite(dollars) ? Math.round(dollars * 100) : null;

  const user = await getCurrentUser();
  const post = await prisma.forumPost.create({
    data: {
      kind: d.kind,
      title: d.title.trim(),
      cardName: d.cardName?.trim() || null,
      setCode: d.setCode?.trim().toUpperCase() || null,
      condition: d.condition?.trim() || null,
      priceCents,
      body: d.body.trim(),
      contact: d.contact.trim(),
      authorName: d.authorName.trim(),
      userId: user?.id ?? null,
    },
  });
  return NextResponse.json({ ok: true, post });
}
