import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { GIVEAWAYS, giveawayState } from "@/lib/giveaway";
import { GiveawayDrawButton } from "@/components/giveaway/GiveawayDrawButton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Giveaways", robots: { index: false, follow: false } };

// Entry counts per giveaway and the draw button (admin only). One count query per
// giveaway; nothing else is read.
export default async function GiveawayAdminPage() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) notFound();
  const now = new Date();
  const rows = await Promise.all(
    GIVEAWAYS.map(async (g) => ({
      g,
      state: giveawayState(g, now),
      count: await prisma.giveawayEntry.count({ where: { giveaway: g.key } }).catch(() => -1),
    })),
  );
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold">Giveaways</h1>
      {rows.map(({ g, state, count }) => (
        <section key={g.key} className="mt-6 rounded-xl border border-white/10 p-4">
          <h2 className="font-semibold">{g.title}</h2>
          <p className="text-sm opacity-80">
            {g.key} · {state} · closes {g.closesAt} · draw {g.drawOn}
          </p>
          <p className="mt-2 text-lg">{count < 0 ? "Entries unavailable" : `${count} ${count === 1 ? "entry" : "entries"}`}</p>
          {state === "closed" && <GiveawayDrawButton giveaway={g.key} />}
        </section>
      ))}
    </main>
  );
}
