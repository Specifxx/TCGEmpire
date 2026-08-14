import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, clientIp, tooManyRequests } from "@/lib/rate-limit";
import { grantPremiumMonths, feedbackPremiumActive, FEEDBACK_PREMIUM_MONTHS } from "@/lib/premium";

export const dynamic = "force-dynamic";

// On-site feedback. ACCEPTS SIGNED-OUT SUBMISSIONS as of 2026-08-14 — this route
// used to 401 anyone without an account, which meant the only feedback the site
// could receive came from people who had already signed up. That is the opposite
// of who you most need to hear from: the visitor who bounced because something
// was confusing never had an account and never will.
//
// A signed-in submission is unchanged in every respect, including the one-time
// Premium grant. An anonymous one is stored with userId: null and grants nothing
// (there is no account to grant to) — stated plainly in the response so the UI
// never implies a reward it cannot deliver.
//
// Abuse controls, in order of how much they actually do:
//  • per-IP rate limit for anonymous posts (tighter than the per-user limit,
//    since an IP is a much weaker identity than an account);
//  • a honeypot field that real users never see and never fill;
//  • hard length bounds;
//  • status defaults to NEW in the schema, so nothing a stranger types can reach
//    a public surface without an admin approving it first.
const MAX_MESSAGE = 4000;
const MIN_MESSAGE = 10;
const MAX_NAME = 60;
const MAX_EMAIL = 200;
const MAX_PAGE = 200;

const SOURCES = new Set(["page", "widget", "riftle"]);

// Deliberately loose: this gates "should we bother storing a reply address",
// not "is this person real". An over-strict pattern silently drops valid
// addresses, and the cost of a bad one here is one unanswerable email.
function cleanEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().slice(0, MAX_EMAIL);
  if (!s) return null;
  return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(s) ? s : null;
}

function cleanStr(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().slice(0, max);
  return s || null;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();

  // Signed-in: keyed by account. Signed-out: keyed by IP.
  //
  // The anonymous budget is deliberately NOT tighter than the per-account one,
  // which was the first instinct and the wrong one: an IP is not a person. A
  // household, an office, a school or a Discord crowd all clicking through the
  // same NAT share one, so a tight per-IP cap silently eats the feedback of
  // everyone after the first few — the exact loss this whole change exists to
  // stop. The backstop for abuse is not this number: nothing published without
  // an admin approving it, a honeypot below, and hard length bounds. So this is
  // set to bound flooding, not to ration honest use.
  const rl = user
    ? rateLimit(`feedback:${user.id}`, 5, 60 * 60_000)
    : rateLimit(`feedback-anon:${clientIp(req)}`, 6, 60 * 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const body = await req.json().catch(() => null);

  // Honeypot: a hidden input no human ever sees. Anything that fills it is a
  // bot, so accept the request and do nothing — a 400 would just teach the
  // script to try again with the field cleared.
  if (typeof body?.website === "string" && body.website.trim() !== "") {
    return NextResponse.json({ ok: true, granted: false });
  }

  const message = typeof body?.message === "string" ? body.message.trim().slice(0, MAX_MESSAGE) : "";
  const ratingRaw = Number(body?.rating);
  const rating = Number.isInteger(ratingRaw) && ratingRaw >= 1 && ratingRaw <= 5 ? ratingRaw : null;

  // A bare star rating IS feedback and is the single most likely thing a passing
  // visitor will give you. Requiring prose alongside it would throw away most of
  // the signal this route exists to collect, so a rating with no message is
  // valid — but an empty submission with neither is not.
  if (rating == null && message.length < MIN_MESSAGE) {
    return NextResponse.json(
      { error: "Add a star rating, or write a little more (at least 10 characters)." },
      { status: 400 }
    );
  }
  if (rating == null && message.length === 0) {
    return NextResponse.json({ error: "Nothing to send." }, { status: 400 });
  }

  const sourceRaw = typeof body?.source === "string" ? body.source : "page";
  const source = SOURCES.has(sourceRaw) ? sourceRaw : "page";
  const consentPublic = body?.consentPublic === true;
  // Only keep a name when it can actually be used — i.e. they consented to
  // publication. Storing an identifier we will never display is data we have no
  // reason to hold.
  const displayName = consentPublic ? cleanStr(body?.displayName, MAX_NAME) : null;

  try {
    const prior = user ? await prisma.feedback.count({ where: { userId: user.id } }) : 0;

    await prisma.feedback.create({
      data: {
        userId: user?.id ?? null,
        message,
        rating,
        source,
        consentPublic,
        displayName,
        page: cleanStr(body?.page, MAX_PAGE),
        // A signed-in account already has an address on file; only ask a
        // stranger for one, and only store what they chose to give.
        email: user ? null : cleanEmail(body?.email),
      },
    });

    // Reward only a signed-in account's FIRST submission, only while the promo
    // is on. Anonymous submissions can't be rewarded — there is nothing to
    // attach a grant to — and the response says so rather than implying one.
    let granted = false;
    let premiumUntil: Date | null = null;
    if (user && prior === 0 && feedbackPremiumActive()) {
      premiumUntil = await grantPremiumMonths(user.id, FEEDBACK_PREMIUM_MONTHS);
      granted = !!premiumUntil;
    }
    return NextResponse.json({ ok: true, granted, months: FEEDBACK_PREMIUM_MONTHS, premiumUntil });
  } catch {
    return NextResponse.json({ error: "Couldn't send that right now — please try again." }, { status: 500 });
  }
}
