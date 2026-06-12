"use client";

import { useState } from "react";
import { SITE_URL } from "@/lib/site";
import type { Country } from "@/lib/country";

// "Embed this price" — gives anyone a copy-paste <iframe> snippet for the live
// price widget (see app/embed/card/[id]). Every embed someone places is a free
// backlink and brand impression that updates itself daily. Collapsed by default
// so it never clutters the card page.
export function EmbedCardButton({ slug, market }: { slug: string; market: Country }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const src = `${SITE_URL}/embed/card/${slug}?market=${market}`;
  const snippet = `<iframe src="${src}" width="340" height="150" style="border:0;overflow:hidden" loading="lazy" title="RiftCompare live price"></iframe>`;

  const copy = () => {
    navigator.clipboard?.writeText(snippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <section className="mt-8">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-ink-700 bg-ink-900/60 px-4 py-3 text-left hover:border-brand-500"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-white">
          <span aria-hidden>🔗</span> Embed this live price on your site or blog
        </span>
        <span className="text-xs text-slate-500">{open ? "Hide" : "Get the code"}</span>
      </button>

      {open && (
        <div className="mt-3 rounded-xl border border-ink-700 bg-ink-900 p-4">
          <p className="mb-3 text-xs leading-relaxed text-slate-400">
            Paste this where you want a live, auto-updating price badge. It always shows the cheapest
            current price and links back to the full comparison — free for anyone to use.
          </p>
          {/* Live preview */}
          <iframe
            src={src}
            width={340}
            height={150}
            style={{ border: 0, overflow: "hidden", maxWidth: "100%" }}
            loading="lazy"
            title="RiftCompare live price preview"
          />
          <div className="mt-3 flex items-start gap-2">
            <code className="block flex-1 overflow-x-auto rounded-lg bg-ink-950 p-3 text-[11px] leading-relaxed text-slate-300">
              {snippet}
            </code>
            <button onClick={copy} className="btn-primary shrink-0 text-xs">
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
