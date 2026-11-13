import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { hubIntro } from "@/lib/content/hub-intros";

// Renders the editorial intro for a hub or tool page. Nothing if the route has
// no entry, so adding one is a single edit in lib/content/hub-intros.ts.
//
// Placed directly under the page's <h1> on purpose: this is the text that
// answers "what is this and is it what I wanted?" for a visitor arriving from
// search, and it is the text that stops an interactive tool from reading as an
// empty page to anything that judges pages by their content.
//
// A paragraph may carry internal links as `[label](/path)` — the guide that
// explains the tool, named in the sentence that needs it (2026-09-26). Only
// site-relative paths become links; anything else stays literal text, so an
// intro can never send a reader off-site or smuggle in an affiliate URL.
//
// THE FIRST PARAGRAPH SHOWS; THE REST IS ONE LINE UNTIL OPENED (owner,
// 2026-11-13: "the product's very easy to access rather than have everything
// everywhere all at once"; DECISIONS.md "Minimal redesign"). Measured on a
// 390px phone: /sealed's three paragraphs filled the whole first screen and
// the first product was on the second, and /sets and /price-guide were the
// same. The first paragraph is the one that says what the page is; the "how
// to read it" paragraphs follow in a native <details>, closed, so every word
// is still in the server HTML, directly under the <h1>, for search and for
// anything that judges the page by its text. No script: the browser's own
// disclosure, and find-in-page opens it.
//
// On a phone that first paragraph alone ran to seven to nine lines (/sealed,
// /sets, /price-guide, /movers), so below 640px it is three lines until "Read
// more" is opened (globals.css, [data-hub-intro]): the same words in the same
// place in the HTML, cut only on the screen, and only where the browser can
// lift the cut again (:has()); an intro of one paragraph is never cut.
export function HubIntro({ path, className }: { path: string; className?: string }) {
  const paragraphs = hubIntro(path);
  if (!paragraphs.length) return null;
  const [first, ...rest] = paragraphs;
  return (
    <div data-hub-intro="" className={className ?? "mt-3 max-w-3xl space-y-2.5 text-sm leading-relaxed text-slate-400"}>
      <p>{withLinks(first)}</p>
      {rest.length > 0 && (
        <details className="group/intro">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 font-semibold text-brand-400 hover:underline [&::-webkit-details-marker]:hidden">
            <span className="group-open/intro:hidden">Read more</span>
            <span className="hidden group-open/intro:inline">Read less</span>
            <svg className="h-3.5 w-3.5 shrink-0 transition-transform group-open/intro:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </summary>
          <div className="space-y-2.5 pb-1">
            {rest.map((p, i) => (
              <p key={i}>{withLinks(p)}</p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

const INLINE_LINK = /\[([^\]]+)\]\((\/(?!\/)[^)\s]*)\)/g;

export function withLinks(text: string): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_LINK)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    out.push(
      <Link key={at} href={m[2]} className="text-brand-400 hover:underline">
        {m[1]}
      </Link>,
    );
    last = at + m[0].length;
  }
  if (!out.length) return text;
  if (last < text.length) out.push(text.slice(last));
  return <Fragment>{out}</Fragment>;
}

/** The intro's text as a reader sees it, links reduced to their labels — for
 *  tests and anything that counts words. */
export function plainIntroText(text: string): string {
  return text.replace(INLINE_LINK, "$1");
}
