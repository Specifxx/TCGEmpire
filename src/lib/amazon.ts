// Amazon Associates: which Amazon a market's visitors are sent to, and which of
// the owner's tracking IDs goes on the link (owner, 2026-10-29: "we are now
// earning money through our Amazon affiliates … we got to implement it").
//
// A tag only earns on the Amazon store whose Associates account issued it:
// riftcompare-20 is the US account's (amazon.com), compareempire-22 the
// Australian account's (amazon.com.au). Before this file every amazon.* link
// carried riftcompare-20, so the Australian visitors /sealed sent to
// amazon.com.au earned nothing. The UK, Canada and the EU have no account yet:
// their Amazon appears only once AMAZON_UK_TAG / AMAZON_CA_TAG / AMAZON_DE_TAG
// is set. Singapore never (amazon.sg has no Associates programme).
//
// No Amazon price, rating or stock anywhere (no Product Advertising API): a
// link says "Check price on Amazon US" and Amazon's page is final. Pure.
import type { Country } from "./country";

export const AMAZON_US_DEFAULT_TAG = "riftcompare-20";
export const AMAZON_AU_DEFAULT_TAG = "compareempire-22";
/** The Associates programme's required statement, word for word. */
export const AMAZON_STATEMENT = "As an Amazon Associate I earn from qualifying purchases.";

type Env = Record<string, string | undefined>;
interface Store {
  host: string;
  label: string;
  tagEnv: string[];
  defaultTag: string | null;
}
const STORES: Record<Country, Store | null> = {
  US: { host: "www.amazon.com", label: "Amazon US", tagEnv: ["AMAZON_ASSOCIATE_TAG", "AMAZON_US_TAG"], defaultTag: AMAZON_US_DEFAULT_TAG },
  AU: { host: "www.amazon.com.au", label: "Amazon AU", tagEnv: ["AMAZON_AU_TAG"], defaultTag: AMAZON_AU_DEFAULT_TAG },
  UK: { host: "www.amazon.co.uk", label: "Amazon UK", tagEnv: ["AMAZON_UK_TAG"], defaultTag: null },
  CA: { host: "www.amazon.ca", label: "Amazon CA", tagEnv: ["AMAZON_CA_TAG"], defaultTag: null },
  EU: { host: "www.amazon.de", label: "Amazon DE", tagEnv: ["AMAZON_DE_TAG"], defaultTag: null },
  SG: null,
};

/** A tracking ID as Amazon issues them: lowercase letters, digits, hyphens, ending -20 to -29. */
const TAG_RE = /^[a-z0-9][a-z0-9-]{1,60}-2\d$/;

function tagOf(s: Store, env: Env): string | null {
  return s.tagEnv.map((k) => env[k]?.trim().toLowerCase()).find((t): t is string => !!t && TAG_RE.test(t)) ?? s.defaultTag;
}

/** The market's Amazon (host, label, tag), or null where it shows none. */
export function amazonFor(country: Country, env: Env = process.env): { host: string; label: string; tag: string } | null {
  const s = STORES[country];
  const tag = s && tagOf(s, env);
  return s && tag ? { host: s.host, label: s.label, tag } : null;
}

/**
 * The tag for any amazon.* host (lib/affiliate.ts affiliateUrl): that store's
 * own, else the US tag (an Amazon we have no account on earns nothing either way).
 */
export function amazonTagForHost(hostname: string, env: Env = process.env): string {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  const s = Object.values(STORES).find((x) => x && x.host === `www.${h}`);
  return (s && tagOf(s, env)) || tagOf(STORES.US!, env)!;
}

/** A tagged search of the market's Amazon, ascsubtag = <sub>; null where the market shows no Amazon. */
export function amazonSearchUrl(country: Country, query: string, sub: string, env: Env = process.env): string | null {
  const a = amazonFor(country, env);
  if (!a) return null;
  const u = new URL(`https://${a.host}/s`);
  u.searchParams.set("k", query.replace(/\s+/g, " ").trim());
  u.searchParams.set("tag", a.tag);
  u.searchParams.set("ascsubtag", sub.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 60));
  return u.toString();
}
