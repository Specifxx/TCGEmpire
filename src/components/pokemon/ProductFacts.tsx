import Link from "next/link";
import { formatMoney } from "@/lib/format";
import { kindInfo } from "@/lib/pokemon/kinds";
import { kindNoun } from "@/lib/pokemon/format";
import { formatPerPack } from "@/lib/pokemon/value";
import type { ProductFacts as Facts, ProseBlock } from "@/lib/pokemon/product-facts";

// The product page's data-led paragraphs (lib/pokemon/product-facts.ts) and,
// when the US catalogue was readable, the same kind across the newest released
// sets. Server-rendered text: the page is ISR with no cookie, so every figure
// here is the US one and says so.
export function ProductFacts({ facts, prose }: { facts: Facts; prose: ProseBlock[] }) {
  if (!prose.length) return null;
  const same = facts.sameKind;
  const plural = kindNoun(kindInfo(facts.kind), 2);
  const perPack = prose.some((b) => b.id === "pack-math" || b.id === "set-per-pack" || b.id === "same-kind");
  return (
    <section className="card-surface mt-6 p-5" aria-labelledby="pk-product-facts">
      <h2 id="pk-product-facts" className="text-lg font-extrabold text-white">
        {perPack ? "Price per pack and how it compares" : "Where it is listed"}
      </h2>
      <div className="mt-2 max-w-3xl space-y-2 text-sm leading-relaxed text-slate-300">
        {prose.map((b) => (
          <p key={b.id} data-block={b.id}>
            {b.text}
          </p>
        ))}
      </div>
      {same && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {plural.charAt(0).toUpperCase() + plural.slice(1)} from recent sets · US prices
          </h3>
          {/* Scrolls inside its own box, never the page, at 390 px. */}
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3 font-semibold">Set and product</th>
                  <th className="py-2 pr-3 font-semibold">Cheapest US listing</th>
                  <th className="hidden py-2 font-semibold sm:table-cell">Per pack</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800">
                {same.rows.map((r) => (
                  <tr key={r.slug} className={r.isThis ? "bg-brand-500/5" : undefined}>
                    {/* overflow-wrap:anywhere lets a "[Glaceon/Vaporeon/…]" name wrap, so the table fits a phone. */}
                    <td className="py-2 pr-3 [overflow-wrap:anywhere]">
                      <span className="block text-xs text-slate-500">{r.setName}</span>
                      {r.isThis ? (
                        <span className="font-semibold text-white">{r.name}</span>
                      ) : (
                        <Link href={`/pokemon/sealed/${r.slug}`} className="text-brand-400 hover:underline">
                          {r.name}
                        </Link>
                      )}
                    </td>
                    {/* Below sm the per-pack figure sits under the price: two columns fit a phone. */}
                    <td className="num py-2 pr-3 text-slate-200">
                      <span className="whitespace-nowrap">{formatMoney(r.cents, "USD")}</span>
                      <span className="block whitespace-nowrap text-xs font-semibold text-white sm:hidden">{formatPerPack(r.perPackCents, "USD")}</span>
                    </td>
                    <td className="num hidden whitespace-nowrap py-2 font-semibold text-white sm:table-cell">{formatPerPack(r.perPackCents, "USD")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Each set&apos;s cheapest product of this kind by listing price{same.added ? ", and this one" : ""}: item price, postage
            extra
            {facts.asOf ? `, ${facts.asOf}` : ""}.
          </p>
        </div>
      )}
    </section>
  );
}
