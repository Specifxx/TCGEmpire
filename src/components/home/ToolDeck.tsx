import Link from "next/link";
import { Reveal } from "@/components/Reveal";
import { NAV_GROUPS } from "@/components/nav-groups";

// The homepage's "command deck" — the whole site at a glance. This relocates the
// desktop SideNav (hidden on "/") into a cinematic bento grid: one glowing card per
// nav group, each with a faint oversized emoji watermark, a brand-tinted title and
// its links. Hover lifts + glows; Reveal cascades the cards in.
export function ToolDeck() {
  return (
    <section>
      <div className="mb-4">
        <h2 className="text-xl font-extrabold text-white">Everything RiftCompare can do</h2>
        <p className="mt-0.5 text-xs text-slate-500">Every tool and section — one tap away.</p>
      </div>
      <Reveal stagger className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {NAV_GROUPS.map((group) => (
          <div
            key={group.title}
            className="card-surface group relative overflow-hidden p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-500/60 hover:shadow-glow"
          >
            {/* Oversized faint emoji watermark, brightens on hover. */}
            <div
              className="pointer-events-none absolute -right-4 -top-5 select-none text-7xl opacity-[0.06] transition-opacity duration-300 group-hover:opacity-[0.13]"
              aria-hidden
            >
              {group.links[0]?.emoji}
            </div>
            <div className="relative">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-brand-300">{group.title}</div>
              <ul className="space-y-0.5">
                {group.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-300 transition-colors hover:bg-ink-800 hover:text-white"
                    >
                      <span className="text-base leading-none" aria-hidden>{l.emoji}</span>
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </Reveal>
    </section>
  );
}
