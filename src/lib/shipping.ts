// Shipping address types/validation + the postcode-based cost estimator for the
// marketplace checkout. The estimator is a deliberately simple, clearly-labelled
// HEURISTIC (remote/zone surcharge on top of the seller's own flat rate) — not a
// live carrier-API quote (no ABN, no carrier account; see lib/tracking.ts for the
// same constraint on labels). It exists so "same city vs. remote area" isn't
// priced identically, while staying honest that it's an estimate.
export interface ShippingAddress {
  name: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string; // state/province/county — free text
  postcode: string;
  phone: string | null;
}

const POSTCODE_PATTERN: Record<string, RegExp> = {
  AU: /^\d{4}$/,
  US: /^\d{5}(-\d{4})?$/,
  UK: /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s?\d[A-Za-z]{2}$/,
  // Canadian FSA/LDU, e.g. "K1E 3J1" / "k1e3j1". Without this, validatePostcode's
  // `pattern ? … : p.length > 0` fallback accepts ANY non-empty string.
  CA: /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/,
  SG: /^\d{6}$/,
};

export function validatePostcode(country: string, postcode: string): boolean {
  const p = postcode.trim();
  const pattern = POSTCODE_PATTERN[country];
  return pattern ? pattern.test(p) : p.length > 0;
}

export function validateShippingAddress(country: string, input: any): { ok: true; address: ShippingAddress } | { ok: false; error: string } {
  const name = String(input?.name ?? "").trim();
  const line1 = String(input?.line1 ?? "").trim();
  const line2 = input?.line2 ? String(input.line2).trim() : null;
  const city = String(input?.city ?? "").trim();
  const region = String(input?.region ?? "").trim();
  const postcode = String(input?.postcode ?? "").trim();
  const phone = input?.phone ? String(input.phone).trim() : null;

  if (name.length < 2 || name.length > 100) return { ok: false, error: "Enter the recipient's name" };
  if (line1.length < 3 || line1.length > 200) return { ok: false, error: "Enter a street address" };
  if (city.length < 1 || city.length > 100) return { ok: false, error: "Enter a suburb/city" };
  if (region.length < 1 || region.length > 100) return { ok: false, error: "Enter a state/region" };
  if (!validatePostcode(country, postcode)) return { ok: false, error: `That doesn't look like a valid ${country} postcode` };
  if (phone && phone.length > 30) return { ok: false, error: "Phone number is too long" };

  return { ok: true, address: { name, line1, line2, city, region, postcode, phone } };
}

// ── Postcode-based estimate ─────────────────────────────────────────────────────
// Simplified remote-area ranges/prefixes per market — NOT an authoritative courier
// zone map, just enough signal to avoid charging a Sydney-to-Sydney rate for a
// delivery to remote WA/NT, the Scottish Highlands & Islands, or cross-country US.
const AU_REMOTE_RANGES: [number, number][] = [
  [800, 999], // NT (Darwin metro is 08xx too, but genuinely remote NT dominates this band)
  [4800, 4895], // Far North QLD / Cape York
  [6700, 6799], // Kimberley, WA
  [6300, 6499], // WA Goldfields/remote
  [2836, 2898], // Far west NSW (Broken Hill)
  [7255, 7259], // Flinders Island, TAS
  [7466, 7469], // King Island, TAS
];
function isAuRemote(postcode: string): boolean {
  const n = Number(postcode);
  if (!Number.isFinite(n)) return false;
  return AU_REMOTE_RANGES.some(([lo, hi]) => n >= lo && n <= hi);
}

// Highlands & Islands / Channel Islands outward-code prefixes — the UK postcode
// areas couriers commonly surcharge.
const UK_REMOTE_PREFIXES = ["KW", "ZE", "HS", "IV", "GY", "JE"];
function isUkRemote(postcode: string): boolean {
  const outward = postcode.trim().toUpperCase().match(/^[A-Z]{1,2}/)?.[0] ?? "";
  return UK_REMOTE_PREFIXES.includes(outward);
}

// US: no real zone chart without a carrier API — approximate by how far apart the
// leading ZIP digits are (0-9 buckets roughly follow US geography east→west).
function usZoneSurchargeCents(sellerZip: string, buyerZip: string): number {
  const a = Number(sellerZip[0]);
  const b = Number(buyerZip[0]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  const distance = Math.abs(a - b);
  if (distance === 0) return 0;
  if (distance <= 2) return 200; // US$2
  return 400; // US$4 — likely coast-to-coast
}

const REMOTE_SURCHARGE_CENTS = 500; // A$5 / £5 for AU/UK remote areas

export interface EstimateInput {
  country: string; // AU | UK | US
  sellerPostcode: string | null;
  buyerPostcode: string;
  baseCents: number; // seller's flat shippingFlatCents
  freeOverCents: number; // 0 = never free
  itemCents: number; // cart subtotal so far, for the free-shipping threshold
}

export interface EstimateResult {
  cents: number;
  note: string; // shown next to the estimate, e.g. "includes remote-area surcharge"
}

// Authoritative estimate — used both for the live checkout preview AND the actual
// charge, so there's no gap between what a buyer is shown and what they're charged.
export function estimateShippingCents(input: EstimateInput): EstimateResult {
  const { country, sellerPostcode, buyerPostcode, baseCents, freeOverCents, itemCents } = input;

  if (freeOverCents > 0 && itemCents >= freeOverCents) {
    return { cents: 0, note: "Free shipping" };
  }

  let surcharge = 0;
  let note = "Estimated — final cost may vary slightly by exact location";

  if (country === "AU" && isAuRemote(buyerPostcode)) {
    surcharge = REMOTE_SURCHARGE_CENTS;
    note = "Estimated — includes a remote-area surcharge";
  } else if (country === "UK" && isUkRemote(buyerPostcode)) {
    surcharge = REMOTE_SURCHARGE_CENTS;
    note = "Estimated — includes a Highlands & Islands surcharge";
  } else if (country === "US" && sellerPostcode) {
    surcharge = usZoneSurchargeCents(sellerPostcode, buyerPostcode);
    if (surcharge > 0) note = "Estimated — includes a distance-based surcharge";
  }

  return { cents: Math.max(0, baseCents + surcharge), note };
}
