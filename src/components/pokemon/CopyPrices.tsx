"use client";

import { useEffect, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import type { Country } from "@/lib/country";
import { productShareText, type CopyTexts, type ShareFormat } from "@/lib/pokemon/share-text";
import type { PkBoard } from "@/lib/pokemon/types";
import { useCountry } from "../CountryProvider";

// "Copy for Reddit" / "Copy for Discord": the prices on this page as text a
// collector can paste into a community that bans links (lib/pokemon/share-text.ts
// says what the text may carry). Two ways in:
//   texts   finished strings from the server (share-text shareTexts), for
//           force-dynamic pages that already know the visitor's market and
//           display currency (set, price per pack: pass `eur: showEur`);
//   product the product's boards, for the ISR product page, which reads no
//           cookie: the text is built here for useCountry()'s market at click,
//           in euros for a UK visitor who asked for them, as the board shows.
// No link unless "Include source link" is ticked, and then one, to our page.
//
// The clipboard API is missing or refused in more places than expected (an
// in-app browser, a non-secure context), so a failed write falls back to the old
// textarea copy, and if that fails too the text is shown selected to copy by hand.

export interface CopyProduct {
  boards: Partial<Record<Country, PkBoard>>;
  name: string;
  slug: string;
  packCount: number | null;
  /** The newest check among the product's rows (share-text offersAsOf). */
  asOf: string | null;
}

type Props = {
  /** Analytics page type: "pokemon_product", "pokemon_set", "pokemon_perpack". */
  page: string;
  className?: string;
} & ({ texts: CopyTexts; product?: undefined } | { product: CopyProduct; texts?: undefined });

const LABEL: Record<ShareFormat, string> = { reddit: "Reddit", discord: "Discord" };

function legacyCopy(text: string): boolean {
  // select() moves focus into the temporary textarea; removing it would drop
  // focus to <body>, so a keyboard user's next Tab would restart at the top.
  const prev = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.top = "0";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  prev?.focus({ preventScroll: true });
  return ok;
}

export function CopyPrices({ page, className, texts, product }: Props) {
  const { country, isEurDisplay } = useCountry();
  const [withLink, setWithLink] = useState(false);
  const [done, setDone] = useState<ShareFormat | null>(null);
  // The format whose text is shown for copying by hand; the text itself is
  // rebuilt on each render, so it follows the link box and the market.
  const [manual, setManual] = useState<ShareFormat | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  useEffect(() => {
    if (manual != null) areaRef.current?.select();
  }, [manual, withLink]);

  function textFor(format: ShareFormat): string {
    if (texts) return withLink ? texts[format].linked : texts[format].plain;
    const p = product as CopyProduct;
    return productShareText(p.boards, p.name, p.slug, p.packCount, p.asOf, country, { format, withLink, eur: isEurDisplay });
  }

  async function copy(format: ShareFormat) {
    const text = textFor(format);
    trackEvent("pokemon_copy_prices", { format, withLink, page });
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      ok = legacyCopy(text);
    }
    if (timer.current) clearTimeout(timer.current);
    if (ok) {
      setManual(null);
      setDone(format);
      timer.current = setTimeout(() => setDone(null), 2500);
    } else {
      setDone(null);
      setManual(format);
    }
  }

  const button =
    "btn-ghost focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900";

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        {(["reddit", "discord"] as const).map((f) => (
          <button key={f} type="button" onClick={() => copy(f)} className={button}>
            {done === f ? "Copied" : `Copy for ${LABEL[f]}`}
          </button>
        ))}
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 px-1 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={withLink}
            onChange={(e) => setWithLink(e.target.checked)}
            className="h-4 w-4 rounded border-ink-600 bg-ink-950 accent-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          />
          Include source link
        </label>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Paste in Reddit&apos;s Markdown mode. The cheapest listings with their date; no link unless you tick the box.
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {done ? `Copied for ${LABEL[done]}` : ""}
      </p>
      {manual != null && (
        <div className="mt-2">
          <p className="text-xs text-slate-400" role="status">
            Copying was blocked here. The {LABEL[manual]} text is selected below: copy it with your keyboard shortcut, or
            press and hold it and choose Copy.
          </p>
          <textarea
            ref={areaRef}
            readOnly
            value={textFor(manual)}
            rows={Math.min(10, textFor(manual).split("\n").length + 1)}
            aria-label={`Prices to copy for ${LABEL[manual]}`}
            className="mt-1 w-full resize-y rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 font-mono text-xs leading-relaxed text-slate-300 focus:border-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
          />
        </div>
      )}
    </div>
  );
}
