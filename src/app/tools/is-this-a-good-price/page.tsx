import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";
import { pageAlternates } from "@/lib/seo";
import { LinkChecker } from "@/components/LinkChecker";

// /tools/is-this-a-good-price (2026-11-08, the competitor scan's gap #7; the same checker runs on every sister site): a
// visitor pastes a store's link to a Riftbound single or sealed product and sees how its price compares with every store
// we read in that store's country. The copy and FAQ are in the server HTML; the checker is a client island that asks
// /api/check/<host> (bundled public data files only, CDN-cached a day). Nothing here reads data at render.
export const revalidate = 86400;

const PATH = "/tools/is-this-a-good-price";

export const metadata: Metadata = {
  title: { absolute: "Is This a Good Price? Riftbound Price Checker | RiftCompare" },
  description:
    "Paste a store's link to a Riftbound card or booster box and see if it's a good price against every store RiftCompare reads in your country. Free, no account.",
  alternates: pageAlternates(PATH),
  openGraph: {
    title: "Is this a good price? Riftbound price checker",
    description: "Paste any store's link and see how its price compares with the cheapest and the typical in-stock price.",
    url: `${SITE_URL}${PATH}`,
  },
};

const STEPS = [
  "Copy the address of the store's product page (in a phone browser: Share, then Copy).",
  "Paste it into the box. The checker looks it up straight away.",
  "Read the verdict and the cheapest and median in-stock prices beside it.",
  "If the page shows a different price now, type it to check again.",
];

const FAQS = [
  { q: "Which links does it work with?", a: "Product pages at any store RiftCompare reads, in any country we cover: it compares the price with the other stores in that store's country. Singles compare Near Mint copies of the same card and finish. For eBay, TCGplayer, Amazon and stores we don't read, it offers a search of our prices with the link's words." },
  { q: "Do you open the page I paste?", a: "No. The checker only reads the store's address and the product's part of the link, then looks it up in the listings we already read from that store every day." },
  { q: "Why is the store's price different from the page?", a: "We read each store once a day, so a price can change in between. Type the price the page shows now and the verdict updates." },
  { q: "What counts as a good price?", a: "The cheapest in-stock store price we found, or within 1% of it. Under the median (the middle in-stock store price) is fair; about the median is typical; above it, you can usually pay less elsewhere. eBay and TCGplayer are not counted as stores here." },
  { q: "Does it include postage?", a: "No. Every price is the store's own item price before postage. Best Basket works out the cheapest delivered order for a whole list." },
];

export default function IsThisAGoodPricePage() {
  const ld = [
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Tools", item: `${SITE_URL}/tools` },
        { "@type": "ListItem", position: 3, name: "Is this a good price?", item: `${SITE_URL}${PATH}` },
      ],
    },
    { "@context": "https://schema.org", "@type": "FAQPage", url: `${SITE_URL}${PATH}`, mainEntity: FAQS.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
  ];
  return (
    <div className="mx-auto max-w-4xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <div className="mb-5">
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <span>/</span>
          <Link href="/tools" className="hover:text-slate-300">Tools</Link>
          <span>/</span>
          <span className="text-slate-300">Is this a good price?</span>
        </nav>
        <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">Is this a good price?</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          Paste the link to a Riftbound single or sealed product at any store and see how its price compares with the cheapest and the typical in-stock price at every other store we read.
        </p>
      </div>

      <LinkChecker />

      <section className="card-surface mt-6 p-5">
        <h2 className="font-bold text-white">How to use it</h2>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-slate-400">
          {STEPS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </section>

      <section className="card-surface mt-6 divide-y divide-ink-800 overflow-hidden">
        <h2 className="px-6 py-4 text-lg font-extrabold text-white">Frequently asked questions</h2>
        {FAQS.map((f) => (
          <div key={f.q} className="px-6 py-4">
            <h3 className="font-semibold text-slate-100">{f.q}</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-400">{f.a}</p>
          </div>
        ))}
      </section>

      <p className="mt-6 text-sm text-slate-400">
        Buying a whole list? <Link href="/tools/best-basket" className="text-brand-400 hover:underline">Best Basket</Link> finds the cheapest delivered order. More in <Link href="/tools" className="text-brand-400 hover:underline">every tool</Link>.
      </p>
    </div>
  );
}
