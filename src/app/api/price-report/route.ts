import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import { COUNTRIES, currencyOf, type Country } from "@/lib/country";
import {
  ISSUE_CODES,
  MAX_CLAIM_CENTS,
  MAX_EMAIL,
  MAX_NOTE,
  MAX_PAGE,
  REPORT_KINDS,
  type ReportKind,
} from "@/lib/price-report";

export const dynamic = "force-dynamic";

// "This price is wrong." — the one thing a scraper can never tell us about
// itself, from the only people who can see it: someone looking at our number and
// the store's page at the same time.
//
// ── WHAT THIS ROUTE WILL NOT ACCEPT FROM THE CLIENT ─────────────────────────
//
// The price we were showing. It is looked up here, from our own database, using
// the identifiers the form sends. That is the whole point of the report — "the
// site says X, the store says Y" — so X has to be a figure an admin can act on
// without wondering whether a stranger typed it. The client can still claim what
// the REAL price is (actualPriceCents); that one is unverifiable by nature, is
// stored as a claim, and is labelled as the reporter's word everywhere it is
// shown.
//
// A null lookup is not an error. The importer may have dropped the listing
// between the page render and the report — recording `shownPriceCents: null`
// says exactly that, and is more useful than refusing the report.
//
// ── ABUSE CONTROLS, in order of how much they actually do ────────────────────
//  • nothing here is ever published — there is no public read path at all, which
//    is what makes anonymous submissions safe to accept in the first place;
//  • a honeypot field no human sees;
//  • hard bounds on every free-text field and on the claimed price;
//  • a rate limit sized to bound flooding, not to ration honest use.
//
// ACCEPTS SIGNED-OUT REPORTS, on purpose and for the same reason /api/feedback
// does: requiring an account would mean only existing members can tell us our
// data is broken, and the visitor who notices a wrong price is usually the one
// who came from a search engine, saw a number that didn't match the shop, and
// would otherwise just leave.

export async function POST(req: Request) {
  const user = await getCurrentUser();

  // Per-account when we have one, per-IP otherwise. The anonymous budget is not
  // tighter than the per-account one — an IP is not a person (a household, an
  // office or a Discord crowd behind one NAT all share it), and the backstop for
  // abuse is that none of this is ever published, not this number.
  const rl = user
    ? rateLimit(`price-report:${user.id}`, 20, 60 * 60_000)
    : rateLimit(`price-report-anon:${clientIp(req)}`, 20, 60 * 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const body = await req.json().catch(() => null);

  // Honeypot: a hidden input no human sees. Accept and discard — a 400 just
  // teaches the script to retry with the field cleared.
  if (typeof body?.website === "string" && body.website.trim() !== "") {
    return NextResponse.json({ ok: true });
  }

  const kindRaw = typeof body?.kind === "string" ? body.kind : "";
  if (!REPORT_KINDS.has(kindRaw)) {
    return NextResponse.json({ error: "Unknown report type." }, { status: 400 });
  }
  const kind = kindRaw as ReportKind;

  const issue = typeof body?.issue === "string" ? body.issue : "";
  if (!ISSUE_CODES.has(issue)) {
    return NextResponse.json({ error: "Pick what's wrong with the listing." }, { status: 400 });
  }

  const retailer = str(body?.retailer, 100);
  if (!retailer) {
    return NextResponse.json({ error: "Pick which store's listing is wrong." }, { status: 400 });
  }

  // Membership-tested, NOT normalizeCountry()'d. That helper coerces anything
  // unrecognised to the default market, which is right for rendering a page and
  // wrong here: it would silently file a report against the US when we don't
  // actually know which market's listing was being looked at.
  const country: Country | null =
    typeof body?.country === "string" && body.country in COUNTRIES ? (body.country as Country) : null;
  if (!country) {
    return NextResponse.json({ error: "Unknown market." }, { status: 400 });
  }

  const cardId = kind === "card" ? str(body?.cardId, 100) : null;
  const sealedGroupKey = kind === "sealed" ? str(body?.groupKey, 200) : null;
  if (kind === "card" && !cardId) {
    return NextResponse.json({ error: "Missing card." }, { status: 400 });
  }
  if (kind === "sealed" && !sealedGroupKey) {
    return NextResponse.json({ error: "Missing product." }, { status: 400 });
  }

  // A claimed correction, bounded. Rejected rather than silently clamped: a
  // clamped figure is a number the reporter never typed sitting in an admin
  // screen under their name.
  let actualPriceCents: number | null = null;
  if (body?.actualPriceCents != null && body.actualPriceCents !== "") {
    const n = Number(body.actualPriceCents);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > MAX_CLAIM_CENTS) {
      return NextResponse.json({ error: "That price doesn't look right — check the figure." }, { status: 400 });
    }
    actualPriceCents = n;
  }

  try {
    // ── The server-side lookup. See the header: this is the half of the report
    // that must not come from the request body. ──────────────────────────────
    let shownPriceCents: number | null = null;
    let retailerName = "";

    if (kind === "card") {
      const listingId = str(body?.listingId, 100);
      // By id when the surface had one (card pages and the card quick-view both
      // do); otherwise by the natural key. `findFirst` on the fallback because
      // (cardId, retailer) is not unique on its own — condition and foil are part
      // of RetailerPrice's unique constraint — so the cheapest matching row is
      // the honest answer to "which listing did they mean".
      const listing = listingId
        ? await prisma.retailerPrice.findUnique({
            where: { id: listingId },
            select: { priceCents: true, retailerName: true, cardId: true },
          })
        : await prisma.retailerPrice.findFirst({
            where: { cardId: cardId!, retailer, country },
            orderBy: { priceCents: "asc" },
            select: { priceCents: true, retailerName: true, cardId: true },
          });
      // A listing id that belongs to a DIFFERENT card is not this report's
      // listing — treat it as not found rather than attaching another card's
      // price to this report.
      if (listing && (!listingId || listing.cardId === cardId)) {
        shownPriceCents = listing.priceCents;
        retailerName = listing.retailerName;
      }
    } else {
      const listing = await prisma.sealedListing.findFirst({
        where: { groupKey: sealedGroupKey!, retailer, country },
        orderBy: { priceCents: "asc" },
        select: { priceCents: true, retailerName: true },
      });
      if (listing) {
        shownPriceCents = listing.priceCents;
        retailerName = listing.retailerName;
      }
    }

    await prisma.priceReport.create({
      data: {
        kind,
        cardId,
        sealedGroupKey,
        listingId: kind === "card" ? str(body?.listingId, 100) : null,
        retailer,
        // Falls back to whatever the form displayed only when the listing has
        // already gone — a store name is a label, not a figure, so an imperfect
        // one costs nothing and an empty column costs an admin a lookup.
        retailerName: retailerName || str(body?.retailerName, 120) || retailer,
        country,
        shownPriceCents,
        currency: currencyOf(country),
        issue,
        actualPriceCents,
        note: str(body?.note, MAX_NOTE),
        userId: user?.id ?? null,
        email: user ? null : email(body?.email),
        ip: clientIp(req),
        page: str(body?.page, MAX_PAGE),
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Couldn't send that right now — please try again." }, { status: 500 });
  }
}

function str(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().slice(0, max);
  return s || null;
}

// Deliberately loose, same as /api/feedback: this gates "is it worth storing a
// reply address", not "is this person real". The cost of a bad one is a single
// unanswerable email; the cost of an over-strict pattern is silently dropping
// valid addresses from people who took the trouble to help.
function email(raw: unknown): string | null {
  const s = str(raw, MAX_EMAIL);
  if (!s) return null;
  return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(s) ? s : null;
}
