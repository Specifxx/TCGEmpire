import type { Metadata } from "next";
import { HubIntro } from "@/components/HubIntro";
import { HubFaq } from "@/components/HubFaq";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { isPremium } from "@/lib/premium";
import { getCountry } from "@/lib/get-country";
import { COUNTRIES } from "@/lib/country";
import { SITE_URL } from "@/lib/site";
import { pageAlternates, pageOpenGraph } from "@/lib/seo";
import { faqPage } from "@/lib/jsonld";
import { BestBasket, type BasketSource } from "@/components/BestBasket";

export const dynamic = "force-dynamic";

const TITLE = "Best Basket — Cheapest Way to Buy a Riftbound Deck | RiftCompare";
const DESCRIPTION =
  "Paste a Riftbound decklist, or send your watchlist or binder, and get the cheapest delivered way to buy it across stores — postage and free-shipping thresholds included. Premium shows the store-by-store plan beside the best one-store and two-store orders.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: pageAlternates("/tools/best-basket"),
  openGraph: pageOpenGraph({ title: TITLE, description: DESCRIPTION, url: "/tools/best-basket" }),
};

// What a visitor wants to know before signing in or upgrading — also the
// substance a crawler sees while logged out, since the tool itself renders only
// for a signed-in account. Every claim here is something the tool does today.
const FAQS = [
  {
    q: "Is Best Basket free?",
    a: "Partly. Any signed-in account can see its own delivered total — what the list costs delivered, from how many stores, and how much less that is than buying each card's cheapest copy separately — up to 5 times a day. The store-by-store plan, with the best one-store and two-store orders beside it and a link for every card, is a RiftCompare Premium tool.",
  },
  {
    q: "Does it account for shipping?",
    a: "Yes — that's the whole point. Buying each card from its individual cheapest store usually spreads an order over a dozen stores and buries the saving in postage. Best Basket searches store combinations for the lowest total including each store's postage and free-shipping threshold. With Premium it also shows the best one-store and two-store orders beside it.",
  },
  {
    q: "What can I paste in?",
    a: "Any decklist or card list, one card per line — with quantities (\"3 Jinx, Loose Cannon\") or plain names. A set code like (OGN-251) picks that exact printing. Section headers are skipped, and any line we can't match is listed back to you rather than dropped. A list is priced up to its first 200 lines, and the page tells you when yours runs past that. Signed in, you can also send your watchlist and tick \"Skip copies I already own\", or price what replacing your binder would cost.",
  },
  {
    q: "Is the cheapest split guaranteed to be the cheapest possible?",
    a: "It's the cheapest the search finds, not a proof — with free-shipping thresholds there's no fast exact answer. It is never dearer than buying each card's cheapest copy separately, or than the single-store and two-store orders shown beside it so you can compare. The single-store order is the cheapest one store offers; the two-store order is the cheapest split the search finds, shown only when it beats buying everything from one store.",
  },
  {
    q: "Do I need Premium just to price a list, not buy it?",
    a: "No — the free deck and list pricer at /deck needs no account at all if you only want per-card prices. Premium is only needed for Best Basket's store-by-store plan.",
  },
];

// Decode the base64 ?list= param the way DeckBuilder encodes it
// (btoa(unescape(encodeURIComponent(text))) — see /deck/page.tsx's
// identically-named helper). Returns "" on anything malformed, never throws.
function decodeList(b64: string): string {
  try {
    return decodeURIComponent(escape(atob(b64)));
  } catch {
    return "";
  }
}

interface Params {
  list?: string;
  source?: string;
  skipOwned?: string;
}

// This page's own URL with its entry parameters, for the sign-in round trip.
function selfHref(sp: Params): string {
  const q = new URLSearchParams();
  if (sp.list) q.set("list", sp.list);
  if (sp.source === "watchlist" || sp.source === "binder") q.set("source", sp.source);
  if (sp.skipOwned === "1") q.set("skipOwned", "1");
  const qs = q.toString();
  return qs ? `/tools/best-basket?${qs}` : "/tools/best-basket";
}

export default async function BestBasketPage({ searchParams }: { searchParams: Params }) {
  const user = await getCurrentUser();
  // The store-by-store plan is PREMIUM (see lib/premium.ts); any account gets
  // the preview. The route enforces the same split — this only picks the UI.
  const premium = isPremium(user, "premium");
  const country = getCountry();
  const info = COUNTRIES[country];
  // Entry points: /deck's "Buy this deck for less" (?list=), /watching
  // (?source=watchlist), the portfolio's replacement panel (?source=binder),
  // each optionally with ?skipOwned=1. Decoded here so a Premium visitor's
  // basket runs straight away; a free preview waits for a click.
  const initialList = searchParams.list ? decodeList(searchParams.list) : undefined;
  const initialSource: BasketSource =
    searchParams.source === "watchlist" || searchParams.source === "binder" ? searchParams.source : "deck";
  const handedIn = initialSource !== "deck" || !!initialList?.trim();

  return (
    <div className="mx-auto max-w-4xl">
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
            // No `offers`: the full tool is paid, and the zero-price Offer this
            // used to carry told search engines otherwise.
            {
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "Riftbound Best Basket Optimiser",
              url: `${SITE_URL}/tools/best-basket`,
              applicationCategory: "UtilitiesApplication",
              operatingSystem: "Web",
              description:
                "Find the cheapest delivered way to buy a whole Riftbound deck or card list across stores — postage and free-shipping thresholds included.",
            },
            faqPage(FAQS),
          ]),
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
          The cheapest way to actually <strong className="text-slate-200">buy</strong> a whole deck or card list — not just the
          lowest price per card, but the lowest <strong className="text-slate-200">delivered total</strong> across {info.adjective}{" "}
          stores once postage and free-shipping thresholds are counted. Buying each card from its cheapest store usually spreads your
          order over a dozen stores and buries you in postage; this searches for a better split. With Premium it shows that split
          store by store, beside the best one-store and two-store orders.
        </p>
      </div>

      {user ? (
        <BestBasket
          full={premium}
          initialList={initialList}
          initialSource={initialSource}
          initialSkipOwned={searchParams.skipOwned === "1"}
          autoRun={premium && handedIn}
        />
      ) : (
        <div className="card-surface p-6 text-center">
          <h2 className="text-lg font-extrabold text-white">Sign in to price your list, delivered</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
            A free account shows what your list costs delivered, from how many stores, and how much less that is than buying each
            card&apos;s cheapest copy. Premium adds the store-by-store plan.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Link
              href={`/login?next=${encodeURIComponent(selfHref(searchParams))}&src=tool_gate`}
              // nofollow, same reason as every other dynamic ?next= target (see
              // components/UserMenu.tsx) — with a list= present this mints one more
              // unique, crawler-inert /login?next=... URL per handed-in list. The
              // list survives the round trip, so a /deck handoff isn't lost.
              rel="nofollow"
              className="btn-primary text-sm"
            >
              Sign in free
            </Link>
            <Link href="/tools" className="btn-ghost text-sm">Browse free tools</Link>
          </div>
          <p className="mt-4 text-xs text-slate-600">
            Just want per-card prices? The <Link href="/deck" className="text-brand-400 hover:underline">deck and list pricer</Link>{" "}
            needs no account.
          </p>
        </div>
      )}

      {/* Rendered regardless of sign-in state, so a signed-out visitor — and the
          crawler that indexes this page while logged out — gets real substance
          beyond the sign-in card above. */}
      <HubFaq faqs={FAQS} />
    </div>
  );
}
