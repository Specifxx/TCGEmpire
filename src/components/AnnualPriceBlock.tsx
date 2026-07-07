import { PREMIUM_PRICE_AMOUNT, PREMIUM_ANNUAL_AMOUNT, PREMIUM_ANNUAL_PERIOD, annualSavingPct } from "@/lib/site";

// The annual price, styled to make the saving pop: the "if you paid monthly" yearly
// total struck through, the annual price big, and a glowing green SAVE badge +
// per-month equivalent. Presentational only (no hooks), so it's usable in both the
// server /premium page and the client Premium dialog. Market-terminal theme.
const num = (s: string) => Number(s.replace(/[^0-9.]/g, "")) || 0;

export function AnnualPriceBlock({ size = "lg" }: { size?: "lg" | "sm" }) {
  const monthly = num(PREMIUM_PRICE_AMOUNT);
  const annual = num(PREMIUM_ANNUAL_AMOUNT);
  const fullYear = monthly ? `$${(monthly * 12).toFixed(2)}` : "";
  const perMonth = annual ? `$${(annual / 12).toFixed(2)}` : "";
  const save = annualSavingPct();
  const big = size === "lg" ? "text-4xl" : "text-3xl";

  return (
    <div>
      <div className="flex items-baseline justify-center gap-2">
        {fullYear && <span className="text-base text-slate-600 line-through">{fullYear}</span>}
        <span className={`num ${big} font-extrabold text-white`}>{PREMIUM_ANNUAL_AMOUNT}</span>
        <span className="text-sm text-slate-400">/{PREMIUM_ANNUAL_PERIOD}</span>
      </div>
      <div className="mt-2 flex items-center justify-center gap-2">
        {save > 0 && (
          <span className="inline-flex items-center gap-1 rounded-md bg-brand-500/15 px-2.5 py-1 text-xs font-extrabold uppercase tracking-wider text-brand-300 ring-1 ring-brand-500/40 shadow-[0_0_14px_rgba(52,209,126,0.28)]">
            <span aria-hidden>▼</span> Save {save}%
          </span>
        )}
        {perMonth && <span className="num text-xs text-slate-400">≈ {perMonth}/mo</span>}
      </div>
    </div>
  );
}
