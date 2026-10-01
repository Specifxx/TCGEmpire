import Link from "next/link";

// The hub's guides band. Empty until the integrator feeds it the published
// Pokémon posts, and then it renders nothing for an empty list, so the hub
// never shows a heading over no links.

export interface HomeGuide {
  href: string;
  title: string;
  excerpt: string;
}

export function HomeGuides({ guides = [] }: { guides?: HomeGuide[] }) {
  if (!guides.length) return null;
  return (
    <section className="mb-8" aria-labelledby="home-guides">
      <h2 id="home-guides" className="scroll-mt-header mb-3 text-lg font-extrabold text-white">
        Guides
      </h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {guides.map((g) => (
          <Link
            key={g.href}
            href={g.href}
            className="card-surface group block p-4 transition-colors hover:border-ink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
          >
            <span className="block font-bold text-white group-hover:text-brand-300">{g.title}</span>
            <span className="mt-1 block text-sm text-slate-400">{g.excerpt}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
