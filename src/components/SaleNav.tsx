"use client";

// The Black Friday / Cyber Monday pages' section chips (owner's review, 2026-11-24): anchor links that stay under the sticky header
// as the page scrolls, the current section highlighted. The header is two rows below xl and one from xl, so the chips sit at its
// measured height. It also counts how far visitors get: each section sends one `bf_section` event the first time it scrolls into
// view (scroll depth per section). Chips for sections the page did not render are dropped on mount.
import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics";

export function SaleNav({ items, page }: { items: { id: string; label: string }[]; page: string }) {
  const [present, setPresent] = useState(items);
  const [active, setActive] = useState(items[0]?.id ?? "");
  const [top, setTop] = useState(0);
  useEffect(() => {
    const hdr = document.querySelector("header");
    const measure = () => setTop(hdr ? Math.round(hdr.getBoundingClientRect().height) : 0);
    measure();
    const ro = hdr && typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (hdr && ro) ro.observe(hdr);
    const here = items.filter((i) => document.getElementById(i.id));
    setPresent(here);
    const seen = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const id = e.target.id;
          setActive(id);
          if (!seen.has(id)) {
            seen.add(id);
            trackEvent("bf_section", { page, section: id });
          }
        }
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    for (const i of here) io.observe(document.getElementById(i.id)!);
    return () => {
      io.disconnect();
      ro?.disconnect();
    };
  }, [items, page]);
  return (
    <nav aria-label="On this page" style={{ top }} className="sticky z-30 -mx-4 overflow-x-auto border-b border-ink-800 bg-ink-950/90 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-b-xl sm:px-2">
      <ul className="flex gap-2 whitespace-nowrap">
        {present.map((i) => (
          <li key={i.id}>
            <a
              href={`#${i.id}`}
              aria-current={active === i.id ? "true" : undefined}
              className={`inline-flex min-h-11 items-center rounded-full border px-3 text-sm font-semibold ${active === i.id ? "border-brand-500 bg-brand-500 text-white" : "border-ink-700 text-slate-400 hover:text-white"}`}
            >
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
