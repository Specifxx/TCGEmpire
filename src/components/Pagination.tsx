import Link from "next/link";

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

const cell = "grid h-9 min-w-[2.25rem] place-items-center rounded-lg px-2 text-sm font-medium transition-colors";

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
  if (totalPages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "page") sp.set(k, String(v));
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };
  const items = windowed(page, totalPages);

  return (
    <nav className="mt-8 flex flex-wrap items-center justify-center gap-1.5" aria-label="Pagination">
      {page > 1 ? (
        <Link href={href(page - 1)} className={`${cell} border border-ink-700 text-slate-300 hover:border-brand-500 hover:text-white`}>‹ Prev</Link>
      ) : (
        <span className={`${cell} border border-ink-800 text-slate-600`}>‹ Prev</span>
      )}

      {items.map((it, i) =>
        it === "…" ? (
          <span key={`e${i}`} className="px-1 text-slate-600">…</span>
        ) : (
          <Link
            key={it}
            href={href(it)}
            aria-current={it === page ? "page" : undefined}
            className={`${cell} ${
              it === page
                ? "bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-glow"
                : "border border-ink-700 text-slate-300 hover:border-brand-500 hover:text-white"
            }`}
          >
            {it}
          </Link>
        )
      )}

      {page < totalPages ? (
        <Link href={href(page + 1)} className={`${cell} border border-ink-700 text-slate-300 hover:border-brand-500 hover:text-white`}>Next ›</Link>
      ) : (
        <span className={`${cell} border border-ink-800 text-slate-600`}>Next ›</span>
      )}
    </nav>
  );
}
