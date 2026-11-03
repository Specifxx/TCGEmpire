// Amazon Associates: which Amazon a market's visitors are sent to, and which of
// the owner's tracking IDs goes on the link (owner, 2026-10-29: "we are now
// earning money through our Amazon affiliates … we got to implement it").
//
// A tag only earns on the Amazon store whose Associates account issued it, so
// each store has its own, hard-coded (owner, 2026-11-02: no Vercel variable
// decides a tag): riftcompare-20 (US account, amazon.com), riftcompare-22
// (Australia), compareempi03-21 (UK), compareempire-20 (Canada) and
// compareempire-21 (Germany, which serves the eurozone). Singapore never
// (amazon.sg has no Associates programme).
//
// No Amazon price, rating or stock anywhere (no Product Advertising API): a
// link says "Check price on Amazon US" and Amazon's page is final. Pure.
import type { Country } from "./country";

export const AMAZON_US_DEFAULT_TAG = "riftcompare-20";
export const AMAZON_AU_DEFAULT_TAG = "riftcompare-22";
// The owner's UK, Canada and Germany Associates accounts (2026-11-02).
export const AMAZON_UK_DEFAULT_TAG = "compareempi03-21";
export const AMAZON_CA_DEFAULT_TAG = "compareempire-20";
export const AMAZON_DE_DEFAULT_TAG = "compareempire-21";
/** The Associates programme's required statement, word for word. */
export const AMAZON_STATEMENT = "As an Amazon Associate I earn from qualifying purchases.";
/** The trademark notice Amazon's Operating Agreement asks every site that uses its marks to carry (2026-11-02). */
export const AMAZON_TRADEMARK = "Amazon and the Amazon logo are trademarks of Amazon.com, Inc. or its affiliates.";

interface Store {
  host: string;
  label: string;
  tag: string;
}
const STORES: Record<Country, Store | null> = {
  US: { host: "www.amazon.com", label: "Amazon US", tag: AMAZON_US_DEFAULT_TAG },
  AU: { host: "www.amazon.com.au", label: "Amazon AU", tag: AMAZON_AU_DEFAULT_TAG },
  UK: { host: "www.amazon.co.uk", label: "Amazon UK", tag: AMAZON_UK_DEFAULT_TAG },
  CA: { host: "www.amazon.ca", label: "Amazon CA", tag: AMAZON_CA_DEFAULT_TAG },
  EU: { host: "www.amazon.de", label: "Amazon DE", tag: AMAZON_DE_DEFAULT_TAG },
  SG: null,
};

/** The market's Amazon (host, label, tag), or null where it shows none. */
export function amazonFor(country: Country): { host: string; label: string; tag: string } | null {
  const s = STORES[country];
  return s ? { host: s.host, label: s.label, tag: s.tag } : null;
}

/**
 * The tag for any amazon.* host (lib/affiliate.ts affiliateUrl): that store's
 * own, else the US tag (an Amazon we have no account on earns nothing either way).
 */
export function amazonTagForHost(hostname: string): string {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  return Object.values(STORES).find((x) => x && x.host === `www.${h}`)?.tag ?? AMAZON_US_DEFAULT_TAG;
}

/** A tagged search of the market's Amazon, ascsubtag = <sub>; null where the market shows no Amazon. */
export function amazonSearchUrl(country: Country, query: string, sub: string): string | null {
  const a = amazonFor(country);
  if (!a) return null;
  const u = new URL(`https://${a.host}/s`);
  u.searchParams.set("k", query.replace(/\s+/g, " ").trim());
  u.searchParams.set("tag", a.tag);
  u.searchParams.set("ascsubtag", sub.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 60));
  return u.toString();
}
