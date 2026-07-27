import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { CARRIERS } from "@/lib/tracking";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import {
  shipOrder,
  receiveOrder,
  requestReleaseOrder,
  reportOrder,
  requestCancelOrder,
  withdrawCancelOrder,
  respondCancelOrder,
  sellerRefundOrder,
} from "@/lib/order-actions";

export const dynamic = "force-dynamic";

const schema = z.object({
  action: z.enum(["ship", "receive", "report", "request-release", "request-cancel", "accept-cancel", "decline-cancel", "withdraw-cancel", "refund"]),
  carrier: z.enum(CARRIERS).optional(),
  trackingNumber: z.string().trim().min(3).max(60).optional(),
  tracking: z.string().max(120).optional(), // legacy free-text, kept for backward compatibility
  message: z.string().trim().min(10).max(2000).optional(),
  reason: z.string().trim().min(5).max(300).optional(),
});

// Fulfilment state machine for a single Order row — see lib/order-actions.ts for
// the actual rules (shared with orders/bulk, since one checkout/parcel is often
// several Order rows — one per listing line — and most actions need to apply to
// all of them at once; see orders/route.ts's groupKey).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in" }, { status: 401 });

  const rl = rateLimit(`order-action:${clientIp(req)}:${user.id}`, 30, 3600_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  const { action, carrier, trackingNumber, tracking, message, reason } = parsed.data;

  const result = await (async () => {
    switch (action) {
      case "ship":
        if (!carrier || !trackingNumber) return { ok: false as const, error: "Carrier and tracking number are required", httpStatus: 400 };
        return shipOrder(params.id, user.id, carrier, trackingNumber, tracking);
      case "receive":
        return receiveOrder(params.id, user.id);
      case "request-release":
        return requestReleaseOrder(params.id, user.id);
      case "report":
        if (!message) return { ok: false as const, error: "Please describe the problem", httpStatus: 400 };
        return reportOrder(params.id, user.id, user.email, user.displayName, message);
      case "request-cancel":
        if (!reason) return { ok: false as const, error: "Please give a short reason", httpStatus: 400 };
        return requestCancelOrder(params.id, user.id, user.displayName, reason);
      case "withdraw-cancel":
        return withdrawCancelOrder(params.id, user.id);
      case "accept-cancel":
        return respondCancelOrder(params.id, user.id, true);
      case "decline-cancel":
        return respondCancelOrder(params.id, user.id, false);
      case "refund":
        return sellerRefundOrder(params.id, user.id, reason);
    }
  })();

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.httpStatus });
  return NextResponse.json(result);
}
