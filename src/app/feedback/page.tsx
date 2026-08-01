import type { Metadata } from "next";
import { FeedbackForm } from "@/components/FeedbackForm";
import { FEEDBACK_PREMIUM_MONTHS, feedbackPremiumActive } from "@/lib/premium";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // A bare submission form: nothing on it is worth a search result, and /contact
  // already covers the same intent with real content. Kept crawlable (follow) so
  // the link graph is intact — never a robots.txt Disallow, which would stop
  // Google reading this tag at all. AdSense remediation § Phase 7.
  robots: { index: false, follow: true },
  title: "Feedback — Shape RiftCompare (and get Premium)",
  description:
    "Tell us what would make RiftCompare better. Your first feedback earns free RiftCompare Premium — help us build the best Riftbound price tool.",
  alternates: { canonical: "/feedback" },
  openGraph: {
    title: "Feedback — Shape RiftCompare",
    description: "Tell us what would make RiftCompare better — your first feedback earns free Premium.",
    url: `${SITE_URL}/feedback`,
  },
};

export default function FeedbackPage() {
  const months = feedbackPremiumActive() ? FEEDBACK_PREMIUM_MONTHS : 0;
  const moLabel = `${months} month${months === 1 ? "" : "s"}`;

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-5 text-center">
        {months > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-bold uppercase tracking-wide text-gold">
            ✦ {moLabel} Premium — on us
          </span>
        )}
        <h1 className="mt-3 text-2xl font-extrabold text-white sm:text-3xl">Help shape RiftCompare</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-400">
          We&apos;re building the best way to buy Riftbound singles, and your input genuinely steers what we build next.
          {months > 0 && <> As a thank-you, your first feedback unlocks <strong className="text-gold">{moLabel} of Premium</strong> — free.</>}
        </p>
      </div>

      <FeedbackForm months={months} />

      <p className="mt-4 text-center text-xs text-slate-500">
        Prefer email? Reach us via the <a href="/contact" className="text-brand-400 hover:underline">contact page</a>.
      </p>
    </div>
  );
}
