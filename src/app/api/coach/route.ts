import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import { notifyOwnerBounded } from "@/lib/ops/notify-owner";
import { COACH_SOURCE, coachMessage, parseCoachRequest } from "@/lib/coach";

export const dynamic = "force-dynamic";

// Deck Coach test (lib/coach.ts): saves one request and tells the inbox. Signed-out
// visitors must leave an email, because the report is emailed. Nothing here calls a model.
function cleanEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().slice(0, 200);
  return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(s) ? s : null;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  const rl = user ? rateLimit(`coach:${user.id}`, 4, 60 * 60_000) : rateLimit(`coach-anon:${clientIp(req)}`, 4, 60 * 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const body = await req.json().catch(() => null);
  if (typeof body?.website === "string" && body.website.trim() !== "") return NextResponse.json({ ok: true });

  const r = parseCoachRequest(body);
  if (!r) return NextResponse.json({ error: "Paste your full deck list (at least a few lines)." }, { status: 400 });
  const email = user ? null : cleanEmail(body?.email);
  if (!user && !email) return NextResponse.json({ error: "Add your email so we can send the report." }, { status: 400 });

  const message = coachMessage(r);
  try {
    await prisma.feedback.create({
      data: { userId: user?.id ?? null, email, message, source: COACH_SOURCE, page: "/coach", consentPublic: false },
    });
    await notifyOwnerBounded({
      kind: "coach",
      headline: `${r.legend ?? "Deck"} · ${r.budget}${r.founder ? " · founder price YES" : ""}`,
      from: user?.email ?? email,
      fields: [["Format", r.format], ["Event", r.event], ["Founder price", r.founder ? "yes" : "no"]],
      body: message,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Couldn't send that right now. Please try again." }, { status: 500 });
  }
}
