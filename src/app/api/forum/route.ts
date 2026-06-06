import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { normalizeSearch } from "@/lib/format";

export const dynamic = "force-dynamic";

const itemSchema = z.object({
  name: z.string().min(1).max(120),
  setCode: z.string().max(8).optional(),
  condition: z.string().max(16).optional(),
  qty: z.number().int().min(1).max(99).optional(),
});

const schema = z.object({
  kind: z.enum(["WTB", "WTS", "DISCUSSION"]),
  title: z.string().min(4, "Add a short title").max(140),
  price: z.union([z.number(), z.string()]).optional(), // seller's asking price (dollars)
  items: z.array(itemSchema).max(60).optional(),
  body: z.string().min(5, "Add a few details").max(4000),
  contact: z.string().max(160).optional(),
  website: z.string().optional(), // honeypot
});

export async function GET(req: Request) {
  const kind = new URL(req.url).searchParams.get("kind");
  const where =
    kind === "WTB" || kind === "WTS" || kind === "DISCUSSION"
      ? { kind, status: "OPEN" }
      : { status: "OPEN" };
  const posts = await prisma.forumPost.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 });
  return NextResponse.json({ posts }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  // Posting requires an account so every listing is tied to a real person.
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Please log in to post a listing." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const d = parsed.data;
  if (d.website) return NextResponse.json({ ok: true }); // honeypot

  const isDiscussion = d.kind === "DISCUSSION";
  const contact = (d.contact ?? "").trim();
  if (!isDiscussion && contact.length < 3) {
    return NextResponse.json({ error: "Add a contact (email or Discord)." }, { status: 400 });
  }

  // Resolve each listed card's current market value server-side (authoritative)
  // and sum them — this is the "recommended" total price.
  let itemsOut: { name: string; setCode: string | null; condition: string | null; qty: number; marketCents: number | null }[] = [];
  let marketCents: number | null = null;
  if (!isDiscussion && d.items?.length) {
    const norms = Array.from(new Set(d.items.map((i) => normalizeSearch(i.name))));
    const cards = await prisma.card.findMany({
      where: { nameNormalized: { in: norms }, isPromo: false },
      select: { nameNormalized: true, lowestPriceCents: true },
      orderBy: { lowestPriceCents: { sort: "asc", nulls: "last" } },
    });
    const priceByNorm = new Map<string, number>();
    for (const c of cards) {
      if (c.lowestPriceCents != null && !priceByNorm.has(c.nameNormalized)) priceByNorm.set(c.nameNormalized, c.lowestPriceCents);
    }
    let sum = 0;
    let anyPriced = false;
    itemsOut = d.items.map((i) => {
      const mc = priceByNorm.get(normalizeSearch(i.name)) ?? null;
      const qty = i.qty ?? 1;
      if (mc != null) { sum += mc * qty; anyPriced = true; }
      return { name: i.name.trim(), setCode: i.setCode?.toUpperCase() || null, condition: i.condition || null, qty, marketCents: mc };
    });
    marketCents = anyPriced ? sum : null;
  }

  const raw = d.price != null ? `${d.price}`.replace(/[^0-9.]/g, "") : "";
  const dollars = raw ? parseFloat(raw) : NaN;
  const priceCents = Number.isFinite(dollars) ? Math.round(dollars * 100) : null;

  const post = await prisma.forumPost.create({
    data: {
      kind: d.kind,
      title: d.title.trim(),
      cardName: null,
      setCode: null,
      condition: null,
      priceCents,
      items: itemsOut.length ? itemsOut : undefined,
      marketCents,
      body: d.body.trim(),
      contact,
      authorName: user.displayName,
      userId: user.id,
    },
  });
  return NextResponse.json({ ok: true, post });
}
