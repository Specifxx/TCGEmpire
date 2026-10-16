import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { setBySlug } from "@/lib/constants";
import { currencyOf } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { cardImageSrc } from "@/lib/card-image-url";
import { getPullSetCards, type PullCard } from "@/lib/pull-tracker-server";
import { isPullSet, parseShareCode, pullKey, summarisePulls } from "@/lib/pull-tracker";

// A shared pull result (lib/pull-tracker.ts). Everything on it comes from the
// link and the public catalogue. Not indexed: a share is a person's result, not
// a page for search. Each distinct link is an ordinary ISR page.
export const revalidate = 21600;

async function load(params: { set: string; code: string }) {
  const set = setBySlug(params.set);
  if (!set || !isPullSet(set.slug)) return null;
  const parsed = parseShareCode(params.code);
  if (!parsed) return null;
  const cards = await getPullSetCards(set.code);
  const byNum = new Map(cards.map((c) => [pullKey(c.collectorNumber), c]));
  const rows = parsed.lines
    .map((l) => ({ l, c: byNum.get(l.num) }))
    .filter((x): x is { l: (typeof parsed.lines)[number]; c: PullCard } => !!x.c)
    .map(({ l, c }) => ({ card: c, qty: l.qty, eachCents: c.p[parsed.country] ?? null }));
  if (!rows.length) return null;
  const sum = summarisePulls(
    rows.map((r) => ({ num: pullKey(r.card.collectorNumber), qty: r.qty, eachCents: r.eachCents })),
    parsed.paidCents,
  );
  return { set, parsed, rows: rows.sort((a, b) => (b.eachCents ?? -1) - (a.eachCents ?? -1)), sum, cur: currencyOf(parsed.country) };
}

export async function generateMetadata({ params }: { params: { set: string; code: string } }): Promise<Metadata> {
  const d = await load(params);
  if (!d) return { robots: { index: false, follow: true } };
  const total = formatMoney(d.sum.totalCents, d.cur);
  const paid = d.parsed.paidCents ? formatMoney(d.parsed.paidCents, d.cur) : null;
  const title = `${d.set.name} pulls worth ${total}${paid ? ` from ${paid}` : ""}`;
  const best = d.rows[0]?.card.name;
  const og = new URLSearchParams({
    t: `${d.set.name} pulls`,
    s: total,
    l: paid ? `from a ${paid} buy` : `${d.sum.copies} cards logged`,
    b: best ? `Best pull: ${best}. Log your own box on RiftCompare.` : "Log your own box on RiftCompare.",
    c: "#e8b748",
  });
  return {
    title,
    description: `${d.sum.copies} ${d.set.name} cards worth ${total} at today's store prices${paid ? `, from ${paid}` : ""}. See what your own box pulled.`,
    robots: { index: false, follow: true },
    openGraph: { title, images: [{ url: `/api/og?${og.toString()}`, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, images: [`/api/og?${og.toString()}`] },
  };
}

export default async function SharedPullsPage({ params }: { params: { set: string; code: string } }) {
  const d = await load(params);
  if (!d) notFound();
  const { set, parsed, rows, sum, cur } = d;
  const up = sum.diffCents != null && sum.diffCents >= 0;

  return (
    <div className="container-app max-w-4xl space-y-6 py-6">
      <section className="card-surface overflow-hidden rounded-2xl border border-gold/30">
        <div className="bg-[radial-gradient(ellipse_at_top,rgba(232,183,72,0.16),transparent_65%)] p-5 text-center sm:p-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-gold">Someone&apos;s {set.name} pulls</p>
          <p className="mt-2 text-4xl font-black text-white num sm:text-5xl">{formatMoney(sum.totalCents, cur)}</p>
          <p className="mt-1 text-sm text-slate-300">
            {sum.copies} card{sum.copies === 1 ? "" : "s"} at today&apos;s cheapest store prices{parsed.paidCents ? <> · paid {formatMoney(parsed.paidCents, cur)}</> : null}
          </p>
          {sum.diffCents != null && (
            <p className={`mt-1 text-sm font-bold ${up ? "text-up" : "text-red-400"}`}>
              {up ? "▲" : "▼"} {formatMoney(Math.abs(sum.diffCents), cur)} {up ? "more than they paid" : "less than they paid"}
            </p>
          )}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link href={`/tools/pull-tracker/${set.slug}`} className="btn-primary">
              Log your own {set.name} box
            </Link>
            <Link href={`/sets/${set.slug}`} className="btn-ghost">
              {set.name} prices
            </Link>
          </div>
        </div>
      </section>

      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {rows.map(({ card, qty, eachCents }) => {
          const src = cardImageSrc(card);
          return (
            <li key={card.id}>
              <Link href={card.slug ? `/card/${card.slug}` : "#"} className="block rounded-lg bg-ink-900 p-1.5 ring-1 ring-white/10 hover:ring-white/30">
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt={`${card.name} ${card.collectorNumber}`} loading="lazy" className="aspect-[5/7] w-full rounded-md object-cover" />
                ) : (
                  <span className="grid aspect-[5/7] w-full place-items-center rounded-md bg-ink-800 text-xs text-slate-500">{card.collectorNumber}</span>
                )}
                <span className="mt-1 block truncate text-xs font-semibold text-slate-100">
                  {qty > 1 ? `${qty}× ` : ""}
                  {card.name}
                </span>
                <span className="block text-[11px] text-slate-400">{eachCents != null ? formatMoney(eachCents * qty, cur) : "No price yet"}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="text-center text-xs text-slate-500">
        Valued at the cheapest in-stock store price in the sharer&apos;s market, refreshed twice a day. Prices move; what this link shows is today&apos;s.
      </p>
    </div>
  );
}
