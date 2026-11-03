import type { Metadata } from "next";
import { RETAILER_LIST } from "@/lib/retailers";
import { pageAlternates } from "@/lib/seo";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { HowWePickStores } from "@/components/HowWePickStores";

// The store-vetting page every Compare Empire site shares (owner, 2026-11-02;
// docs/store-vetting.md). Static: no database read.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "How We Pick Stores",
  description: "How RiftCompare checks every Riftbound store before listing it, keeps checking it every week, and how to report a store.",
  alternates: pageAlternates("/how-we-pick-stores"),
};

export default function HowWePickStoresPage() {
  return (
    <div className="mx-auto max-w-3xl text-slate-200">
      <Breadcrumbs
        className="mb-4"
        trail={[
          { name: "Stores", href: "/stores/tracked" },
          { name: "How we pick stores", href: "/how-we-pick-stores" },
        ]}
      />
      <HowWePickStores
        site="RiftCompare"
        what="Riftbound cards"
        stores={RETAILER_LIST.map((r) => r.name)}
        priceRule="A store single priced under a quarter of TCGplayer's market price is dropped automatically, and sealed product has a minimum price per product type."
        marketplaces="eBay, TCGplayer and Cardmarket rows are marketplaces, not stores: they are labelled and never counted as a store. We don't vet the individual sellers there, so check a seller's feedback before you buy."
        buttonClassName="btn-primary"
        suggestHref="/stores/suggest"
      />
    </div>
  );
}
