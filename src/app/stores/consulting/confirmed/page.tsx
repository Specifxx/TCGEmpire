import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { stripe, stripeEnabled } from "@/lib/stripe";
import { NavIcon } from "@/components/NavIcon";
import { CONTACT_EMAIL } from "@/lib/site";
import { CONSULT_DURATION_MIN, CONSULT_REPLY_HOURS, CONSULT_SCHEDULING_URL } from "@/lib/consulting";

// Where Stripe sends a store back after paying for a consulting session.
//
// THIS PAGE CONFIRMS, IT DOES NOT RECORD. The booking is marked paid by the
// webhook (api/marketplace/stripe/webhook), never here — a success_url is
// attacker-reachable, so anything that trusted it could be triggered by anyone
// pasting a URL. What this page does is re-read the named session from Stripe
// and check it is genuinely a paid store_consult session before saying so.
//
// It deliberately shows only what the buyer themselves typed (their store name)
// and no contact details or amounts beyond the receipt Stripe already emailed —
// there is no account to authenticate against here, so the page reveals nothing
// that the session id itself doesn't already imply.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your consulting session is booked",
  robots: { index: false, follow: false },
};

export default async function ConsultConfirmedPage({
  searchParams,
}: {
  searchParams: { session_id?: string };
}) {
  const sessionId = (searchParams.session_id ?? "").trim();
  if (!sessionId || !stripeEnabled()) redirect("/stores/consulting");

  let storeName = "";
  let paid = false;
  try {
    const s = await stripe().checkout.sessions.retrieve(sessionId);
    if (s.metadata?.kind !== "store_consult") redirect("/stores/consulting");
    storeName = s.metadata?.storeName ?? "";
    // `unpaid` here means a delayed payment method that hasn't settled — real,
    // and worth telling them honestly rather than claiming a booking that may
    // still fail. The webhook's own async_payment_succeeded event finishes it.
    paid = s.payment_status === "paid" || s.payment_status === "no_payment_required";
  } catch (e) {
    // redirect() throws a control-flow signal that must not be swallowed here.
    if (e && typeof e === "object" && "digest" in e && String((e as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
    redirect("/stores/consulting");
  }

  return (
    <div className="mx-auto max-w-lg py-10">
      <div className="card-surface p-6 text-center sm:p-8">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-500/15 text-brand-400">
          <NavIcon name={paid ? "collection" : "calendar"} className="h-6 w-6" />
        </span>

        {paid ? (
          <>
            <h1 className="mt-4 font-display text-2xl font-extrabold text-white">
              Booked{storeName ? ` — ${storeName}` : ""}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Payment went through and your {CONSULT_DURATION_MIN}-minute session is locked in. A
              confirmation with your tax invoice is on its way to the email you used at checkout.
            </p>

            <div className="mt-5 rounded-xl border border-ink-700 bg-ink-950/50 p-4 text-left">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">What happens next</p>
              {CONSULT_SCHEDULING_URL ? (
                <>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">
                    Pick a time that suits you — the calendar has everything that&apos;s open.
                  </p>
                  <a href={CONSULT_SCHEDULING_URL} className="btn-primary mt-3 inline-block text-sm">
                    Pick your time →
                  </a>
                </>
              ) : (
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  We&apos;ll email you within {CONSULT_REPLY_HOURS} hours with a couple of times, working
                  from whatever windows you gave us. Reply with whichever suits and that&apos;s the
                  booking done — nothing else to do.
                </p>
              )}
              <p className="mt-3 text-xs leading-relaxed text-slate-500">
                Before the call we&apos;ll pull your store&apos;s live position from the comparison, so
                there&apos;s nothing for you to prepare or send over.
              </p>
            </div>
          </>
        ) : (
          <>
            <h1 className="mt-4 font-display text-2xl font-extrabold text-white">Payment still processing</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Your bank hasn&apos;t finished confirming this one yet — that&apos;s normal for some payment
              methods. We&apos;ll email you the moment it clears, and the session isn&apos;t confirmed
              until then. Nothing more for you to do.
            </p>
          </>
        )}

        <p className="mt-5 text-xs text-slate-500">
          Questions in the meantime?{" "}
          <a href={`mailto:${CONTACT_EMAIL}?subject=Consulting%20session`} className="text-brand-400 hover:underline">
            {CONTACT_EMAIL}
          </a>
        </p>
      </div>

      <p className="mt-4 text-center text-xs text-slate-600">
        <Link href="/stores" className="text-brand-400 hover:underline">
          RiftCompare for Stores
        </Link>{" "}
        · your free repricing report stays live either way.
      </p>
    </div>
  );
}
