import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CONTACT_EMAIL, TIER_NAMES } from "@/lib/site";
import { pageAlternates } from "@/lib/seo";
import { ContactForm } from "@/components/ContactForm";

export const metadata = {
  title: "Contact & Feedback",
  description: "Get in touch with RiftCompare — report a price issue, suggest a store to add, or send feedback.",
  alternates: pageAlternates("/contact"),
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-xl">
      <div className="card-surface overflow-hidden">
        <div className="relative border-l-2 border-brand-500 bg-ink-900 px-6 py-10 text-center">
          {/* Visible trail + BreadcrumbList JSON-LD. Every indexable page needs
              both — the crawl check asserts it. */}
          <Breadcrumbs trail={[{ name: "Contact", href: "/contact" }]} />
          <h1 className="text-2xl font-extrabold text-white">Contact &amp; Feedback</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-300">
            Spotted a wrong price, a missing store, or have an idea to make RiftCompare better?
            We&apos;d genuinely love to hear from you.
          </p>
          {/* What the form is for and what happens to a message — no response
              time is promised here (2026-09-26, "Blog and tools, joined up" in
              DECISIONS.md). A message is stored for the admin inbox
              (api/contact → ContactMessage) and never published; the site is
              run by one person (/about#who-runs-riftcompare). */}
          <p className="mx-auto mt-3 max-w-md text-left text-sm leading-relaxed text-slate-400">
            Use this form for anything about the site: a store or card we&apos;re missing, a bug, a
            question about a guide or one of the tools, or a correction. Your message goes to Bill, who
            runs RiftCompare on his own, and the reply comes by email to the address you give; nothing you
            send here is published. For a single wrong price, the &ldquo;Report it&rdquo; link under a
            card&apos;s store comparison is quicker, because it tells us exactly which listing you mean.
            For a problem with a {TIER_NAMES.plus} or {TIER_NAMES.premium} payment or your account, use{" "}
            <Link href="/support" className="font-semibold text-brand-300 hover:underline">support</Link>
            , which gives you a ticket number.
          </p>

          <div className="mt-6">
            <ContactForm />
          </div>

          <p className="mt-4 text-xs text-slate-500">
            Prefer email?{" "}
            <a href={`mailto:${CONTACT_EMAIL}?subject=RiftCompare%20feedback`} className="text-brand-300 hover:underline">
              {CONTACT_EMAIL}
            </a>
          </p>

          <p className="mt-5 border-t border-ink-800 pt-4 text-sm text-slate-400">
            Run a shop, or know one we&apos;re missing?{" "}
            <Link href="/stores/suggest" className="font-semibold text-brand-300 hover:underline">
              Suggest a store →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
