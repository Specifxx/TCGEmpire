/**
 * The visible FAQ block for a hub page (/tools, /movers, /sets, /champions …),
 * paired with faqPage() from lib/jsonld in the page's JSON-LD array.
 *
 * WHY HUBS NEED ONE: these are the highest-intent pages on the site for the
 * questions people actually type into an answer engine — "which Riftbound cards
 * are going up in price", "how many Riftbound sets are there". Each already had
 * good explanatory prose, but prose is not eligible for FAQPage markup and is
 * harder to quote verbatim. Same facts, in a shape an answer engine can lift.
 *
 * The answers live in the server-rendered DOM regardless of the <details> state,
 * which is what a crawler reads.
 */
export function HubFaq({
  faqs,
  heading = "Frequently asked questions",
  className,
}: {
  faqs: { q: string; a: string }[];
  heading?: string;
  className?: string;
}) {
  if (!faqs.length) return null;
  return (
    <section className={className ?? "mt-10"}>
      <h2 className="mb-3 text-xl font-extrabold text-white">{heading}</h2>
      <div className="divide-y divide-ink-800 rounded-xl border border-ink-700">
        {faqs.map((f) => (
          <details key={f.q} className="group p-4">
            <summary className="cursor-pointer list-none font-semibold text-white marker:content-none">
              <span className="mr-2 inline-block text-brand-400 transition-transform group-open:rotate-90" aria-hidden>
                ›
              </span>
              {f.q}
            </summary>
            <p className="mt-2 pl-5 text-sm leading-relaxed text-slate-300">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
