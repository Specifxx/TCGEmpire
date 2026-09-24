import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { SITE_URL } from "@/lib/site";
import { getCachedRisingCards, type RiseScope } from "@/lib/rise-predictor";
import { generateRisingTitle, toSnapshotData } from "@/lib/rising-snapshot";
import { COUNTRIES } from "@/lib/country";

export const dynamic = "force-dynamic";

// Mints a public, frozen copy of the Rising Cards screener — see the doc comment
// on model RisingSnapshot in prisma/schema.prisma for why a snapshot rather than
// a public live page.
//
// DUAL GATE (logged-in admin OR ?key=ADMIN_TOKEN), matching every /admin PAGE
// and the store-partners route this is modelled on. The mismatch that shape
// exists to avoid: a form on a page reached by ADMIN_TOKEN 403ing against its
// own API.
const scopeSchema = z.union([z.literal("GLOBAL"), z.enum(Object.keys(COUNTRIES) as [string, ...string[]])]);

const schema = z.object({
  scope: scopeSchema.default("GLOBAL"),
  key: z.string().optional(),
});

function authed(user: { isAdmin: boolean } | null, suppliedKey: string | undefined) {
  const token = process.env.ADMIN_TOKEN;
  return (!!token && suppliedKey === token) || !!user?.isAdmin;
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!authed(user, new URL(req.url).searchParams.get("key") ?? undefined)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  // Newest first, capped — this is a management list, not an archive browser.
  const rows = await prisma.risingSnapshot.findMany({
    orderBy: { createdAt: "desc" },
    take: 25,
    select: { id: true, token: true, scope: true, title: true, createdAt: true },
  });
  return NextResponse.json({
    snapshots: rows.map((r) => ({ ...r, url: `${SITE_URL}/rising/${r.token}` })),
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const user = await getCurrentUser();
  if (!authed(user, body?.key)) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ error: "invalid scope" }, { status: 400 });
  const scope = parsed.data.scope as RiseScope;

  // The SAME cached analysis /tools/rising and the admin page read — minting a
  // snapshot must never trigger a second copy of the 400-card × price-history
  // scan under its own cache key (see the egress rules at the top of lib/db.ts,
  // and the nested-cache rule: getCachedRisingCards caches itself, so it is
  // called directly and never wrapped).
  const analysis = await getCachedRisingCards(scope);
  const now = new Date();
  const data = toSnapshotData(analysis, scope, now);

  // An empty run is still mintable, deliberately. The screener legitimately has
  // nothing to show while price history is still building, and a link that says
  // so honestly is more useful than a 400 that leaves the admin guessing whether
  // the feature broke. generateRisingTitle has a branch for exactly this.
  const snapshot = await prisma.risingSnapshot.create({
    data: {
      token: randomBytes(24).toString("base64url"),
      scope,
      title: generateRisingTitle(data, now),
      data: data as unknown as object,
    },
  });

  return NextResponse.json({
    ok: true,
    title: snapshot.title,
    url: `${SITE_URL}/rising/${snapshot.token}`,
    picks: data.picks.length,
  });
}
