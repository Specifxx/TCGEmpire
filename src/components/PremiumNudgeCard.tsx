import Link from "next/link";
import { PremiumButton } from "./PremiumButton";
import { memberNudgeHref } from "@/lib/premium-nudge";

// The personal nudge — "4 cards you watch are underpriced right now" — as a
// card. Copy comes from lib/premium-nudge.ts nudgeCopy(), which returns null
// when there is nothing true and specific to say; callers render this only when
// it did not, so there is no generic fallback here on purpose.
// Server-renderable; the button is the only client part.
//
// FREE ACCOUNT: the upsell, on the Plus-level gate (tier="plus" — the full lists
// are a Plus feature, so the dialog opens on Plus and quotes Plus's price).
// MEMBER (`member`, 2026-09-25; /watching and /portfolio pass it): never a
// wall. The card links straight to the list it is talking about —
// memberNudgeHref: Deal Finder filtered to their watchlist (?mine=watch) for a
// deal nudge, Rising Cards for a rising one — and nudgeCopy(…, "member") drops
// the pitch from the line.
export function PremiumNudgeCard({
  heading,
  line,
  surface,
  className = "",
  member = false,
  kind = "deal",
}: {
  heading: string;
  line: string;
  surface: string;
  className?: string;
  member?: boolean;
  kind?: "deal" | "rising";
}) {
  return (
    <section
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gold/30 bg-gold/5 px-4 py-3 ${className}`}
      aria-label={member ? "Your cards in our lists" : "What Plus would show you"}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-white">
          <span aria-hidden className="text-gold">✦ </span>
          {heading}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{line}</p>
      </div>
      {member ? (
        <Link href={memberNudgeHref(kind)} className="btn-ghost text-sm">
          {kind === "rising" ? "See the picks →" : "See them →"}
        </Link>
      ) : (
        <PremiumButton surface={surface} tier="plus" />
      )}
    </section>
  );
}
