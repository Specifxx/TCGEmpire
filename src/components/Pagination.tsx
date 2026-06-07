"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// First, last, and a window around the current page, with ellipses.
function windowed(page: number, total: number): (number | "…")[] {
  const pages = new Set<number>([1, total]);
  for (let p = page - 1; p <= page + 1; p++) if (p >= 1 && p <= total) pages.add(p);
  const sorted = Array.from(pages).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

// Bigger touch targets on mobile (h-11 ≈ 44px, the recommended minimum); tighter on
// desktop where a mouse is precise.
const cell =
  "grid h-11 min-w-[2.75rem] place-items-center rounded-lg px-2.5 text-sm font-medium transition-colors select-none sm:h-9 sm:min-w-[2.25rem]";

export function Pagination({
  page,
  totalPages,
  params,
  basePath = "/browse",
}: {
  page: number;
  totalPages: number;
  params: Record<string, string | undefined>;
  basePath?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Optimistic page: reflects the click INSTANTLY (the number highlights and the
  // window re-centres) while the new page loads in the background. Resyncs once the
  // navigation lands and the real `page` prop updates.
  const [optimistic, setOptimistic] = useState<number | null>(null);
  useEffect(() => setOptimistic(null), [page]);

  if (totalPages <= 1) return null;

  const current = optimistic ?? page;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "page") sp.set(k, String(v));
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };

  function go(p: number, e: React.MouseEvent) {
    // Let modified clicks / middle-click open in a new tab normally.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (p === current) return;
    setOptimistic(p); // instant visual feedback
    if (typeof window !== "undefined") window.scrollTo(0, 0); // jump to the top of the results
    startTransition(() => router.push(href(p), { scroll: false })); // data loads in the background
  }

  const items = windowed(current, totalPages);
  const PrevNext = (label: string, target: number, enabled: boolean) =>
    enabled ? (
      <a href={href(target)} onClick={(e) => go(target, e)} className={`${cell} border border-ink-700 text-slate-300 hover:border-brand-500 hover:text-white`}>{label}</a>
    ) : (
      <span className={`${cell} border border-ink-800 text-slate-600`}>{label}</span>
    );

  return (
    <nav
      className={`mt-8 flex flex-wrap items-center justify-center gap-1.5 transition-opacity ${isPending ? "opacity-60" : ""}`}
      aria-label="Pagination"
      aria-busy={isPending}
    >
      {PrevNext("‹ Prev", current - 1, current > 1)}

      {items.map((it, i) =>
        it === "…" ? (
          <span key={`e${i}`} className="px-1 text-slate-600">…</span>
        ) : (
          <a
            key={it}
            href={href(it)}
            onClick={(e) => go(it, e)}
            aria-current={it === current ? "page" : undefined}
            className={`${cell} ${
              it === current
                ? "bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-glow"
                : "border border-ink-700 text-slate-300 hover:border-brand-500 hover:text-white"
            }`}
          >
            {it}
          </a>
        )
      )}

      {PrevNext("Next ›", current + 1, current < totalPages)}
    </nav>
  );
}
