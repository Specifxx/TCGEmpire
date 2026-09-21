import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { stripe, stripeEnabled } from "@/lib/stripe";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import { SITE_URL, SITE_NAME } from "@/lib/site";
import {
  CONSULT_PRICE_CENTS,
  CONSULT_CURRENCY,
  CONSULT_DURATION_MIN,
  validateConsultBooking,
} from "@/lib/consulting";

export const dynamic = "force-dynamic";

// Book a paid store consulting session (/stores/consulting).
//
// ONE FLOW, NOT TWO. The store fills in the form and lands on Stripe's hosted
// Checkout — no "we'll send you an invoice, pay it later" round trip, which is
// where a two-hundred-dollar B2B sale goes to die. They still get a real tax
// invoice, because `invoice_creation` below makes Stripe generate a numbered
// invoice PDF for this one-off payment: seamless to buy, and still something
// their bookkeeper accepts.
//
// THE BOOKING ROW IS WRITTEN FIRST, `pending`. Only the webhook flips it to
// paid (api/marketplace/stripe/webhook). See the model comment in
// schema.prisma: a store that abandons Checkout still leaves the one record
// that a real store got that far, which is the most useful signal this product
// has while it is new.
export async function POST(req: Request) {
  const ip = clientIp(req);
  // 5/hour/IP. Generous for a human booking one session, tight enough that this
  // can't be used to spray Stripe sessions.
  const rl = rateLimit(`consult-book:${ip}`, 5, 60 * 60 * 1000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  if (!stripeEnabled()) {
    return NextResponse.json(
      { error: "Booking isn't available right now — please email us instead." },
      { status: 503 }
    );
  }

  const parsed = validateConsultBooking(await req.json().catch(() => null));
  if (!parsed.ok || !parsed.value) {
    return NextResponse.json({ error: parsed.error ?? "Please check the form." }, { status: 400 });
  }
  const v = parsed.value;

  let bookingId: string;
  try {
    const booking = await prisma.consultBooking.create({
      data: {
        storeName: v.storeName,
        storeUrl: v.storeUrl,
        contactName: v.contactName,
        email: v.email,
        country: v.country,
        goals: v.goals || null,
        preferredTimes: v.preferredTimes || null,
        // Recorded at booking time and never read back from lib/consulting.ts,
        // so a later price change can't rewrite what this store was charged.
        amountCents: CONSULT_PRICE_CENTS,
        currency: CONSULT_CURRENCY,
        ip,
      },
      select: { id: true },
    });
    bookingId = booking.id;
  } catch (e) {
    console.error("consult booking create failed:", e);
    return NextResponse.json({ error: "Couldn't start the booking — please try again." }, { status: 500 });
  }

  try {
    const session = await stripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          // Inline price_data rather than a Dashboard Price object: nothing has
          // to be created in Stripe before this page can take money, and the
          // amount stays in one place (lib/consulting.ts) instead of being
          // half here and half in the Stripe UI where the two can disagree.
          price_data: {
            currency: CONSULT_CURRENCY,
            unit_amount: CONSULT_PRICE_CENTS,
            product_data: {
              name: `${SITE_NAME} store consulting — ${CONSULT_DURATION_MIN} minutes`,
              description:
                "A one-to-one session on where your store sits in the Riftbound market: pricing, competitive position and what to stock. Includes your private repricing report.",
            },
          },
        },
      ],
      customer_email: v.email,
      // A customer object is required for Stripe to attach an invoice to the
      // payment — without it, `invoice_creation` silently produces nothing.
      customer_creation: "always",
      // THE INVOICE. A numbered, downloadable tax invoice for a one-off
      // payment, which is the thing a store's bookkeeper actually needs and the
      // reason this isn't just a payment link.
      invoice_creation: {
        enabled: true,
        invoice_data: {
          description: `${SITE_NAME} store consulting session — ${v.storeName}`,
          metadata: { bookingId, storeName: v.storeName },
          footer: `Questions about this invoice? Reply to the confirmation email from ${SITE_NAME}.`,
        },
      },
      // Both required for a compliant invoice: an address to bill, and the
      // buyer's own tax number (ABN/GST/VAT) printed on it when they have one.
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      client_reference_id: bookingId,
      // `kind` is what the shared webhook switches on — see its own comment for
      // why every Stripe event for this account lands on one endpoint.
      metadata: { kind: "store_consult", bookingId, storeName: v.storeName },
      payment_intent_data: {
        // Session metadata does NOT propagate to the PaymentIntent, and a
        // refund/dispute is investigated from the PaymentIntent, not the
        // session. Same lesson the premium subscription path learned.
        metadata: { kind: "store_consult", bookingId },
        description: `Store consulting — ${v.storeName}`,
      },
      success_url: `${SITE_URL}/stores/consulting/confirmed?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/stores/consulting?cancelled=1`,
      allow_promotion_codes: true,
    });

    // Link the session to the booking now, so the confirmation page can match
    // the two even if the webhook is slow (it still owns marking it paid).
    await prisma.consultBooking
      .update({ where: { id: bookingId }, data: { stripeSessionId: session.id } })
      .catch(() => {});

    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("consult checkout failed:", e);
    // The booking row stays `pending` — it is still the record that this store
    // tried, and the owner can follow up by hand from /admin/consulting.
    return NextResponse.json(
      { error: "Couldn't reach the payment page — please try again in a moment." },
      { status: 500 }
    );
  }
}
