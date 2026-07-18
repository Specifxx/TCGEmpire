import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { CARRIERS } from "@/lib/tracking";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import {
  shipOrder,
  receiveOrder,
  requestReleaseOrder,
  reportOrderGroup,
  requestCancelGroup,
  withdrawCancelGroup,
  respondCancelGroup,
} from "@/lib/order-actions";

export const dynamic = "force-dynamic";

const schema = z.object({
  orderIds: z.array(z.string().min(1)).min(1).max(50),
  action: z.enum(["ship", "receive", "report", "request-release", "request-cancel", "accept-cancel", "decline-cancel", "withdraw-cancel"]),
  carrier: z.enum(CARRIERS).optional(),
  trackingNumber: z.string().trim().min(3).max(60).optional(),
  tracking: z.string().max(120).optional(),
  message: z.string().trim().min(10).max(2000).optional(),
  reason: z.string().trim().min(5).max(300).optional(),
});

// Applies one action to every Order row in a "group" (see orders/route.ts's
// groupKey) in one request — a single checkout, or a single seller within a
// multi-seller checkout, still creates one Order row per LISTING LINE, so
// "mark this parcel shipped" or "confirm this delivery" means acting on
// several rows at once.
//
// ship/receive loop per-row (each is an independent Prisma update / its own
// Connect transfer slice of the shared charge — no duplication risk). The
// other actions have a SHARED side-effect (one support ticket, one
// cancellation email, one refund of the group's shared PaymentIntent) and use
// the group-aware helpers in lib/order-actions.ts so that side-effect only
// fires once, not once per line item.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  const rl = rateLimit(`order-action:${clientIp(req)}:${user.id}`, 30, 3600_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  const { orderIds, action, carrier, trackingNumber, tracking, message, reason } = parsed.data;

  if (action === "ship" && (!carrier || !trackingNumber)) {
    return NextResponse.json({ error: "Carrier and tracking number are required" }, { status: 400 });
  }
  if (action === "report" && !message) {
    return NextResponse.json({ error: "Please describe the problem" }, { status: 400 });
  }
  if (action === "request-cancel" && !reason) {
    return NextResponse.json({ error: "Please give a short reason" }, { status: 400 });
  }

  switch (action) {
    case "report": {
      const result = await reportOrderGroup(orderIds, user.id, user.email, user.displayName, message!);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.httpStatus });
      return NextResponse.json(result);
    }
    case "request-cancel": {
      const result = await requestCancelGroup(orderIds, user.id, user.displayName, reason!);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.httpStatus });
      return NextResponse.json(result);
    }
    case "withdraw-cancel": {
      const result = await withdrawCancelGroup(orderIds, user.id);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.httpStatus });
      return NextResponse.json(result);
    }
    case "accept-cancel": {
      const result = await respondCancelGroup(orderIds, user.id, true);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.httpStatus });
      return NextResponse.json(result);
    }
    case "decline-cancel": {
      const result = await respondCancelGroup(orderIds, user.id, false);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.httpStatus });
      return NextResponse.json(result);
    }
  }

  // ship / receive / request-release — loop per row, reporting each one's
  // outcome so the client can show exactly what did and didn't go through.
  const results: { orderId: string; ok: boolean; error?: string }[] = [];
  for (let i = 0; i < orderIds.length; i++) {
    const orderId = orderIds[i]!;
    const result = await (async () => {
      switch (action) {
        case "ship":
          return shipOrder(orderId, user.id, carrier!, trackingNumber!, tracking);
        case "receive":
          return receiveOrder(orderId, user.id);
        case "request-release":
          return requestReleaseOrder(orderId, user.id, i === 0); // one email per group, not per line
      }
    })();
    results.push(result!.ok ? { orderId, ok: true } : { orderId, ok: false, error: result!.error });
  }

  const allOk = results.every((r) => r.ok);
  const firstError = results.find((r) => !r.ok)?.error;
  return NextResponse.json({ ok: allOk, results, error: allOk ? undefined : firstError }, { status: allOk ? 200 : 207 });
}
