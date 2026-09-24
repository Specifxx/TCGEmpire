import Link from "next/link";
import { prisma } from "@/lib/db";
import { BANNED_CARDS, BANLIST_UPDATED, banDate } from "@/lib/banlist";
import { cardImageSrc } from "@/lib/card-image-url";
import { formatMoney } from "@/lib/format";
import { COUNTRIES, DEFAULT_COUNTRY, priceField } from "@/lib/country";

// Every currently banned Riftbound card as a compact table — the FIRST thing
// under the ban-list guide's H1. DECISIONS.md, "Search snippets: answers in the
// title, from data", 2026-09-24. Rows are lib/banlist.ts's; thumbnails and
// prices are the live card rows.
//
// COST: one findMany over 13 slugs (unique index), five columns, on a page
// that is ISR for 24 hours. Prices are the default market's, labelled as such,
// because this page has no per-visitor market on the server. Fails open: a
// database error still renders every ban, without thumbnails or prices.
export async function BanListTable() {
  const field = priceField(DEFAULT_COUNTRY);
  const { currency } = COUNTRIES[DEFAULT_COUNTRY];
  type Row = { slug: string | null; imageUrl: string | null; imageThumbUrl: string | null } & Record<string, unknown>;
  const rows = (await prisma.card
    .findMany({
      where: { slug: { in: BANNED_CARDS.map((b) => b.slug) } },
      select: { slug: true, imageUrl: true, imageThumbUrl: true, [field]: true },
    })
    .catch(() => [])) as unknown as Row[];
  const bySlug = new Map(rows.map((r) => [r.slug, r]));

  return (
    <section aria-labelledby="banlist-table-h" className="card-surface mt-5 overflow-hidden" data-banlist-table>
      <h2 id="banlist-table-h" className="sr-only">
        Every banned Riftbound card
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-left text-sm">
          <thead className="border-b border-ink-800 bg-ink-900/60 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">Card</th>
              <th scope="col" className="px-3 py-2 font-semibold">Banned in</th>
              <th scope="col" className="px-3 py-2 font-semibold">Since</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Price ({currency})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800">
            {BANNED_CARDS.map((b) => {
              const r = bySlug.get(b.slug);
              const img = r ? cardImageSrc(r) : null;
              const price = r ? (r[field] as number | null) : null;
              return (
                <tr key={b.slug}>
                  <td className="px-3 py-1.5">
                    <Link href={`/card/${b.slug}`} className="flex items-center gap-2.5 font-semibold text-slate-100 hover:text-brand-300">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img} alt="" aria-hidden="true" width={28} height={39} loading="lazy" className="h-[39px] w-7 shrink-0 rounded-sm object-cover" />
                      ) : (
                        <span aria-hidden className="h-[39px] w-7 shrink-0 rounded-sm bg-ink-800" />
                      )}
                      {b.name}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-slate-300">
                    {b.formats.length === 2 ? "Standard + 2v2" : `${b.formats[0]} only`}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-slate-400">{banDate(b.effective)}</td>
                  <td className="num whitespace-nowrap px-3 py-1.5 text-right font-semibold text-white">
                    {price != null ? formatMoney(price, currency) : <span className="text-slate-600">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-ink-800 px-3 py-2 text-xs text-slate-400" data-banlist-updated>
        Updated {banDate(BANLIST_UPDATED)} · {BANNED_CARDS.length} cards banned (
        {BANNED_CARDS.filter((b) => b.formats.includes("Standard")).length} in Standard,{" "}
        {BANNED_CARDS.filter((b) => b.formats.includes("2v2")).length} in 2v2)
      </p>
    </section>
  );
}
