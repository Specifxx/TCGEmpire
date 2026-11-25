import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { SITE_URL } from "@/lib/site";
import { giveawayByKey } from "@/lib/giveaway";
import { verifyClaimToken } from "@/lib/giveaway-draw";
import { recordClaim } from "@/lib/giveaway-run";

export const dynamic = "force-dynamic";

// The winner's claim form (/giveaway/claim#t=<token>, lib/giveaway-run.ts). The token names the giveaway and the winning account;
// the address goes to GiveawayClaim (private) and to the owner's inbox, nowhere else.
const noStore = { "Cache-Control": "no-store" };

function field(v: unknown, max: number, required: boolean): string | undefined | null {
  if (typeof v !== "string") return required ? null : undefined;
  const s = v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
  if (!s) return required ? null : undefined;
  return s;
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== SITE_URL && !origin.endsWith("://localhost:3000")) return NextResponse.json({ error: "Not allowed" }, { status: 403, headers: noStore });
  if (!rateLimit(`giveaway-claim:${clientIp(req)}`, 10, 60 * 60_000).ok) return NextResponse.json({ error: "Too many tries. Wait a little." }, { status: 429, headers: noStore });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const t = await verifyClaimToken(b?.token);
  const g = t ? giveawayByKey(t.giveaway) : null;
  if (!t || !g) return NextResponse.json({ error: "This claim link isn't valid or has expired." }, { status: 401, headers: noStore });
  const a = {
    fullName: field(b?.fullName, 120, true),
    line1: field(b?.line1, 200, true),
    line2: field(b?.line2, 200, false),
    city: field(b?.city, 120, true),
    region: field(b?.region, 120, false),
    postcode: field(b?.postcode, 32, true),
    country: field(b?.country, 80, true),
    phone: field(b?.phone, 40, false),
    note: field(b?.note, 500, false),
  };
  if (!a.fullName || !a.line1 || !a.city || !a.postcode || !a.country) {
    return NextResponse.json({ error: "Please fill in your name, street address, city, postcode and country." }, { status: 400, headers: noStore });
  }
  try {
    const r = await recordClaim(g, t.userId, {
      fullName: a.fullName,
      line1: a.line1,
      line2: a.line2 ?? undefined,
      city: a.city,
      region: a.region ?? undefined,
      postcode: a.postcode,
      country: a.country,
      phone: a.phone ?? undefined,
      note: a.note ?? undefined,
    });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status, headers: noStore });
    return NextResponse.json({ ok: true, prize: g.prize }, { headers: noStore });
  } catch (e) {
    console.error("[giveaway] claim failed:", e);
    return NextResponse.json({ error: "Couldn't save that. Please try again, or reply to the email." }, { status: 503, headers: noStore });
  }
}

// GET ?t=<token>: is this link still good, and what did it win (the form shows the prize before asking for an address).
export async function GET(req: Request) {
  const t = await verifyClaimToken(new URL(req.url).searchParams.get("t"));
  const g = t ? giveawayByKey(t.giveaway) : null;
  if (!t || !g) return NextResponse.json({ ok: false }, { status: 401, headers: noStore });
  return NextResponse.json({ ok: true, prize: g.prize, imageUrl: g.imageUrl, title: g.title }, { headers: noStore });
}
