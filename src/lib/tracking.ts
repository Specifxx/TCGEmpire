// Structured shipment tracking — deep-links to each carrier's own public tracking
// page. Deliberately NOT a carrier API integration: no account/API key needed for
// any of these, so it works from day one without an ABN. A seller just types the
// carrier + the number off their own receipt/label.
export const CARRIERS = ["AUSPOST", "ROYALMAIL", "USPS", "OTHER"] as const;
export type Carrier = (typeof CARRIERS)[number];

export const CARRIER_LABEL: Record<Carrier, string> = {
  AUSPOST: "Australia Post",
  ROYALMAIL: "Royal Mail",
  USPS: "USPS",
  OTHER: "Other / international",
};

// The carrier a seller is most likely shipping with, by market — used to
// pre-select the dropdown in the "mark shipped" form.
export const CARRIER_BY_COUNTRY: Record<string, Carrier> = {
  AU: "AUSPOST",
  UK: "ROYALMAIL",
  US: "USPS",
};

// Public tracking URL for a carrier + number, or null when we can't build one
// (OTHER, or a number that doesn't look real) — callers should show the raw
// number as plain text in that case instead of a dead link.
export function trackingUrl(carrier: string | null | undefined, number: string | null | undefined): string | null {
  const num = number?.trim();
  if (!num) return null;
  switch (carrier) {
    case "AUSPOST":
      return `https://auspost.com.au/mypost/track/#/details/${encodeURIComponent(num)}`;
    case "ROYALMAIL":
      return `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(num)}`;
    case "USPS":
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(num)}`;
    default:
      return null;
  }
}
