import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { cardHref } from "@/lib/card-url";
import { cardImageAlt } from "@/lib/image-alt";
import {
  generateRisingSubtitle,
  hotListName,
  snapshotDateLabel,
  type RisingSnapshotData,
  type RisingSnapshotPick,
} from "@/lib/rising-snapshot";

export const dynamic = "force-dynamic";

// The PUBLIC face of a minted RiftCompare Hot 40 snapshot. No account, no Premium, no
// paywall of any kind — that is the entire point of the feature (owner,
// 2026-09-22: "a special link for public users to view a snapshot of the rising
// cards at the time of generation so they don't need premium").
//
// NOINDEX, and not as an afterthought. This is a capability URL: unguessable
// token, shared deliberately. Indexing it would (a) put a Premium tool's output
// in the search results the Premium page itself competes for, and (b) make the
// "special link" meaningless, since the whole value is that the holder was
// given it. robots.ts does not cover /rising/*, so the page declares it here.
//
// NOTHING IS RECOMPUTED. Every number rendered below comes out of the frozen
// `data` column. That is what makes it a snapshot rather than a free mirror of
// the live tool, and it also means a widely-shared link costs one small indexed
// row read per view instead of the heaviest scan in the app.
export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const snap = await prisma.risingSnapshot.findUnique({
    where: { token: params.token },
    select: { title: true },
  });
  // No explicit openGraph.images: the sibling opengraph-image.tsx is picked up
  // by the route automatically, and naming it here as well would override the
  // generated one with a plain URL and lose the #1 card.
  return {
    title: snap?.title ?? "RiftCompare Hot 40",
    robots: { index: false, follow: false },
  };
}

function Spark({ values, w = 90, h = 26 }: { values: number[]; w?: number; h?: number }) {
  if (values.length < 2) return <span className="text-slate-600">—</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / span) * (h - 4) - 2).toFixed(1)}`);
  const up = values[values.length - 1] >= values[0];
  // Coloured through currentColor from the themed text-brand-400 / text-rose-400
  // tokens (2026-09-23), the same as PriceChart's Sparkline: the old literal
  // #34d17e / #fb7185 were the dark theme's values and measured ~2:1 on the light
  // theme's white rows. Dark is pixel-identical (brand-400 and rose-400 resolve
  // to exactly those two hexes there).
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true" className={up ? "text-brand-400" : "text-rose-400"}>
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function Pct({ v }: { v: number | null }) {
  if (v == null) return <span className="text-slate-600">—</span>;
  const tone = v > 0 ? "text-up" : v < 0 ? "text-down" : "text-slate-400";
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return (
    <span className={`num ${tone}`}>
      {sign}
      {Math.abs(v).toFixed(1)}%
    </span>
  );
}

function Row({ p, rank }: { p: RisingSnapshotPick; rank: number }) {
  return (
    <tr className="align-middle">
      <td className="num px-3 py-2 text-slate-500">{rank}</td>
      <td className="px-3 py-2">
        <Link href={cardHref(p)} className="flex items-center gap-2.5 hover:text-brand-400">
          {p.imageThumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.imageThumbUrl}
              alt={cardImageAlt({ name: p.displayName, setCode: p.setCode, collectorNumber: p.collectorNumber })}
              width={28}
              height={39}
              loading="lazy"
              className="h-[39px] w-7 shrink-0 rounded-sm object-cover"
            />
          ) : (
            <span className="h-[39px] w-7 shrink-0 rounded-sm bg-ink-800" aria-hidden />
          )}
          <span className="min-w-0">
            <span className="block truncate font-medium text-white">{p.displayName}</span>
            <span className="num block text-[11px] text-slate-500">
              {p.setCode} · {p.collectorNumber}
            </span>
          </span>
        </Link>
      </td>
      <td className="num px-3 py-2 text-right text-white">
        {p.priceCents != null ? formatMoney(p.priceCents, p.currency) : "—"}
      </td>
      <td className="num px-3 py-2 text-right"><Pct v={p.trend7} /></td>
      <td className="num px-3 py-2 text-right"><Pct v={p.trend30} /></td>
      <td className="px-3 py-2"><Spark values={p.spark} /></td>
      <td className="num px-3 py-2 text-right text-slate-300">{p.listings}</td>
      <td className="num px-3 py-2 text-right font-bold text-white">{p.score}</td>
    </tr>
  );
}

export default async function RisingSnapshotPage({ params }: { params: { token: string } }) {
  const snap = await prisma.risingSnapshot.findUnique({ where: { token: params.token } });
  // 404, not a "link expired" page: an invalid token must not confirm that the
  // route exists or that any snapshot does.
  if (!snap) notFound();

  const data = snap.data as unknown as RisingSnapshotData;
  const taken = new Date(snap.createdAt);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      {/* The list has a name as of 2026-09-22 — see lib/rising-snapshot.ts's
          HOT_LIST_BRAND comment for why, and why the number is the real count
          rather than a flat 40 on a thin run. */}
      <p className="text-[11px] font-bold uppercase tracking-wide text-brand-400">
        {data.picks.length > 0 ? hotListName(data.picks.length) : "RiftCompare Hot 40"} · snapshot
      </p>
      <h1 className="mt-1 text-2xl font-extrabold leading-tight text-white sm:text-3xl">{snap.title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">{generateRisingSubtitle(data)}</p>

      {/* SAYS PLAINLY THAT IT IS FROZEN. A reader who assumes these are live
          prices would be misled by the page's own accuracy — every number was
          true when it was taken and none has moved since. */}
      <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-ink-700 bg-ink-900 px-3 py-1 text-xs text-slate-400">
        <span aria-hidden>📌</span>
        Frozen on {snapshotDateLabel(taken)} — prices have moved since
      </p>

      {data.picks.length === 0 ? (
        <div className="card-surface mt-6 grid place-items-center p-12 text-center text-sm text-slate-400">
          <div>
            <p className="font-semibold text-white">No cards were ranked in this run</p>
            <p className="mx-auto mt-1 max-w-lg">
              Ranking needs {data.minPointsRequired} days of price history per card. This snapshot was taken before
              enough had built up.
            </p>
          </div>
        </div>
      ) : (
        <div className="card-surface mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-slate-500">
              <tr className="border-b border-ink-800">
                <th className="px-3 py-2 font-semibold">#</th>
                <th className="px-3 py-2 font-semibold">Card</th>
                <th className="px-3 py-2 text-right font-semibold">Price</th>
                <th className="px-3 py-2 text-right font-semibold">7d</th>
                <th className="px-3 py-2 text-right font-semibold">30d</th>
                <th className="px-3 py-2 font-semibold">Trend</th>
                <th className="px-3 py-2 text-right font-semibold">Listings</th>
                <th className="px-3 py-2 text-right font-semibold">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {data.picks.map((p, i) => (
                <Row key={p.id} p={p} rank={i + 1} />
              ))}
            </tbody>
          </table>
          <p className="p-3 text-[11px] leading-relaxed text-slate-600">
            Score is a 0–100 percentile of a weighted composite (demand, velocity, room to run, scarcity, momentum,
            volatility) across the {data.qualifying.toLocaleString()} most-searched priced cards of{" "}
            {data.universeSize.toLocaleString()} scanned. A research signal, not financial advice — always check the
            card&apos;s own price history before buying.
          </p>
        </div>
      )}

      {/* The upsell, and it is an honest one: what this page withholds is not
          rows (it shows every one) but RECENCY, which is exactly what the
          subscription buys. No countdown, no fake scarcity. */}
      <div className="mt-8 rounded-xl border border-gold/35 bg-gold/[0.07] px-5 py-4">
        <p className="text-sm font-bold text-white">These numbers stopped moving when this snapshot was taken.</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-300">
          The live screener re-ranks every day as prices and search demand change. Free to browse every price on
          RiftCompare; the daily screener is part of Premium.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/tools/rising" className="btn-primary text-sm">See today&apos;s rising cards →</Link>
          <Link href="/browse" className="btn-ghost text-sm">Browse every card free</Link>
        </div>
      </div>
    </div>
  );
}
