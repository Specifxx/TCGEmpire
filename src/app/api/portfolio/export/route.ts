import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getPortfolio, isPremium, PORTFOLIO_FREE } from "@/lib/premium";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";

export const dynamic = "force-dynamic";

const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

// Download the collection as CSV (current values, condition-adjusted). Free while
// PORTFOLIO_FREE; otherwise a Premium feature.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in", { status: 401 });
  if (!isPremium(user) && !PORTFOLIO_FREE) return new Response("CSV export is a Premium feature", { status: 403 });

  const country = getCountry();
  const currency = COUNTRIES[country].currency;
  const p = await getPortfolio(user.id, country);

  const lines = [
    `name,set,number,condition,foil,quantity,unit_${currency.toLowerCase()},value_${currency.toLowerCase()}`,
    ...p.holdings.map((h) =>
      [
        esc(h.name), h.setCode, esc(h.collectorNumber), h.condition, h.isFoil ? "yes" : "no",
        h.quantity,
        h.unitCents != null ? (h.unitCents / 100).toFixed(2) : "",
        (h.valueCents / 100).toFixed(2),
      ].join(",")
    ),
    `TOTAL,,,,,,,${(p.totalCents / 100).toFixed(2)}`,
  ];
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="riftcompare-portfolio-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
