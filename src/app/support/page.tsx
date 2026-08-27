import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { getCurrentUser } from "@/lib/auth";
import { pageAlternates } from "@/lib/seo";
import { SupportForm } from "@/components/SupportForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Support",
  description: "Get help with a RiftCompare Premium payment or account issue.",
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
      <p className="mb-4 text-sm text-slate-400">
        Problem with a Premium payment or your account? Send us a message and we'll reply by email —
        usually within a day or two.
      </p>
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
