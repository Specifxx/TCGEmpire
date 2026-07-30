import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CopyButton } from "@/components/admin/CopyButton";

export const dynamic = "force-dynamic";

// Admin-only — paste-ready social posts, regenerated from LIVE data on every load.
// Daily flow: open this page, tap Copy, paste into X. Nothing to write by hand.
export const metadata: Metadata = {
  title: "Social posts",
  robots: { index: false, follow: false },
};


// Evergreen bank — three rotate in per day so the account never runs dry even on
// quiet market days. Site-fact based, no hype claims.
const EVERGREEN: string[] = [
  "Same Riftbound card. Same day. 30-50% price difference between stores once postage is counted.\n\nThat's the whole reason RiftCompare exists — every store's live price, ranked by what you'd actually pay. Free.",
  "Riftbound deck builders: the deck pricer takes your full 40-card list and finds the cheapest way to buy ALL of it — consolidating stores so you don't pay postage five times.\n\nriftcompare.com/deck",
  "Every Riftbound card has a price history chart now — like the Steam market, but for the Rift.\n\nSee whether you're buying a spike or a dip before you commit. riftcompare.com",
  "Daily Riftle: guess the Riftbound card of the day. Streaks, shareable results, and a premium reward for playing.\n\nriftcompare.com/games",
  "PSA for Singapore Riftbound players: prices in SGD are live — 11 local stores plus eBay SG, compared per card, updated daily.\n\nriftcompare.com",
  "The RiftCompare Index tracks the whole Riftbound market like a stock index — one number for whether card prices rose or fell today.\n\nriftcompare.com/market",
  "Vendetta chase cards, mapped tier by tier: Signatures, Overnumbers, promos, alt-arts and the sleeper Epics — with live galleries that update as reveals land.\n\nriftcompare.com/blog/riftbound-vendetta-chase-cards-so-far",
  "Price-drop alerts: wishlist any Riftbound cards and get an email when a store undercuts the market.\n\nFree, no spam, unsubscribe any time. riftcompare.com",
];

function dayOfYear(): number {
  const now = new Date();
  return Math.floor((now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 0)) / 86400000);
}

export default async function SocialAdminPage({ searchParams }: { searchParams: { key?: string } }) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const user = await getCurrentUser();
  if (!(keyOk || user?.isAdmin)) notFound();

  // ---- Vendetta spoiler replies (newest VEN cards in the DB) -------------------
  const newest = await prisma.card
    .findMany({
      where: { setCode: "VEN", isPromo: false },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { name: true, slug: true, collectorNumber: true, rarity: true, type: true, createdAt: true },
    })
    .catch(() => []);
  const spoilerReplies = newest.map(
    (c) =>
      `${c.name} (${c.collectorNumber}) is already in the RiftCompare database — ${c.rarity} ${c.type}, page live, prices land the moment stores list it.\n\nriftcompare.com/card/${c.slug}`
  );

  // ---- Evergreen rotation (3 per day, deterministic) ----------------------------
  const start = dayOfYear() % EVERGREEN.length;
  const evergreen = [0, 1, 2].map((i) => EVERGREEN[(start + i * 3) % EVERGREEN.length]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold text-white">Social posts</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-400">
        Paste-ready X posts, regenerated from live data every time this page loads. Post the link as the FIRST REPLY
        rather than in the main post (links in the main post get down-ranked).
      </p>

      {/* The "today's market post" + thread sections are gone: they were built from
          the latest MarketReport row, and report generation is deleted (see
          lib/market-report.ts). Both were already permanently empty behind a
          freshness gate. /market is still live if a market post is wanted by hand. */}

      <Section
        title="1 · Vendetta spoiler replies"
        hint="When an official spoiler tweet drops, reply fast with the matching card's line — fast replies on official posts are a zero-follower account's best reach."
      >
        {spoilerReplies.map((t, i) => (
          <Post key={i} text={t} />
        ))}
      </Section>

      <Section title="2 · Evergreen (rotates daily)" hint="Use one on days you want a second post.">
        {evergreen.map((t, i) => (
          <Post key={i} text={t} />
        ))}
      </Section>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-bold text-white">{title}</h2>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Post({ text, label }: { text: string; label?: string }) {
  const over = text.length > 275;
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-850 p-4">
      <div className="flex items-start justify-between gap-3">
        <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-slate-200">{text}</pre>
        <CopyButton text={text} />
      </div>
      <div className={`mt-2 text-[11px] ${over ? "text-down" : "text-slate-500"}`}>
        {label ? `${label} · ` : ""}
        {text.length}/280{over ? " — trim before posting" : ""}
      </div>
    </div>
  );
}
