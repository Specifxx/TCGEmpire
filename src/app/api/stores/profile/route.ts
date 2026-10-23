import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { SITE_URL } from "@/lib/site";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { notifyOwnerBounded } from "@/lib/ops/notify-owner";
import { planPartnerActive, validateAbout, validatePromo } from "@/lib/store-plan";
import { storeSlug } from "@/lib/store-pages";

export const dynamic = "force-dynamic";

// A Stores plan buyer saves the description and promo shown beside the
// "Verified store" mark on their /stores/<slug> page (lib/store-plan.ts).
// Public text, so the owner is emailed every edit (notifyOwnerBounded), and it
// is plain text rendered escaped — never HTML, never in a comparison row.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const rl = rateLimit(`store-profile:${user.id}`, 10, 60 * 60 * 1000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const subscriptionId = typeof body?.subscriptionId === "string" ? body.subscriptionId.slice(0, 64) : "";
  // Only the account that bought the plan may edit its store's page.
  const plan = subscriptionId
    ? await prisma.storePlanSubscription.findFirst({
        where: { id: subscriptionId, userId: user.id },
        select: { id: true, partnerId: true, activeUntil: true },
      })
    : null;
  if (!plan) return NextResponse.json({ error: "No Stores plan found on this account" }, { status: 404 });
  if (!plan.partnerId) {
    return NextResponse.json({ error: "We haven't confirmed your store yet. You can add this once we have." }, { status: 409 });
  }
  if (!planPartnerActive({ activeUntil: plan.activeUntil }, new Date())) {
    return NextResponse.json({ error: "Your Stores plan has ended." }, { status: 403 });
  }

  const about = validateAbout(body?.about);
  if (!about.ok) return NextResponse.json({ error: about.error }, { status: 400 });
  const promo = validatePromo(body?.promo);
  if (!promo.ok) return NextResponse.json({ error: promo.error }, { status: 400 });

  const partner = await prisma.storePartner.update({
    where: { id: plan.partnerId },
    data: { about: about.value, promo: promo.value, profileUpdatedAt: new Date() },
    select: { name: true, retailer: true },
  });
  const path = `/stores/${storeSlug(partner.retailer)}`;
  revalidatePath(path);

  await notifyOwnerBounded({
    kind: "store-plan",
    headline: `${partner.name} updated their store page`,
    from: user.email,
    fields: [
      ["Store page", `${SITE_URL}${path}`],
      ["Description", about.value ?? "(cleared)"],
      ["Promo", promo.value ?? "(cleared)"],
    ],
  });
  return NextResponse.json({ ok: true, about: about.value, promo: promo.value });
}
