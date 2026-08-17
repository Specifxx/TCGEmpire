import type { Metadata } from "next";
import { HubIntro } from "@/components/HubIntro";
import { HubFaq } from "@/components/HubFaq";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { hasAccount } from "@/lib/premium";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { SITE_URL } from "@/lib/site";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { faqPage } from "@/lib/jsonld";
import { BestBasket } from "@/components/BestBasket";

export const dynamic = "force-dynamic";

const TITLE = "Best Basket — Cheapest Way to Buy a Riftbound Deck | RiftCompare";
const DESCRIPTION =
  "Paste a Riftbound decklist or use your wishlist and get the cheapest way to buy every card across stores — postage and free-shipping thresholds included. Free with a RiftCompare account.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: pageAlternates("/tools/best-basket"),
  openGraph: pageOpenGraph({ title: TITLE, description: DESCRIPTION, url: "/tools/best-basket" }),
};

// Answers the questions a signed-out visitor actually has before they'll create
// the free account the tool is gated behind — this is also the substance a
// crawler sees while logged out, since the tool UI itself only renders past the
// gate (see BestBasketPage below).
const FAQS = [
  {
    q: "Is Best Basket really free?",
    a: "Yes. It's part of the free RiftCompare account tier — no card, no Premium subscription required. Create a free account and use it as many times as you like.",
  },
  {
    q: "Does it account for shipping?",
    a: "Yes — that's the whole point. Buying each card from its individual cheapest store usually spreads an order over a dozen stores and buries the saving in postage. Best Basket prices every viable split across the stores that stock your list, including each store's shipping cost and free-shipping thresholds, and ranks results by what you'd actually pay delivered.",
  },
  {
    q: "What can I paste in?",
    a: "Any decklist in standard list format, or your own wishlist/watchlist from your RiftCompare account. It matches by card name and set/collector number where given.",
  },
  {
    q: "Do I need an account just to price a list, not buy it?",
    a: "No — the free deck pricer at /deck needs no account if you only want per-card prices. Best Basket's account gate is specifically for the store-split optimisation.",
  },
];

// Decode the base64 ?list= param the way DeckBuilder/deck pages encode it
// (btoa(unescape(encodeURIComponent(text))) client-side, the equivalent
// Buffer.from(text, "utf8").toString("base64") server-side — see /deck/page.tsx's
// identically-named helper). Returns "" on anything malformed, never throws.
function decodeList(b64: string): string {
  try {
    return decodeURIComponent(escape(atob(b64)));
  } catch {
    return "";
  }
}

export default async function BestBasketPage({ searchParams }: { searchParams: { list?: string } }) {
  const user = await getCurrentUser();
  // ACCOUNT tier, not Premium — a free account is the whole gate here.
  const signedIn = hasAccount(user);
  const country = getCountry();
  const info = COUNTRIES[country];
  // A deck page can hand off its own list via ?list= (see decks/[slug]/page.tsx's
  // bestBasketHref) — decoded here rather than left to the client so a signed-in
  // visitor's basket runs immediately with no extra round trip.
  const initialList = searchParams.list ? decodeList(searchParams.list) : undefined;

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
                { "@type": "ListItem", position: 3, name: "Best Basket", item: `${SITE_URL}/tools/best-basket` },
              ],
            },
            {
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "Riftbound Best Basket Optimiser",
              url: `${SITE_URL}/tools/best-basket`,
              applicationCategory: "UtilitiesApplication",
              operatingSystem: "Web",
              offers: { "@type": "Offer", price: "0", priceCurrency: info.currency },
              description:
                "Find the cheapest way to buy a whole Riftbound deck or wishlist across stores — postage and free-shipping thresholds included.",
            },
            faqPage(FAQS),
          ].filter(Boolean)),
        }}
      />
      <div className="mb-5">
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-slate-300">Home</Link>
          <span>/</span>
          <span className="text-slate-300">Best Basket</span>
        </nav>
        <h1 className="font-display text-2xl font-extrabold text-white sm:text-3xl">Best Basket Optimiser</h1>
      <HubIntro path="/tools/best-basket" />
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
          The cheapest way to actually <strong className="text-slate-200">buy</strong> a whole deck or wishlist — not just the
          lowest price per card, but the lowest <strong className="text-slate-200">landed total</strong> across {info.adjective}{" "}
          stores once postage and free-shipping thresholds are factored in. Buying each card from its cheapest store usually
          spreads your order over a dozen stores and buries you in postage; this finds the smarter split.
        </p>
      </div>

      {signedIn ? (
        <BestBasket currency={info.currency} initialList={initialList} />
      ) : (
        <div className="card-surface p-6 text-center">
          <h2 className="text-lg font-extrabold text-white">Sign in to use Best Basket</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
            Best Basket is free with a RiftCompare account — no card, no Premium. Paste any decklist or use your
            wishlist and we&apos;ll work out the cheapest combination of stores to buy it all, postage included, with
            direct buy links.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Link
              href={`/login?next=${encodeURIComponent(searchParams.list ? `/tools/best-basket?list=${searchParams.list}` : "/tools/best-basket")}`}
              className="btn-primary text-sm"
            >
              Create a free account
            </Link>
            <Link href="/tools" className="btn-ghost text-sm">Browse free tools</Link>
          </div>
          <p className="mt-4 text-xs text-slate-600">
            Just want per-card prices? The <Link href="/deck" className="text-brand-400 hover:underline">deck pricer</Link>{" "}
            needs no account.
          </p>
        </div>
      )}

      {/* Rendered regardless of sign-in state, so a signed-out visitor — and the
          crawler that indexes this page while logged out — gets real substance
          beyond the gate card above, not just a login prompt. */}
      <HubFaq faqs={FAQS} />
    </div>
  );
}
