import { SaleSeasonPage, saleMetadata } from "@/components/SaleSeasonPage";

// One URL kept every year (DECISIONS.md, "Seasonal sale pages", 2026-11-02). Six hours, the
// floor for pages buyers act on; the page reads getCountry(), so it renders per request anyway.
export const revalidate = 21600;

export const generateMetadata = () => saleMetadata("january-sales");

export default function Page() {
  return <SaleSeasonPage slug="january-sales" />;
}
