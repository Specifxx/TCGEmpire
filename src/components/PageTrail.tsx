import Link from "next/link";

/**
 * The visible breadcrumb at the top of a page whose BreadcrumbList JSON-LD is
 * already written by the page itself (the guide and blog indexes, every article).
 * Same look as components/Breadcrumbs.tsx, and the same `nav[aria-label="Breadcrumb"]`
 * tap-target rule in globals.css, but it emits NO JSON-LD: those pages keep their
 * own node exactly as it was (2026-11-14, one page header across page types).
 *
 * `trail` is the path BELOW home. A crumb with an href is a link; one without is
 * the current page, drawn as plain text.
 */
export function PageTrail({ trail, className }: { trail: { name: string; href?: string }[]; className?: string }) {
  return (
    <nav className={`flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500 ${className ?? "mb-3"}`} aria-label="Breadcrumb">
      <Link href="/" className="hover:text-slate-300">Home</Link>
      {trail.map((c) => (
        <span key={c.name} className="flex items-center gap-1.5">
          <span aria-hidden>/</span>
          {c.href ? (
            <Link href={c.href} className="hover:text-slate-300">{c.name}</Link>
          ) : (
            <span className="text-slate-300">{c.name}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
