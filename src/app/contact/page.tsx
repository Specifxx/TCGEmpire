import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata = {
  title: "Contact & Feedback",
  description: "Get in touch with RiftCompare — report a price issue, suggest a store to add, or send feedback.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-xl">
      <div className="card-surface overflow-hidden">
        <div className="relative border-l-2 border-brand-500 bg-ink-900 px-6 py-10 text-center">
          <h1 className="text-2xl font-extrabold text-white">Contact &amp; Feedback</h1>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-300">
            Spotted a wrong price, a missing store, or have an idea to make RiftCompare better?
            We&apos;d genuinely love to hear from you — just send us an email.
          </p>

          <a
            href={`mailto:${CONTACT_EMAIL}?subject=RiftCompare%20feedback`}
            className="btn-primary mt-6 inline-flex text-base"
          >
            Email {CONTACT_EMAIL}
          </a>

          <p className="mt-4 text-xs text-slate-500">
            We read every message and usually reply within a day or two.
          </p>

          <p className="mt-5 border-t border-ink-800 pt-4 text-sm text-slate-400">
            Problem with a Marketplace order, payment, or your account?{" "}
            <Link href="/support" className="font-semibold text-brand-300 hover:underline">
              Open a support ticket →
            </Link>
          </p>
          <p className="mt-2 text-sm text-slate-400">
            Run a shop, or know one we&apos;re missing?{" "}
            <Link href="/stores/suggest" className="font-semibold text-brand-300 hover:underline">
              Suggest a store →
            </Link>
          </p>
        </div>
      </div>

      <div className="mt-4 text-center text-sm text-slate-500">
        Looking to buy or sell instead?{" "}
        <Link href="/marketplace" className="text-brand-400 hover:underline">Visit the RiftCompare Marketplace →</Link>
      </div>
    </div>
  );
}
