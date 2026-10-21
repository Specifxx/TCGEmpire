import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { VisualDeckBuilder } from "@/components/deck-builder/VisualDeckBuilder";
import { normaliseShareCode } from "@/lib/deck-builder";

// A shared deck: riftcompare.com/d/CODE opens it in the visual deck builder
// (lib/deck-builder.ts). A shared list never changes, so a day's cache is safe.
// noindex: these are visitors' own decks, not pages for search.
export const revalidate = 86400;

async function load(raw: string) {
  const code = normaliseShareCode(raw);
  if (!code) return null;
  const row = await prisma.deckShare.findUnique({ where: { code }, select: { code: true, list: true, title: true } }).catch(() => null);
  return row;
}

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const row = await load(params.code);
  const title = row ? `${row.title ?? "A Riftbound deck"} · deck ${row.code}` : "Shared deck";
  return {
    title,
    description: "A Riftbound deck shared from RiftCompare's free deck builder. Open it, edit it, price it.",
    robots: { index: false, follow: true },
    openGraph: { title, images: ["/blog/riftbound-deck-builder.jpg"] },
  };
}

export default async function SharedDeckPage({ params }: { params: { code: string } }) {
  if (params.code !== params.code.toUpperCase() && normaliseShareCode(params.code)) redirect(`/d/${params.code.toUpperCase()}`);
  const row = await load(params.code);
  if (!row) notFound();
  return (
    <div className="mx-auto max-w-7xl">
      <Breadcrumbs trail={[{ name: "Deck builder", href: "/deck-builder" }, { name: `Deck ${row.code}`, href: `/d/${row.code}` }]} />
      <header className="mb-5">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Shared deck · code {row.code}</p>
        <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">{row.title ?? "A Riftbound deck"}</h1>
        <p className="mt-1 text-sm text-slate-400">Edit it freely: your changes stay in your browser, and Share code gives your version its own code.</p>
      </header>
      <VisualDeckBuilder initialList={row.list} initialTitle={row.title} sharedCode={row.code} />
    </div>
  );
}
