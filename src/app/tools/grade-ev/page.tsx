import type { Metadata } from "next";
import Link from "next/link";
import { GradeEv } from "@/components/GradeEv";
import { SITE_URL } from "@/lib/site";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: { absolute: "Should I Grade This Riftbound Card? — Free Grade-or-Not Calculator | RiftCompare" },
  description:
    "Free calculator: is it worth grading your Riftbound card? Enter the raw value, your gem-mint odds and grading tier to see the expected value graded vs sold raw — a clear grade / don't-grade verdict.",
  alternates: { canonical: "/tools/grade-ev" },
  keywords: [
    "should i grade my riftbound card",
    "is it worth grading trading cards",
    "psa grading worth it calculator",
    "grade or not calculator",
  ],
  openGraph: {
    title: "Should I Grade This Riftbound Card?",
    description: "Expected value graded vs sold raw — a clear verdict, free.",
    url: `${SITE_URL}/tools/grade-ev`,
  },
};

export default function GradeEvPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-slate-300">Home</Link>
        <span>/</span>
        <span className="text-slate-300">Grade-or-not calculator</span>
      </nav>

      <h1 className="text-2xl font-extrabold text-white sm:text-3xl">Should I grade this card?</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-400">
        Grading costs money and takes months — it only pays when the graded card beats the raw price by
        more than the fee. This turns the collector rules of thumb (the &ldquo;3× rule&rdquo;, gem-rate
        odds, a 9 being worth a fraction of a 10) into one honest number: your expected value if you
        grade, versus selling it raw today.
      </p>

      <div className="mt-6"><GradeEv /></div>

      <section className="mt-8 card-surface p-6">
        <h2 className="text-lg font-bold text-white">The rules of thumb this uses</h2>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-400">
          <li><strong className="text-slate-200">The 3× rule:</strong> a common heuristic that a PSA-10 should sell for at least ~3× the raw price to justify grading. It&apos;s the default here — adjust it to the real graded/raw spread for your card.</li>
          <li><strong className="text-slate-200">Gem-rate odds:</strong> your honest chance of a 10. Centring, edges and surface all matter, and this can&apos;t see your card — so it&apos;s a slider, not a promise.</li>
          <li><strong className="text-slate-200">Under ~$20 raw:</strong> grading almost never pays; the fee and risk eat the upside.</li>
          <li><strong className="text-slate-200">Next step:</strong> if you decide to sell, run the{" "}
            <Link href="/tools/net-proceeds" className="text-brand-400 hover:underline">net-proceeds calculator</Link>{" "}
            to see what you actually pocket after fees.</li>
        </ul>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [
          { "@type": "Question", name: "Is it worth grading a Riftbound card?", acceptedAnswer: { "@type": "Answer", text: "Grading is worth it when the expected graded value — your chance of a 10 times the PSA-10 price, plus partial credit for a 9 — exceeds the raw price by more than the grading cost (roughly US$19–75 per card). For most cards under about US$20 raw, it isn't." } },
          { "@type": "Question", name: "What is the 3× rule for grading cards?", acceptedAnswer: { "@type": "Answer", text: "A common collector heuristic: only grade if a PSA-10 copy sells for at least three times the raw price. It's a rough safety margin that covers the grading fee plus the risk of getting a 9 instead of a 10." } },
        ] }) }} />
    </div>
  );
}
