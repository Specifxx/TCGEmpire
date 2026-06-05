import { ContactForm } from "@/components/ContactForm";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata = {
  title: "Contact & Feedback — RiftCompareAU",
  description: "Send feedback, report a price issue, or suggest a store to add to RiftCompareAU.",
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="card-surface mb-5 overflow-hidden">
        <div className="bg-gradient-to-r from-brand-600/25 via-ink-850 to-gold/10 p-6">
          <h1 className="text-2xl font-extrabold text-white">Contact &amp; Feedback</h1>
          <p className="mt-1 text-sm text-slate-300">
            Spotted a wrong price, a missing store, or have an idea? We&apos;d love to hear it.
            Use the form below, or email us directly at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-gold hover:underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </div>
      </div>

      <ContactForm />

      <p className="mt-4 text-center text-sm text-slate-500">
        Prefer email? Reach us any time at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-gold hover:underline">{CONTACT_EMAIL}</a>
      </p>
    </div>
  );
}
