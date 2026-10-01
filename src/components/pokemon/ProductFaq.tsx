import type { FaqItem } from "@/lib/pokemon/product-facts";

// The product page's visible questions. The page's FAQPage JSON-LD is built
// from the same array (CURRENT-STATE "FAQ: one field feeds both"), and the
// array holds only the questions this product's data answers.
export function ProductFaq({ faq }: { faq: FaqItem[] }) {
  if (!faq.length) return null;
  return (
    <section className="card-surface mt-6 p-5" aria-labelledby="pk-product-faq">
      <h2 id="pk-product-faq" className="mb-3 text-lg font-extrabold text-white">
        Questions
      </h2>
      <dl className="space-y-4 text-sm">
        {faq.map((f) => (
          <div key={f.q}>
            <dt className="font-semibold text-white">{f.q}</dt>
            <dd className="mt-1 text-slate-400">{f.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
