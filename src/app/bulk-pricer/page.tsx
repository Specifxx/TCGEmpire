import type { Metadata } from "next";
import Link from "next/link";
import { HubIntro } from "@/components/HubIntro";
import type { Prisma } from "@prisma/client";
import { BulkPricer } from "@/components/BulkPricer";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isPremium } from "@/lib/premium";
import { PremiumButton } from "@/components/PremiumButton";
import { getCountry, getDisplayCurrency } from "@/lib/get-country";
import { pickPrice, priceField, COUNTRIES } from "@/lib/country";
import { gbpCentsToEur } from "@/lib/fx";
import { parseDeckList } from "@/lib/deck";
import { normalizeSearch, formatMoney } from "@/lib/format";
import { SITE_URL } from "@/lib/site";
import { Breadcrumbs } from "@/components/Breadcrumbs";

// Reads the session to decide the gate, so it can't be statically rendered. (It
// already read cookies for the market in generateMetadata; this makes it explicit.)
export const dynamic = "force-dynamic";

const TITLE = "Bulk Riftbound Card Price Checker";
const DESC =
  "Paste any list of Riftbound card names and price every one at once — each matched to its cheapest live store price, with a running total. A RiftCompare Premium tool.";

// Decode the base64 ?list= param the way BulkPricer encodes it
// (btoa(unescape(encodeURIComponent(text)))). Returns "" on anything malformed.
function decodeList(b64: string): string {
  try {
    return decodeURIComponent(escape(atob(b64)));
  } catch {
    return "";
  }
}

// Mirrors BulkPricer's client-side ensureQuantities() so a shared link's OG image
// prices the same way the page itself will once it auto-prices client-side.
function ensureQuantities(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#")) return line;
      return /^\d+\s*[xX]?\s+\S/.test(trimmed) ? line : `1 ${trimmed}`;
    })
    .join("\n");
}

// NOTE: the layout's title template appends "— RiftCompare"; don't add it here.
// Shared links carry ?list=; price the list server-side and unfurl with a dynamic
// OG card ("This list is worth $X") so a shared link pulls people in.
export async function generateMetadata({ searchParams }: { searchParams: { list?: string } }): Promise<Metadata> {
  const base: Metadata = { title: TITLE, description: DESC, alternates: { canonical: "/bulk-pricer" } };
  const raw = searchParams.list ? decodeList(searchParams.list) : "";
  if (!raw.trim()) return base;

  try {
    const country = getCountry();
    const lines = parseDeckList(ensureQuantities(raw)).slice(0, 200);
    const nqs = [...new Set(lines.filter((l) => l.name).map((l) => normalizeSearch(l.name)))];
    if (!nqs.length) return base;

    const cards = await prisma.card.findMany({
      where: { nameNormalized: { in: nqs } },
      select: { nameNormalized: true, lowestPriceCents: true, lowestPriceCentsUs: true, lowestPriceCentsUk: true, lowestPriceCentsSg: true, lowestPriceCentsCa: true, lowestPriceCentsDe: true },
      orderBy: [{ [priceField(country)]: { sort: "asc", nulls: "last" } } as Prisma.CardOrderByWithRelationInput],
    });
    const byName = new Map<string, (typeof cards)[number]>();
    for (const c of cards) if (!byName.has(c.nameNormalized)) byName.set(c.nameNormalized, c);

    let total = 0;
    let qty = 0;
    for (const l of lines) {
      qty += l.qty;
      const c = l.name ? byName.get(normalizeSearch(l.name)) : undefined;
      const p = c ? pickPrice(c, country) : null;
      if (p != null) total += p * l.qty;
    }
    if (total <= 0) return base;

    const currency = getDisplayCurrency(country);
    const stat = formatMoney(country === "UK" && currency === "EUR" ? gbpCentsToEur(total) : total, currency);
    const sub = `${qty} cards · priced free on RiftCompare`;
    const img = `${SITE_URL}/api/og?t=${encodeURIComponent("LIST VALUE")}&s=${encodeURIComponent(stat)}&l=${encodeURIComponent(
      "total"
    )}&b=${encodeURIComponent(sub)}&c=${encodeURIComponent("#f5a524")}`;

    return {
      ...base,
      openGraph: { title: `This card list is worth ${stat}`, description: sub, images: [{ url: img, width: 1200, height: 630 }] },
      twitter: { card: "summary_large_image", title: `This card list is worth ${stat}`, description: sub, images: [img] },
    };
  } catch {
    return base;
  }
}

export default async function BulkPricerPage({ searchParams }: { searchParams: { list?: string } }) {
  const info = COUNTRIES[getCountry()];
  // PREMIUM tier (see lib/premium.ts). Only the TOOL is gated — the heading, intro
  // and hub copy above it still render for everyone, so the page stays indexable
  // and a shared ?list= link still unfurls its "this list is worth $X" OG card.
  const user = await getCurrentUser();
  const premium = isPremium(user);
  return (
    <div>
      <Breadcrumbs trail={[{ name: "Bulk Price Checker", href: "/bulk-pricer" }]} />
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold text-white">Bulk Card Price Checker</h1>
      <HubIntro path="/bulk-pricer" />
        <p className="mt-1 text-sm text-slate-400">
          Paste a list of card names — a want-list, a trade, a stack you&apos;re selling — and get every card
          matched with the cheapest {info.adjective} price and a running total. A RiftCompare Premium tool.
        </p>
      </div>
      {premium ? (
        <BulkPricer initialList={searchParams.list} />
      ) : (
        <div className="card-surface p-6 text-center">
          <h2 className="text-lg font-extrabold text-white">Go Premium to price a whole list</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
            The bulk pricer is a RiftCompare Premium tool. Upgrade and price an entire want-list, trade pile or
            collection in one paste.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {user ? <PremiumButton /> : <Link href="/login?next=/bulk-pricer" className="btn-primary text-sm">Sign in free</Link>}
            <Link href="/tools" className="btn-ghost text-sm">Browse free tools</Link>
          </div>
          <p className="mt-4 text-xs text-slate-600">
            Pricing a single deck? The <Link href="/deck" className="text-brand-400 hover:underline">deck builder</Link>{" "}
            needs no account.
          </p>
        </div>
      )}
    </div>
  );
}
