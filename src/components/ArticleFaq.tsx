import { InlineMarkdown } from "./Markdown";

/**
 * The article's FAQ, rendered VISIBLY from the same `faq` array that feeds the
 * FAQPage JSON-LD in ArticleView.
 *
 * WHY IT MATTERS THAT THIS EXISTS: until now `Article.faq` was structured data
 * only, and the human-facing FAQ was hand-typed markdown inside the body — two
 * copies that lib/articles.ts's own doc comment admitted had to be kept in sync
 * by hand. Google cross-checks FAQPage markup against visible page content and
 * drops the rich result when they disagree, so the duplicate wasn't just a
 * maintenance cost, it was a correctness risk. One array now drives both.
 *
 * <details> rather than always-open text because a 6-question FAQ at the foot of
 * a 3,000-word article is a wall; the answers are still in the server-rendered
 * DOM either way, which is what a crawler reads.
 */
const DEFAULT_HEADING = "Frequently asked questions";

export function ArticleFaq({ faq, heading = DEFAULT_HEADING }: { faq: { q: string; a: string }[]; heading?: string }) {
  if (!faq.length) return null;
  return (
    // The id is on the <section>, so the header-aware offset goes here; the old
    // scroll-mt-24 sat on the h2, which isn't the anchor target, and never applied.
    <section className="mt-10 scroll-mt-header" id="faq">
      <h2 className="mb-3 text-xl font-extrabold text-white">{heading}</h2>
      <div className="divide-y divide-ink-800 rounded-xl border border-ink-700">
        {faq.map((f, i) => (
          // The padding lives on the <summary>, not the <details>, so the whole
          // row is the toggle: with p-4 on <details> a tap in the 16px band
          // round the question hit the details box and did nothing (2026-09-23).
          // self-start keeps the flex-item chevron one line tall, so rotate-90
          // pivots beside the first line instead of swinging onto a wrapped
          // question; pl-9 lines the answer up with the question text.
          <details key={i} className="group">
            <summary className="flex cursor-pointer list-none gap-2 p-4 font-semibold text-white marker:content-none [&::-webkit-details-marker]:hidden">
              <span className="flex-none self-start text-brand-400 transition-transform group-open:rotate-90" aria-hidden>
                ›
              </span>
              {f.q}
            </summary>
            <p className="px-4 pb-4 pl-9 text-sm leading-relaxed text-slate-300">
              <InlineMarkdown content={f.a} />
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
