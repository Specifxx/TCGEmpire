"use client";

// "Is this box worth it?" (Job A follow-ups, 2026-11-26): a small card on a Booster Box or Booster Case page with the
// expected value of opening one box of the set, from TCGplayer US market prices and the calculator's default pull
// rates (lib/box-ev-summary.ts), set beside today's cheapest box on this page in the visitor's market, and ONE link
// to /tools/box-ev. Converted from USD for display (lib/fx.ts), and it says so. The server passes nothing when a set
// is too thinly priced, so the card never shows an invented number. Not an ad, not a prompt: no dismiss, no popup.
import Link from "next/link";
import { useCountry } from "@/components/CountryProvider";
import type { Country } from "@/lib/country";
import { convertUsdCents, gbpCentsToEur } from "@/lib/fx";
import { formatMoney } from "@/lib/format";
import { trackEvent } from "@/lib/analytics";

export function BoxEvCard({
  setCode,
  setName,
  evBoxUsdCents,
  isCase,
  boxPrices,
}: {
  setCode: string;
  setName: string;
  evBoxUsdCents: number;
  isCase: boolean;
  /** This page's cheapest open price per market, in that market's own currency (Booster Box pages only). */
  boxPrices: Partial<Record<Country, number>>;
}) {
  const { country, currency, isEurDisplay } = useCountry();
  const ev = convertUsdCents(evBoxUsdCents, currency);
  const native = isCase ? null : boxPrices[country] ?? null;
  const price = native == null ? null : isEurDisplay ? gbpCentsToEur(native) : native;
  const ratio = price && price > 0 ? ev / price : null;
  const money = (c: number) => formatMoney(c, currency);
  const verdict =
    ratio == null
      ? null
      : ratio >= 1
        ? { tone: "text-emerald-300", text: "On average, the cards inside are worth about what this box costs, or more. Any single box can land well under that." }
        : ratio >= 0.85
          ? { tone: "text-gold", text: "Roughly break-even: open it for the fun of it, not to make money." }
          : { tone: "text-slate-300", text: "The box costs more than its cards' average value, so if you want particular cards, buying them as singles is cheaper." };
  return (
    <section aria-labelledby="box-ev-card" className="card-surface mt-6 p-4 sm:p-5" data-box-ev-card={setCode}>
      <h2 id="box-ev-card" className="text-base font-bold text-white">
        Is this box worth it?
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-300">
        {isCase ? "Each booster box in this case opens" : "Opened, an average box opens"} to about{" "}
        <span className="num font-semibold text-white">{money(ev)}</span> in {setName} singles
        {price != null && (
          <>
            , against <span className="num font-semibold text-white">{money(price)}</span> for the cheapest box on this page
            {ratio != null && <> ({Math.round(ratio * 100)}% of the price)</>}
          </>
        )}
        .
      </p>
      {verdict && <p className={`mt-1 text-sm leading-6 ${verdict.tone}`}>{verdict.text}</p>}
      <p className="mt-2 text-xs leading-5 text-slate-500">
        Expected value at TCGplayer&rsquo;s US market prices, converted from US dollars{currency === "USD" ? "" : " at an approximate rate"}, with
        Riot&rsquo;s published pull rates (the Showcase rate is our estimate). It is an average over many boxes, not what one box will hold.
      </p>
      <Link
        href={`/tools/box-ev?set=${encodeURIComponent(setCode)}`}
        prefetch={false}
        onClick={() => trackEvent("box_ev_card", { set: setCode, case: isCase, ratio: ratio == null ? undefined : Math.round(ratio * 100) })}
        className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-brand-300 underline underline-offset-2 hover:text-white"
      >
        Work it out in the box value calculator →
      </Link>
    </section>
  );
}
