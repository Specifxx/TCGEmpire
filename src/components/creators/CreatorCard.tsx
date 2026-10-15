"use client";

import { trackEvent } from "@/lib/analytics";
import { initials, PLATFORM_STYLE, type Creator } from "@/lib/content/creators";

// One featured creator: avatar, what they make, their channels, and the
// "Buy them a pack" button that goes to THEIR tip page. Every click is counted
// (creator_click / creator_tip_click), which is how a creator is shown what the
// listing sent them. rel="noopener" without "noreferrer": the creator's analytics
// should see riftcompare.com as the referrer, that is the point of the listing.

const GRADIENTS = [
  "from-fuchsia-500/30 via-rose-400/20 to-amber-300/20",
  "from-sky-500/30 via-indigo-400/20 to-fuchsia-400/20",
  "from-emerald-500/30 via-teal-400/20 to-sky-400/20",
  "from-amber-400/30 via-orange-400/20 to-rose-400/20",
];

export function CreatorCard({ creator, index = 0 }: { creator: Creator; index?: number }) {
  const main = creator.links[0];
  const grad = GRADIENTS[index % GRADIENTS.length];
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-900 shadow-lg shadow-black/30 transition-transform duration-200 hover:-translate-y-1">
      <div className={`h-20 bg-gradient-to-br ${grad}`} aria-hidden />
      <div className="-mt-10 flex flex-1 flex-col px-5 pb-5">
        <div className="flex items-end justify-between gap-3">
          {creator.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={creator.avatar}
              alt={`${creator.name}'s avatar`}
              width={80}
              height={80}
              className="h-20 w-20 rounded-2xl border-4 border-ink-900 object-cover shadow-lg"
            />
          ) : (
            <div
              aria-hidden
              className="flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-ink-900 bg-gradient-to-br from-brand-500 to-gold text-2xl font-extrabold text-ink-950 shadow-lg"
            >
              {initials(creator.name)}
            </div>
          )}
          {creator.region && (
            <span className="chip mb-1 bg-ink-800 text-[11px] font-semibold text-slate-300">{creator.region}</span>
          )}
        </div>

        <h3 className="mt-3 text-lg font-extrabold text-white">{creator.name}</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-400">{creator.blurb}</p>

        {(creator.tags?.length || creator.champion) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {creator.champion && (
              <span className="chip bg-gold/15 text-[11px] font-semibold text-gold">♥ {creator.champion}</span>
            )}
            {creator.tags?.slice(0, 3).map((t) => (
              <span key={t} className="chip bg-ink-800 text-[11px] text-slate-300">
                {t}
              </span>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {creator.links.map((l) => {
            const st = PLATFORM_STYLE[l.platform];
            return (
              <a
                key={l.url}
                href={l.url}
                target="_blank"
                rel="noopener"
                onClick={() => trackEvent("creator_click", { creator: creator.slug, platform: l.platform })}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition-opacity hover:opacity-85"
                style={{ backgroundColor: st.bg, color: st.fg }}
              >
                {l.platform}
                {l.handle && <span className="font-medium opacity-80">{l.handle}</span>}
              </a>
            );
          })}
        </div>

        <div className="mt-auto pt-5">
          {creator.tipUrl ? (
            <a
              href={creator.tipUrl}
              target="_blank"
              rel="noopener"
              onClick={() => trackEvent("creator_tip_click", { creator: creator.slug })}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-gold to-amber-300 text-sm font-extrabold text-ink-950 shadow-md shadow-gold/20 transition-transform hover:scale-[1.02]"
            >
              <PackIcon /> Buy {creator.name.split(" ")[0]} a pack
            </a>
          ) : main ? (
            <a
              href={main.url}
              target="_blank"
              rel="noopener"
              onClick={() => trackEvent("creator_click", { creator: creator.slug, platform: main.platform })}
              className="btn-ghost flex min-h-11 w-full items-center justify-center text-sm"
            >
              Watch on {main.platform} →
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function PackIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M6 3h12l-1 3 1 3-1 3 1 3-1 3 1 3H6l1-3-1-3 1-3-1-3 1-3-1-3z" strokeLinejoin="round" />
      <path d="M10 10l2-2 2 2-2 2z" fill="currentColor" stroke="none" />
    </svg>
  );
}
