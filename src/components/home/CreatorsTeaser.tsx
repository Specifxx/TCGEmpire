import Link from "next/link";
import { featuredCreators, initials } from "@/lib/content/creators";

// The homepage's way into /creators (owner, 2026-10-15: "you should be able to
// quickly navigate or see this page from the home page, maybe a little widget").
// A slim, friendly strip: the featured creators' faces when there are some, an
// invitation to creators while there are none. Static data, no database read.
export function CreatorsTeaser() {
  const creators = featuredCreators().slice(0, 5);
  return (
    <Link
      href="/creators"
      className="group relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-fuchsia-400/20 bg-gradient-to-r from-fuchsia-500/15 via-ink-900 to-sky-500/15 p-5 transition-colors hover:border-fuchsia-300/50 sm:flex-row sm:items-center sm:justify-between"
    >
      <div aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-fuchsia-500/20 blur-2xl" />
      <div className="relative flex items-center gap-4">
        <div className="flex -space-x-3" aria-hidden>
          {creators.length
            ? creators.map((c) =>
                c.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={c.slug} src={c.avatar} alt="" aria-hidden="true" width={44} height={44} className="h-11 w-11 rounded-full border-2 border-ink-900 object-cover" />
                ) : (
                  <span
                    key={c.slug}
                    className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-ink-900 bg-gradient-to-br from-brand-500 to-gold text-xs font-extrabold text-ink-950"
                  >
                    {initials(c.name)}
                  </span>
                ),
              )
            : ["✨", "🎴", "🎥"].map((e) => (
                <span key={e} className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-ink-900 bg-gradient-to-br from-fuchsia-400/40 to-sky-400/40 text-lg">
                  {e}
                </span>
              ))}
        </div>
        <div>
          <p className="text-base font-extrabold text-white">Riftbound creators</p>
          <p className="text-sm text-slate-400">
            {creators.length
              ? "Follow the creators we love, and buy your favourite a pack."
              : "Make Riftbound content? Get featured free, with a “Buy them a pack” button."}
          </p>
        </div>
      </div>
      <span className="relative inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-white px-4 text-sm font-extrabold text-ink-950 transition-transform group-hover:scale-[1.03]">
        {creators.length ? "Meet the creators →" : "Get featured →"}
      </span>
    </Link>
  );
}
