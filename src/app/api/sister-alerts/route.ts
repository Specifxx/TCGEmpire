import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { notifyOwnerBounded } from "@/lib/ops/notify-owner";
import { sendEmail } from "@/lib/email";
import { SISTER_ALERT_KEYS, SISTER_REGIONS, allowedOrigin, corsHeaders, sisterSite } from "@/lib/sister-alerts/sites";
import { buildConfirmEmail, fromFor } from "@/lib/sister-alerts/email";
import { claimMailSlot } from "@/lib/sister-alerts/mail-cap";

export const dynamic = "force-dynamic";

// THE SISTER SITES' "EMAIL ME WHEN IT DROPS BELOW" FORM (2026-11-02, owner:
// one shared alert service). Called cross-origin from the sites in
// lib/sister-alerts/sites.ts only (exact origins, no wildcard). No account:
//   • a new or unconfirmed address gets ONE confirmation email (at most one a
//     day per address, under the service's daily cap) and nothing else until
//     it clicks; an unconfirmed address is removed after a week;
//   • a confirmed address's new alert starts at once.
// Only the site key, product id, region, target and the weekly box are taken
// from the form. The weekly box (unticked by default) also asks for the site's
// weekly biggest-drops email (lib/sister-alerts/digest.ts), on the same opt-in.
// The product's name and link come from the site's own feed at the daily
// check, so nothing a stranger types ever reaches an inbox.

const MAX_ALERTS_PER_ADDRESS = 25;
const CONFIRM_RESEND_MS = 24 * 60 * 60 * 1000;

const schema = z.object({
  site: z.enum(SISTER_ALERT_KEYS),
  productId: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9._:-]+$/),
  region: z.enum(SISTER_REGIONS),
  email: z.string().trim().toLowerCase().email().max(200),
  targetCents: z.number().int().min(1).max(100_000_000),
  weekly: z.boolean().optional(),
});

export function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: allowedOrigin(origin) ? 204 : 403, headers: corsHeaders(origin) });
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = { ...corsHeaders(origin), "Cache-Control": "no-store" };
  const fromSite = allowedOrigin(origin);
  if (!fromSite) return NextResponse.json({ error: "Not allowed" }, { status: 403, headers });
  const rl = rateLimit(`sister-alerts:${clientIp(req)}`, 8, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429, headers: { ...headers, "Retry-After": String(rl.retryAfter) } });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please check the email address and price." }, { status: 400, headers });
  const { site, productId, region, email, targetCents, weekly } = parsed.data;
  // A site may only add alerts for itself.
  if (site !== fromSite.key) return NextResponse.json({ error: "Not allowed" }, { status: 403, headers });
  const rlEmail = rateLimit(`sister-alerts:e:${email}`, 10, 60 * 60_000);
  if (!rlEmail.ok) return NextResponse.json({ error: "Too many alerts for this address just now." }, { status: 429, headers });

  try {
    const existing = await prisma.sisterAlertAddress.findUnique({ where: { email }, select: { token: true, confirmedAt: true, confirmSentAt: true } });
    const address =
      existing ??
      (await prisma.sisterAlertAddress.create({ data: { email, token: randomBytes(24).toString("base64url") }, select: { token: true, confirmedAt: true, confirmSentAt: true } }));

    const count = await prisma.sisterAlert.count({ where: { email } });
    const already = await prisma.sisterAlert.findUnique({ where: { email_site_productId_region: { email, site, productId, region } }, select: { id: true } });
    if (!already && count >= MAX_ALERTS_PER_ADDRESS) {
      return NextResponse.json({ error: `You already have ${MAX_ALERTS_PER_ADDRESS} price alerts. Stop one from an alert email to add another.` }, { status: 409, headers });
    }
    if (already) {
      // A new target re-arms the alert.
      await prisma.sisterAlert.update({ where: { id: already.id }, data: { targetCents, lastNotifiedCents: null } });
    } else {
      await prisma.sisterAlert.create({ data: { email, site, productId, region, targetCents } });
    }
    // Only a ticked box subscribes; an unticked one never unsubscribes (the email's own links do).
    if (weekly === true) {
      await prisma.sisterDigest.upsert({ where: { email_site: { email, site } }, create: { email, site, region }, update: { region } });
    }

    if (address.confirmedAt) return NextResponse.json({ ok: true, status: "active" }, { headers });

    const now = new Date();
    const due = !address.confirmSentAt || now.getTime() - address.confirmSentAt.getTime() > CONFIRM_RESEND_MS;
    if (due && (await claimMailSlot(prisma, now))) {
      const mail = buildConfirmEmail(site, address.token, targetCents, region, weekly === true);
      const sent = await sendEmail(email, mail.subject, mail.html, { text: mail.text, from: fromFor(sisterSite(site)!) });
      if (sent) await prisma.sisterAlertAddress.update({ where: { email }, data: { confirmSentAt: now } });
    }
    if (!existing) {
      await notifyOwnerBounded({ kind: "sister-alert", headline: `New price alert on ${fromSite.name}`, fields: [["Site", fromSite.name], ["Region", region], ["Product", productId]] });
    }
    return NextResponse.json({ ok: true, status: "confirm" }, { headers });
  } catch (e) {
    console.warn("[sister-alerts] signup failed:", e);
    return NextResponse.json({ error: "Couldn't save your alert. Please try again." }, { status: 503, headers });
  }
}
