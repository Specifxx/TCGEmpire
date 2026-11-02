import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { liveRoute } from "@/lib/public-data/live-route";
import { parseDone, STEPS_DONE_KEY } from "@/lib/hq/owner-steps";

export const dynamic = "force-dynamic";

// Empire HQ's Done button (lib/hq/owner-steps.ts): POST { id, done } marks one of
// the owner's queued steps done (or open again). One small OpsSnapshot row holds the
// days. Same dual gate as every other admin mutation: a signed-in admin, or ADMIN_TOKEN.
const ID = /^[a-z0-9][a-z0-9-]{1,63}$/;

async function handlePOST(req: Request) {
  const body = (await req.json().catch(() => null)) as { id?: unknown; done?: unknown; key?: unknown } | null;
  const token = process.env.ADMIN_TOKEN;
  const allowed = (token && body?.key === token) || !!(await getCurrentUser())?.isAdmin;
  if (!allowed) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const id = String(body?.id ?? "");
  if (!ID.test(id)) return NextResponse.json({ error: "Unknown step" }, { status: 400 });
  const row = await prisma.opsSnapshot.findUnique({ where: { key: STEPS_DONE_KEY } });
  const done = parseDone(row?.json);
  if (body?.done === false) delete done[id];
  else done[id] = new Date().toISOString().slice(0, 10);
  const json = { done } as unknown as Prisma.InputJsonValue;
  await prisma.opsSnapshot.upsert({ where: { key: STEPS_DONE_KEY }, create: { key: STEPS_DONE_KEY, json }, update: { json } });
  return NextResponse.json({ ok: true });
}

export const POST = liveRoute(handlePOST);
