import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CONTACT_EMAIL } from "@/lib/site";
import { pageAlternates } from "@/lib/seo";
import { ContactForm } from "@/components/ContactForm";

export const metadata = {
  title: "Contact & Feedback",
  description: "Contact RiftCompare at riftcompare@gmail.com about price errors, missing stores or partnerships. We usually reply within 2 business days.",
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
            RiftCompare is an independent community project for Riftbound players. Email us at{" "}
            <a href={`mailto:${CONTACT_EMAIL}?subject=RiftCompare`} className="font-semibold text-brand-300 hover:underline">
              {CONTACT_EMAIL}
            </a>{" "}
            or use the form below. We usually reply within 2 business days.
          </p>

          <div className="mx-auto mt-6 max-w-md text-left">
            <h2 className="text-sm font-bold text-white">What to contact us about</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-300">
              <li>
                <span className="font-semibold text-white">Price errors</span> — a price, stock status or listing on a
                card page that doesn&apos;t match the store. Tell us the card and the store, or use the &ldquo;Spotted a wrong
                price? Report it&rdquo; link under the card&apos;s price table.
              </li>
              <li>
                <span className="font-semibold text-white">Missing stores</span> — a shop that sells Riftbound singles
                and should be in our comparison. You can also{" "}
                <Link href="/stores/suggest" className="text-brand-300 hover:underline">suggest a store</Link> directly.
              </li>
              <li>
                <span className="font-semibold text-white">Partnerships</span> — stores, content creators and
                communities who want to work with us. Store owners can read about{" "}
                <Link href="/stores" className="text-brand-300 hover:underline">RiftCompare for stores</Link>.
              </li>
              <li>
                <span className="font-semibold text-white">Account and Premium questions</span> — billing, sign-in or
                anything about your saved cards and alerts.
              </li>
            </ul>
          </div>

          <div className="mt-6">
            <ContactForm />
          </div>

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
