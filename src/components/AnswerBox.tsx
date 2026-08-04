import { InlineMarkdown } from "./Markdown";

/**
 * The answer-first summary block ("In short" / "The short version").
 *
 * WHY: every hub page already opened with an intro paragraph, but it was just a
 * <p> among other <p>s. Answer engines — and the featured-snippet extractor —
 * reward a single, visually distinct, self-contained block that answers the
 * page's question in two or three sentences before any UI. This gives them one,
 * with a stable `.answer-box` class so a page can also point a
 * SpeakableSpecification at it.
 *
 * Render it directly under the H1. Keep it short: if it needs a scrollbar it has
 * stopped being a summary.
 */
export function AnswerBox({
  children,
  points,
  heading = "In short",
  className,
}: {
  /** The prose answer. Two to three sentences. */
  children?: React.ReactNode;
  /** Optional scannable bullets under the prose (markdown inline is supported). */
  points?: string[];
  heading?: string;
  className?: string;
}) {
  return (
    <section
      className={`answer-box card-surface border-l-2 border-l-brand-500 p-4 sm:p-5 ${className ?? "my-5"}`}
      aria-label={heading}
    >
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-brand-400">{heading}</h2>
      {children && <div className="text-[15px] leading-relaxed text-slate-300">{children}</div>}
      {points && points.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300">
          {points.map((p, i) => (
            <li key={i}>
              {/* Inline markdown so a takeaway can carry **emphasis** and internal
                  links, which is where a lot of the internal-linking budget lives. */}
              <InlineMarkdown content={p} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
