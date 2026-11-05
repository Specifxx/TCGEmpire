import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getCurrentUser } from "@/lib/auth";
import { pageAlternates } from "@/lib/seo";
import { TIER_NAMES } from "@/lib/site";
import { SupportForm } from "@/components/SupportForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Support",
  description: "Get help with a RiftCompare Plus or Premium payment, a subscription or your account: send a message and get a ticket number.",
  alternates: pageAlternates("/support"),
};

export default async function SupportPage({ searchParams }: { searchParams: { category?: string; subject?: string } }) {
  const user = await getCurrentUser();

  // The per-order picker is gone with the peer-to-peer marketplace (2026-08) —
  // there are no first-party orders to reference any more, so tickets are just
  // free-form now.
  return (
    <div className="mx-auto max-w-xl">
      {/* Visible trail + BreadcrumbList JSON-LD. Every indexable page needs
          both — the crawl check asserts it. */}
      <Breadcrumbs trail={[{ name: "Support", href: "/support" }]} />
      <h1 className="mb-2 font-display text-2xl font-extrabold text-white">🆘 Support</h1>
      {/* What support is for and what happens next (api/support: a numbered
          ticket, an email to the owner and a confirmation to the sender). No
          response time is promised on the page (2026-09-26, "Blog and tools,
          joined up" in DECISIONS.md). */}
      <div className="mb-4 space-y-2 text-sm leading-relaxed text-slate-400">
        <p>
          Use this page for a problem with a {TIER_NAMES.plus} or {TIER_NAMES.premium} payment or with your
          account: a charge you don&apos;t recognise, a plan that didn&apos;t switch on after you paid, or
          trouble signing in with Google or Discord. Each message becomes a numbered ticket; we email you a
          confirmation with the number, and the reply comes by email.
        </p>
        <p>
          To update your card, see your invoices or cancel, use the Manage subscription button on your{" "}
          <Link href="/dashboard" className="text-brand-400 hover:underline">dashboard</Link>, which opens
          Stripe&apos;s billing page; how billing, trials and cancellation work is set out in section 8 of
          the <Link href="/terms" className="text-brand-400 hover:underline">terms</Link>. For a wrong price,
          a missing store or an idea, the{" "}
          <Link href="/contact" className="text-brand-400 hover:underline">contact page</Link> is the better
          place.
        </p>
      </div>
      <SupportForm
        defaultName={user?.displayName}
        defaultEmail={user?.email}
        defaultCategory={searchParams.category}
        defaultSubject={searchParams.subject}
        orders={[]}
      />
    </div>
  );
}
