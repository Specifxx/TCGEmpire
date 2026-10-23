import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { stripe, stripeEnabled } from "@/lib/stripe";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

// Open the Stripe Billing customer portal so a Premium member can update their card,
// see invoices, or cancel (essential for the trial — people must be able to
// cancel before the charge the reminder warns of). Requires the Customer Portal to be enabled once in
// the Stripe dashboard; until then this returns a clear error and the UI falls back
// to the "manage via your receipt email / contact us" path.
// Where the portal's "return" link goes: /premium, or /stores/account for a
// Stores plan buyer (the only other page with this button). A fixed allow-list,
// never a URL from the request.
const RETURN_PATHS = new Set(["/premium", "/stores/account"]);

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { back?: unknown } | null;
  const back = typeof body?.back === "string" && RETURN_PATHS.has(body.back) ? body.back : "/premium";
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!stripeEnabled()) {
    return NextResponse.json({ error: "Billing isn't configured yet" }, { status: 503 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { stripeCustomerId: true },
  });
  if (!dbUser?.stripeCustomerId) {
    return NextResponse.json({ error: "No subscription found on this account" }, { status: 400 });
  }

  try {
    const session = await stripe().billingPortal.sessions.create({
      customer: dbUser.stripeCustomerId,
      return_url: `${SITE_URL}${back}`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("billing portal failed:", e);
    return NextResponse.json(
      { error: "Couldn't open the billing portal — you can also cancel from your Stripe receipt email or contact us." },
      { status: 500 },
    );
  }
}
