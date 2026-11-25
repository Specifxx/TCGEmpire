import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import { notifyOwnerBounded } from "@/lib/ops/notify-owner";
import { CHECKUP_SOURCE, checkupCors, checkupMessage, checkupSiteFor, parseCheckup } from "@/lib/checkup";

export const dynamic = "force-dynamic";

// Collection check-up test (lib/checkup.ts). Same-origin from Rift's binder (signed in), or
// cross-origin from MTG Compare / OP Compare / DexCompare's exact origins with an email.
// Saves one private Feedback row and tells the inbox. Never calls a model.
function cleanEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().slice(0, 200);
  return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(s) ? s : null;
}

export function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: checkupCors(req.headers.get("origin")) });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const cors = checkupCors(origin);
  const sister = checkupSiteFor(origin);
  const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: cors });

  // A sister's request never reads Rift's session; Rift's own binder always does.
  const user = sister ? null : await getCurrentUser();
  if (!sister && !user) return json({ error: "Sign in first." }, 401);

  const rl = rateLimit(user ? `checkup:${user.id}` : `checkup-anon:${clientIp(req)}`, 3, 60 * 60_000);
  if (!rl.ok) {
    const r = tooManyRequests(rl.retryAfter);
    for (const [k, v] of Object.entries(cors)) r.headers.set(k, v);
    return r;
  }

  const body = await req.json().catch(() => null);
  if (typeof body?.website === "string" && body.website.trim() !== "") return json({ ok: true });
  const r = parseCheckup(body);
  if (!r) return json({ error: "A check-up needs at least 10 saved items." }, 400);
  const email = user ? null : cleanEmail(body?.email);
  if (!user && !email) return json({ error: "Add your email so we can send the check-up." }, 400);

  const site = sister ?? "riftcompare";
  const message = checkupMessage(site, r);
  try {
    await prisma.feedback.create({
      data: { userId: user?.id ?? null, email, message, source: CHECKUP_SOURCE, page: "/checkup", site, consentPublic: false },
    });
    await notifyOwnerBounded({
      kind: "checkup",
      headline: `${site} · ${r.items.length} items${r.founder ? " · founder price YES" : ""}`,
      from: user?.email ?? email,
      fields: [["Site", site], ["Items", String(r.items.length)], ["Founder price", r.founder ? "yes" : "no"]],
      body: message,
    });
    return json({ ok: true });
  } catch {
    return json({ error: "Couldn't send that right now. Please try again." }, 500);
  }
}
