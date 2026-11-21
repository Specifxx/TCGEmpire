import { DISCORD_URL } from "@/lib/site";

// "Join the Discord" with a reason to join (owner, 2026-11-20: "5 months and 9 members"). The old link
// went to a server with no feeds and no reason given; this one names what members get: the hub's
// sealed restock and price-drop feeds. Server-rendered, no state, no pop-up, never above a price
// (it sits under the price table on sealed pages and in the footer). DECISIONS.md, 2026-11-20.
export function DiscordCta({ className = "" }: { className?: string }) {
  if (!DISCORD_URL) return null;
  return (
    <aside
      aria-label="Our Discord"
      className={`flex flex-col gap-3 rounded-xl border border-[#5865F2]/40 bg-[#5865F2]/10 p-4 text-left sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <div>
        <p className="text-sm font-bold text-white">Restock and price-drop alerts, free on Discord</p>
        <p className="mt-0.5 text-xs text-slate-300">
          Sealed restocks and price drops from the stores we track, posted twice a day and checked at the store first.
        </p>
      </div>
      <a
        href={DISCORD_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex shrink-0 items-center justify-center rounded-lg bg-[#5865F2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4752C4]"
      >
        Join the Discord
      </a>
    </aside>
  );
}
