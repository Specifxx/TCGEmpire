import Link from "next/link";
import { NAV_GROUPS } from "./nav-groups";

// Persistent desktop rail (xl+): the whole site visible at first glance — user
// feedback: "should be side tabs… you should see most of what the site offers
// without clicking". Same shared sections as the phone sheet and the Menu.
export function SideNav() {
  return (
    <aside className="hidden w-52 shrink-0 xl:block">
      <nav className="sticky top-20 space-y-4 pb-8">
        {NAV_GROUPS.map((s) => (
          <div key={s.title}>
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{s.title}</div>
            <ul className="space-y-0.5">
              {s.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-medium text-slate-300 hover:bg-ink-800 hover:text-white">
                    <span className="text-sm leading-none" aria-hidden>{l.emoji}</span>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
