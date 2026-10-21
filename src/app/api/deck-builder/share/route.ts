import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { listHash, makeShareCode, normaliseShareCode, SHARE_LIST_MAX } from "@/lib/deck-builder";

export const dynamic = "force-dynamic";

// Share a deck from the visual builder: POST {list, title} -> {code}, a six-
// character code for riftcompare.com/d/CODE (lib/deck-builder.ts). The same list
// always gets the same code (DeckShare.listHash). GET ?code= returns the list.
// No account needed; nothing personal is stored.
export async function POST(req: Request) {
  const rl = rateLimit(`deck-share:${clientIp(req)}`, 20, 60 * 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: "Too many shares — try again later" }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { list?: unknown; title?: unknown } | null;
  const list = typeof body?.list === "string" ? body.list.trim() : "";
  if (!list || list.length > SHARE_LIST_MAX) return NextResponse.json({ error: "Nothing to share" }, { status: 400 });
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, 60) || null : null;
  const hash = listHash(list);
  const existing = await prisma.deckShare.findUnique({ where: { listHash: hash }, select: { code: true } });
  if (existing) return NextResponse.json({ code: existing.code });
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = makeShareCode();
    try {
      await prisma.deckShare.create({ data: { code, listHash: hash, list, title } });
      return NextResponse.json({ code });
    } catch (e) {
      // A code collision (or a race on the same list): try again / return the winner.
      const won = await prisma.deckShare.findUnique({ where: { listHash: hash }, select: { code: true } }).catch(() => null);
      if (won) return NextResponse.json({ code: won.code });
      if (attempt === 4) {
        console.error("deck share failed:", e);
        return NextResponse.json({ error: "Couldn't share — try again" }, { status: 500 });
      }
    }
  }
  return NextResponse.json({ error: "Couldn't share — try again" }, { status: 500 });
}

export async function GET(req: Request) {
  const code = normaliseShareCode(new URL(req.url).searchParams.get("code"));
  if (!code) return NextResponse.json({ error: "Not a deck code" }, { status: 400 });
  const row = await prisma.deckShare.findUnique({ where: { code }, select: { list: true, title: true } });
  if (!row) return NextResponse.json({ error: "No deck has that code" }, { status: 404 });
  return NextResponse.json(row, { headers: { "Cache-Control": "public, s-maxage=86400" } });
}
