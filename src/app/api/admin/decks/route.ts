import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PUBLISHED_DECKS_TAG, checkPublishText } from "@/lib/published-decks";
import { publishDeck } from "@/lib/published-decks-server";

export const dynamic = "force-dynamic";

// Admin-only deck import and moderation (/admin/decks, 2026-09-26). The owner
// adds tournament lists they have the right to publish as JSON:
//   [{ "title": "…", "list": "1 Jinx, Loose Cannon\n3 …", "author": "Player, Event",
//      "description": "…", "legendCardId": "…" }]
// Each item goes through the same resolution and checks as a player's publish.
// { "action": "hide" | "show", "id": "…" } moderates a deck.
async function isAdmin(req: Request): Promise<boolean> {
  const token = process.env.ADMIN_TOKEN;
  const key = new URL(req.url).searchParams.get("key");
  if (token && key === token) return true;
  return !!(await getCurrentUser())?.isAdmin;
}

export async function POST(req: Request) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => null);

  if (body?.action === "hide" || body?.action === "show") {
    const id = typeof body.id === "string" ? body.id : "";
    const row = await prisma.publishedDeck.update({
      where: { id },
      data: { status: body.action === "hide" ? "hidden" : "live" },
      select: { slug: true, legendSlug: true },
    }).catch(() => null);
    if (!row) return NextResponse.json({ error: "No such deck." }, { status: 404 });
    revalidatePath("/decks");
    revalidateTag(PUBLISHED_DECKS_TAG);
    revalidatePath(`/decks/${row.slug}`);
    revalidatePath(`/decks/legend/${row.legendSlug}`);
    return NextResponse.json({ ok: true });
  }

  const items: unknown[] = Array.isArray(body?.decks) ? body.decks : Array.isArray(body) ? body : [];
  if (!items.length || items.length > 50) return NextResponse.json({ error: "Send 1–50 decks as a JSON array." }, { status: 400 });
  const results: { title: string; ok: boolean; slug?: string; error?: string }[] = [];
  for (const raw of items) {
    const it = (raw ?? {}) as Record<string, unknown>;
    const text = checkPublishText(it.title, it.description);
    if (!text.ok) {
      results.push({ title: String(it.title ?? ""), ok: false, error: text.error });
      continue;
    }
    const res = await publishDeck({
      title: text.title,
      description: text.description,
      text: typeof it.list === "string" ? it.list : "",
      legendCardId: typeof it.legendCardId === "string" ? it.legendCardId : null,
      userId: null,
      authorName: typeof it.author === "string" ? it.author.trim().slice(0, 80) || null : null,
      source: "import",
    }).catch(() => ({ ok: false as const, error: "Import failed." }));
    results.push(res.ok ? { title: text.title, ok: true, slug: res.slug } : { title: text.title, ok: false, error: res.error });
    if (res.ok) revalidatePath(`/decks/legend/${res.legendSlug}`);
  }
  revalidatePath("/decks");
  revalidateTag(PUBLISHED_DECKS_TAG);
  return NextResponse.json({ ok: true, results });
}
