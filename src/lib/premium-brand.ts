// WHOSE NAME A PREMIUM MEMBER SEES (owner, 2026-11-25: "people look at it and they'll be like, what the hell is Rift
// Compare"). One Premium serves every sister site (lib/sister-premium.ts), and RiftCompare is only its back end: a
// member who joined on DexCompare, MTG Compare, YGO Compare… sees THAT site's name on the checkout page, the trial
// fee line, the sender name and every email about their subscription, never "RiftCompare". Where one name has to
// cover every site (the Stripe account itself, its statement descriptor and receipts), it is the company,
// COMPANY_NAME, never RiftCompare.
//
// The subscription carries the site it was bought on: checkout stamps `surface: "sister-<key>"` on the session AND
// the subscription (lib/checkout-params.ts), so a renewal months later still knows. An account a sister made
// carries signupSource "sister:<key>…" (sister-premium.ts sisterSignupSource).
import { SISTER_PREMIUM_SITES } from "./sister-premium";
import { SITE_URL } from "./site";
import { sisterSite } from "./sister-alerts/sites";

export const COMPANY_NAME = "Compare Empire";

export interface PremiumBrand {
  /** "rift" or a sister key. */
  key: string;
  name: string;
  /** Canonical origin, no trailing slash. */
  url: string;
  sister: boolean;
  /** The site's own accent colour (lib/sister-alerts/sites.ts), for the email header. */
  color?: string;
}

export const RIFT_BRAND: PremiumBrand = { key: "rift", name: "RiftCompare", url: SITE_URL, sister: false };

function sisterBrand(key: string | undefined): PremiumBrand | null {
  const s = key ? SISTER_PREMIUM_SITES.find((x) => x.key === key) : undefined;
  return s ? { key: s.key, name: s.name, url: s.url, sister: true, color: sisterSite(s.key)?.color } : null;
}

/** The brand a subscription (or checkout) was bought under: its `surface` metadata "sister-<key>", else RiftCompare. */
export function brandFromSurface(surface: string | null | undefined): PremiumBrand {
  const m = typeof surface === "string" ? /^sister-([a-z0-9]+)$/.exec(surface) : null;
  return sisterBrand(m?.[1]) ?? RIFT_BRAND;
}

/** The brand an account was made under: signupSource "sister:<key>[:surface]", else RiftCompare. */
export function brandFromSignupSource(signupSource: string | null | undefined): PremiumBrand {
  const m = typeof signupSource === "string" ? /^sister:([a-z0-9]+)/.exec(signupSource) : null;
  return sisterBrand(m?.[1]) ?? RIFT_BRAND;
}

/** The subscription's own surface wins; an account a sister made is that sister's otherwise. */
export function premiumBrandFor(o: { surface?: string | null; signupSource?: string | null }): PremiumBrand {
  const bySurface = brandFromSurface(o.surface);
  return bySurface.sister ? bySurface : brandFromSignupSource(o.signupSource);
}

/** "DexCompare <noreply@…>": the site's own name on the configured sender address. RiftCompare keeps the default sender. */
export function brandFrom(brand: PremiumBrand, env: Record<string, string | undefined> = process.env): string | undefined {
  if (!brand.sister) return undefined;
  const raw = env.EMAIL_FROM ?? "noreply@riftcompare.com";
  const addr = /<([^>]+)>/.exec(raw)?.[1] ?? raw.trim();
  return `${brand.name} <${addr}>`;
}

/** The one line a sister's checkout page carries, so the company name on Stripe's page and the card statement is expected. */
export function billedByLine(brand: PremiumBrand): string {
  return `${brand.name} Premium is billed by ${COMPANY_NAME}, the company that runs ${brand.name}.`;
}
