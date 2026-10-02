import Link from "next/link";
import { BANLIST_HREF, banDate, banFor } from "@/lib/banlist";

// "Banned in Standard and 2v2" under a banned card's name (2026-10-02). Prices
// still show: people buy banned cards for collections and casual play. Data is
// lib/banlist.ts, from Riot's announcements; no cookies, so safe in the
// /card/[id] ISR tree, and it imports nothing server-only, so the client
// QuickView can render it too.
export function BanNotice({ name, compact = false }: { name: string; compact?: boolean }) {
  const ban = banFor(name);
  if (!ban) return null;
  const formats = ban.formats.join(" and ");
  return (
    <p
      data-ban-notice
      className={`mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 ${compact ? "text-xs" : "text-sm"} text-slate-200`}
    >
      <span className="rounded bg-red-500/80 px-1.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-[#ffffff]">Banned</span>
      <span>
        in {formats} since {banDate(ban.effective)}.{" "}
        <Link href={BANLIST_HREF} prefetch={false} className="font-semibold text-brand-400 hover:underline">
          Ban list
        </Link>
      </span>
    </p>
  );
}
