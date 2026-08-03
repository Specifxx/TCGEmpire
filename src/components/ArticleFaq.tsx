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
export function ArticleFaq({ faq, heading = "Frequently asked questions" }: { faq: { q: string; a: string }[]; heading?: string }) {
  if (!faq.length) return null;
  return (
    <section className="mt-10" id="faq">
      <h2 className="mb-3 scroll-mt-24 text-xl font-extrabold text-white">{heading}</h2>
      <div className="divide-y divide-ink-800 rounded-xl border border-ink-700">
        {faq.map((f, i) => (
          <details key={i} className="group p-4">
            <summary className="cursor-pointer list-none font-semibold text-white marker:content-none">
              <span className="mr-2 text-brand-400 transition-transform group-open:rotate-90 inline-block" aria-hidden>
                ›
              </span>
              {f.q}
            </summary>
            <p className="mt-2 pl-5 text-sm leading-relaxed text-slate-300">
              <InlineMarkdown content={f.a} />
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
