import type { Metadata } from "next";
import Link from "next/link";
import { HubFaq } from "@/components/HubFaq";
import { getCurrentUser } from "@/lib/auth";
import { isPremium } from "@/lib/premium";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { SITE_URL } from "@/lib/site";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { faqPage } from "@/lib/jsonld";
import { PremiumButton } from "@/components/PremiumButton";
import { ConditionCalculator } from "@/components/ConditionCalculator";

export const dynamic = "force-dynamic";

const TITLE = "Condition Impact Calculator — NM vs LP vs MP Value | RiftCompare";
const DESCRIPTION =
  "Estimate how a Riftbound card's value changes between conditions — NM, LP, MP, HP, DMG — using the same multipliers your portfolio is valued with. A RiftCompare Premium tool.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: pageAlternates("/tools/condition-calculator"),
  openGraph: pageOpenGraph({ title: TITLE, description: DESCRIPTION, url: "/tools/condition-calculator" }),
};

const FAQS = [
  {
    q: "How is the condition value estimated?",
    a: "By applying the same relative multiplier RiftCompare uses to value your portfolio to the card's current lowest live price: NM 100%, LP 85%, MP 70%, HP 55%, DMG 40%. It's a reference estimate, not a guaranteed resale value — individual listings vary, and some cards trade at different multipliers depending on demand.",
  },
  {
    q: "Is this the same scale my portfolio uses?",
    a: "Yes — exactly the same CONDITION_MULTIPLIER table values every holding in your portfolio's total. This tool just lets you run the same math forward on any card, before you own it or before you decide what condition to sell at.",
  },
  {
    q: "Why is this Premium?",
    a: "It's one of the tools bundled with RiftCompare Premium, alongside the Bulk Pricer, Value Finder, Rising Cards and the full Deal Finder list.",
  },
];

export default async function ConditionCalculatorPage() {
  const user = await getCurrentUser();
  const premium = isPremium(user);
  const country = getCountry();
  const info = COUNTRIES[country];

  return (
    <div className="mx-auto max-w-3xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
                { "@type": "ListItem", position: 2, name: "Tools", item: `${SITE_URL}/tools` },
                { "@type": "ListItem", position: 3, name: "Condition Impact Calculator", item: `${SITE_URL}/tools/condition-calculator` },
              ],
            },
            {
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "Riftbound Condition Impact Calculator",
              url: `${SITE_URL}/tools/condition-calculator`,
              applicationCategory: "UtilitiesApplication",
              operatingSystem: "Web",
              offers: { "@type": "Offer", price: "0", priceCurrency: info.currency },
              description: "Estimate how a Riftbound card's value changes between conditions (NM, LP, MP, HP, DMG).",
            },
            faqPage(FAQS),
          ]),
        }}
      />
      <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-slate-300">Home</Link>
        <span>/</span>
        <Link href="/tools" className="hover:text-slate-300">Tools</Link>
        <span>/</span>
        <span className="text-slate-300">Condition Impact Calculator</span>
      </nav>
      <div className="mb-5">
        <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">Condition Impact Calculator</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          See how much a card&apos;s value moves between conditions — NM, LP, MP, HP, DMG — before you buy, sell or
          grade a copy. Uses the same multiplier scale your portfolio is valued with.
        </p>
      </div>

      {premium ? (
        <ConditionCalculator country={country} currency={info.currency} />
      ) : (
        <div className="card-surface p-6 text-center">
          <h2 className="text-lg font-extrabold text-white">Go Premium to use the calculator</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
            Search any card and compare its estimated value across conditions instantly.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {user ? <PremiumButton /> : <Link href="/login?next=/tools/condition-calculator" className="btn-primary text-sm">Sign in free</Link>}
            <Link href="/tools" className="btn-ghost text-sm">Browse free tools</Link>
          </div>
        </div>
      )}

      <HubFaq faqs={FAQS} />
    </div>
  );
}
