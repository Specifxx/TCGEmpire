import { PremiumButton } from "./PremiumButton";

// The personal Premium nudge — "4 cards you watch are underpriced right now" —
// as a card. Copy comes from lib/premium-nudge.ts nudgeCopy(), which returns
// null when there is nothing true and specific to say; callers render this
// only when it did not, so there is no generic fallback here on purpose.
// Server-renderable; the button is the only client part.
export function PremiumNudgeCard({
  heading,
  line,
  surface,
  className = "",
}: {
  heading: string;
  line: string;
  surface: string;
  className?: string;
}) {
  return (
    <section
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gold/30 bg-gold/5 px-4 py-3 ${className}`}
      aria-label="What Premium would show you"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-white">
          <span aria-hidden className="text-gold">✦ </span>
          {heading}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{line}</p>
      </div>
      <PremiumButton surface={surface} />
    </section>
  );
}
