/**
 * WHY DOESN'T THIS ONE eBay LISTING SHOW UP?
 *
 * READ-ONLY. Two Browse calls per marketplace, no database writes.
 *
 * ── WHY IT EXISTS ───────────────────────────────────────────────────────────
 * A visitor reports a real eBay listing that the site does not show, and pastes
 * its URL. `diagnose-card` already answers "which FILTER dropped it" via the
 * funnel — but only for listings the search RETURNED. When the funnel shows the
 * item was never in the result window at all, the funnel is silent about why,
 * and there is nothing else to look at: eBay serves 403 to any scripted fetch of
 * an /itm/ page, so the listing's own title and price cannot be read from
 * outside the API.
 *
 * That is exactly the case this was written for. Reported 2026-09-19:
 * ebay.com.au/itm/407214784944 for Irelia, Fervent (SFD 225★/221) does not
 * appear on the AU market. diagnose-card's AU funnel returned three items — a
 * keychain and two PSA 10 slabs — and the reported listing was not among them,
 * so every filter was innocent and the question became "is it even in eBay AU's
 * index, and if so why didn't our query reach it?".
 *
 * ── WHAT IT REPORTS, AND WHY EACH LINE IS THERE ─────────────────────────────
 *   getItem per marketplace   Browse's getItem is marketplace-scoped: an item
 *                             LISTED on eBay US is often visible on
 *                             ebay.com.au (it ships there) while being absent
 *                             from EBAY_AU's Browse index. That single fact
 *                             explains a whole class of "it's on the AU site but
 *                             not on yours" reports, and this is the only way to
 *                             tell it apart from a filter or query bug. A 404
 *                             here is a RESULT, not an error.
 *   title / price / currency  What the filters would actually see. The title is
 *                             the input to every identity check, and reading it
 *                             is the thing that is otherwise impossible.
 *   itemLocation / seller     Where it ships FROM — the other half of the
 *                             cross-border story.
 *   buyingOptions             The production search sends
 *                             `buyingOptions:{FIXED_PRICE}`, so an AUCTION-only
 *                             listing is invisible to it by design. Worth ruling
 *                             in or out before touching anything.
 *   GRADED_SLAB verdict       A slab is deliberately kept out of the price
 *                             comparison and shown in the graded panel instead,
 *                             so "missing from the prices" can be correct
 *                             behaviour rather than a bug.
 *
 * Usage:
 *   EBAY_ITEM_ID=407214784944 npx tsx scripts/diagnose-ebay-item.ts
 *   (a full /itm/ URL works too — the id is parsed out of it)
 *
 * Run in CI via .github/workflows/maintenance.yml (task: diagnose-ebay-item),
 * which is where the eBay credentials live.
 */

import { EBAY_MARKETPLACE, GRADED_SLAB, isEbayEnabled } from "../src/lib/ebay";

const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const ITEM_URL = "https://api.ebay.com/buy/browse/v1/item";

/** Accepts a bare id or any eBay URL containing /itm/<id>. */
export function parseItemId(input: string): string | null {
  const s = (input || "").trim();
  if (/^\d{9,15}$/.test(s)) return s;
  const m = s.match(/\/itm\/(?:.*?\/)?(\d{9,15})/);
  return m ? m[1] : null;
}

async function token(): Promise<string | null> {
  const basic = Buffer.from(`${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
  });
  if (!res.ok) return null;
  return (await res.json())?.access_token ?? null;
}

async function main() {
  const raw = process.env.EBAY_ITEM_ID ?? "";
  const id = parseItemId(raw);
  if (!id) {
    console.error(`::error::EBAY_ITEM_ID did not contain an eBay item id (got: ${raw.slice(0, 120) || "<empty>"})`);
    process.exitCode = 1;
    return;
  }
  if (!isEbayEnabled()) {
    console.error("::error::EBAY_CLIENT_ID/SECRET are not set for this job — nothing to ask.");
    process.exitCode = 1;
    return;
  }
  const at = await token();
  if (!at) {
    console.error("::error::could not get an eBay token.");
    process.exitCode = 1;
    return;
  }

  console.log(`eBay item ${id}\n`);
  // Browse's legacy-id form. v1|<itemId>|0 is the documented encoding for an
  // item with no variations, and is what an /itm/<id> URL corresponds to.
  const legacy = `v1|${id}|0`;
  let anyFound = false;

  for (const [country, marketplace] of Object.entries(EBAY_MARKETPLACE)) {
    let res: Response;
    try {
      res = await fetch(`${ITEM_URL}/${encodeURIComponent(legacy)}`, {
        headers: { Authorization: `Bearer ${at}`, "X-EBAY-C-MARKETPLACE-ID": marketplace },
      });
    } catch (e) {
      console.log(`  ${country.padEnd(3)} ${marketplace.padEnd(9)} request failed: ${e instanceof Error ? e.message : e}`);
      continue;
    }
    if (res.status === 404) {
      // The informative case, not a failure: the item is not in this
      // marketplace's index, which is why a search scoped to it never sees it.
      console.log(`  ${country.padEnd(3)} ${marketplace.padEnd(9)} NOT IN THIS MARKETPLACE'S INDEX (404)`);
      continue;
    }
    if (!res.ok) {
      console.log(`  ${country.padEnd(3)} ${marketplace.padEnd(9)} HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
      continue;
    }
    const it: any = await res.json();
    anyFound = true;
    const price = it?.price?.value ? `${it.price.currency} ${it.price.value}` : "(no price)";
    const loc = [it?.itemLocation?.city, it?.itemLocation?.country].filter(Boolean).join(", ") || "?";
    console.log(
      `  ${country.padEnd(3)} ${marketplace.padEnd(9)} FOUND  ${price}  from=${loc}  seller=${it?.seller?.username ?? "?"}\n` +
        `      buyingOptions=${(it?.buyingOptions ?? []).join(",") || "?"}  condition=${it?.condition ?? "?"}\n` +
        `      title: ${it?.title ?? "(none)"}\n` +
        `      GRADED_SLAB matches title: ${GRADED_SLAB.test(it?.title ?? "")}`
    );
  }

  if (!anyFound) {
    console.log("\nNot found in ANY marketplace index — the listing may have ended, or it is a\nlisting type Browse does not expose.");
  }
  console.log(
    "\nHOW TO READ THIS:\n" +
      "  • FOUND on US/GB but 404 on AU → the item is listed on that marketplace and\n" +
      "    merely VISIBLE on ebay.com.au because it ships there. An EBAY_AU-scoped\n" +
      "    search cannot return it; this is a coverage gap, not a filter bug.\n" +
      "  • FOUND on AU → it IS in the AU index, so the miss is our query or a filter.\n" +
      "    Re-read diagnose-card's funnel with this exact title in hand.\n" +
      "  • buyingOptions without FIXED_PRICE → the price search excludes it by\n" +
      "    design (it sends buyingOptions:{FIXED_PRICE}); /auctions is its home.\n" +
      "  • GRADED_SLAB true → deliberately kept out of the price comparison and\n" +
      "    shown in the graded panel instead. Missing from the prices is CORRECT."
  );
}

main().catch((e) => {
  console.error("diagnose-ebay-item failed:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
