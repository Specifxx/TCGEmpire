import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { COUNTRY_LIST } from "@/lib/country";

export const dynamic = "force-dynamic";

// Persists the signed-in account's remembered market (User.preferredCountry —
// see the schema comment). Called by CountryProvider whenever a signed-in
// visitor's effective country changes, either from an explicit switcher pick
// or a one-time backfill of their first-resolved market. This is what lets a
// signed-in user land on their real market on a new device/session even when
// IP-geo detection (x-vercel-ip-country) can no longer see their real IP —
// e.g. once traffic is proxied through a third-party CDN in front of Vercel.
const CODES = COUNTRY_LIST.map((c) => c.code) as [string, ...string[]];
const schema = z.object({ country: z.enum(CODES) });

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid country" }, { status: 400 });

  await prisma.user.update({
    where: { id: user.id },
    data: { preferredCountry: parsed.data.country },
  });
  return NextResponse.json({ ok: true });
}
