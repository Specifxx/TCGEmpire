import Link from "next/link";
import { breadcrumb, type Crumb } from "@/lib/jsonld";

// Visible breadcrumb trail + its matching BreadcrumbList JSON-LD, emitted
// together so the markup can never describe a hierarchy the page doesn't show.
// Google cross-checks structured data against visible content, and a breadcrumb
// that exists only in JSON-LD is exactly the kind of mismatch that gets the rich
// result dropped — the two were separate concerns on the routes that had
// breadcrumbs before this component, and several had drifted apart.
//
// Pass only the trail BELOW home; Home is prepended automatically. The last crumb
// renders as plain text (it's the current page) but still appears in the markup
// with its own URL, which is valid and expected.
export function Breadcrumbs({ trail, className }: { trail: Crumb[]; className?: string }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb(trail)) }} />
      <nav className={`flex items-center gap-1.5 text-xs text-slate-500 ${className ?? "mb-3"}`} aria-label="Breadcrumb">
        <Link href="/" className="hover:text-slate-300">Home</Link>
        {trail.map((c, i) => (
          <span key={c.href} className="flex items-center gap-1.5">
            <span aria-hidden>/</span>
            {i === trail.length - 1 ? (
              <span className="text-slate-300">{c.name}</span>
            ) : (
              <Link href={c.href} className="hover:text-slate-300">{c.name}</Link>
            )}
          </span>
        ))}
      </nav>
    </>
  );
}
