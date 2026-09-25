import type { Metadata } from "next";
import { HubIntro } from "@/components/HubIntro";
import type { Prisma } from "@prisma/client";
import { DeckBuilder } from "@/components/DeckBuilder";
import { prisma } from "@/lib/db";
import { getCountry, getDisplayCurrency } from "@/lib/get-country";
import { pickPrice, priceField, COUNTRIES } from "@/lib/country";
import { gbpCentsToEur } from "@/lib/fx";
import { parseDeckList, resolveDeckLines } from "@/lib/deck";
import { formatMoney } from "@/lib/format";
import { SITE_URL } from "@/lib/site";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { pageAlternates } from "@/lib/seo";

const TITLE = "Riftbound Deck Builder & Deck Price Calculator";
const DESC =
  "Paste any Riftbound decklist or card list and price every card instantly — each one matched to its cheapest live store price, with a full total. Free deck builder and bulk price checker.";

// Decode the base64 ?list= param the way DeckBuilder encodes it
// (btoa(unescape(encodeURIComponent(text)))). Returns "" on anything malformed.
function decodeList(b64: string): string {
  try {
    return decodeURIComponent(escape(atob(b64)));
  } catch {
    return "";
  }
}

// NOTE: the layout's title template appends "— RiftCompare"; don't add it here.
// Shared deck links carry ?list=; price the deck server-side and unfurl with a
// dynamic OG card ("This Riftbound deck costs $X") so a shared list pulls people in.
// Resolved exactly the way the page's own pricer resolves it (lib/deck.ts's
// resolveDeckLines — set + number, then name, then the capped fallback), so the
// card and the page quote the same total.
export async function generateMetadata({ searchParams }: { searchParams: { list?: string } }): Promise<Metadata> {
  const base: Metadata = { title: TITLE, description: DESC, alternates: pageAlternates("/deck") };
  const raw = searchParams.list ? decodeList(searchParams.list) : "";
  if (!raw.trim()) return base;

  try {
    const country = getCountry();
    const orderBy = [{ [priceField(country)]: { sort: "asc", nulls: "last" } } as Prisma.CardOrderByWithRelationInput];
    const { matched } = await resolveDeckLines(parseDeckList(raw, { plainNames: true }), (args) =>
      prisma.card.findMany({
        ...args,
        select: {
          id: true,
          nameNormalized: true,
          setCode: true,
          collectorNumber: true,
          lowestPriceCents: true,
          lowestPriceCentsUs: true,
          lowestPriceCentsUk: true,
          lowestPriceCentsSg: true,
          lowestPriceCentsCa: true,
          lowestPriceCentsEu: true,
        },
        orderBy,
      })
    );

    let total = 0;
    let qty = 0;
    for (const m of matched) {
      qty += m.line.qty;
      const p = pickPrice(m.card, country);
      if (p != null) total += p * m.line.qty;
    }
    if (total <= 0) return base;

    const currency = getDisplayCurrency(country);
    const stat = formatMoney(country === "UK" && currency === "EUR" ? gbpCentsToEur(total) : total, currency);
    const sub = `${qty} cards · priced free on RiftCompare`;
    const img = `${SITE_URL}/api/og?t=${encodeURIComponent("DECK COST")}&s=${encodeURIComponent(stat)}&l=${encodeURIComponent(
      "to build"
    )}&b=${encodeURIComponent(sub)}&c=${encodeURIComponent("#f5a524")}`;

    return {
      ...base,
      openGraph: { title: `This Riftbound deck costs ${stat}`, description: sub, images: [{ url: img, width: 1200, height: 630 }] },
      twitter: { card: "summary_large_image", title: `This Riftbound deck costs ${stat}`, description: sub, images: [img] },
    };
  } catch {
    return base;
  }
}

export default function DeckPage({ searchParams }: { searchParams: { list?: string } }) {
  const info = COUNTRIES[getCountry()];
  return (
    <div>
      <Breadcrumbs trail={[{ name: "Deck Builder", href: "/deck" }]} />
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold text-white">Deck Builder &amp; Pricing</h1>
      <HubIntro path="/deck" />
        <p className="mt-1 text-sm text-slate-400">
          Paste a Riftbound decklist — or any list of card names — and get every card matched with the cheapest
          {" "}{info.adjective} price and a full total. It&apos;s also a free bulk price checker: plain names work without
          quantities, anything we can&apos;t match is listed rather than dropped, and you can search and add cards or change
          quantities as you go.
        </p>
      </div>
      <DeckBuilder initialList={searchParams.list} />
    </div>
  );
}
