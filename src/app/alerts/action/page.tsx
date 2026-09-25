import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { verifyAlertAction, type AlertAction, type AlertActionOutcome } from "@/lib/alert-actions";
import { currencyOf, normalizeCountry } from "@/lib/country";
import { formatMoney } from "@/lib/format";
import { cardHref } from "@/lib/card-url";
import { isPremium } from "@/lib/premium";
import { isAdminEmail } from "@/lib/admin-emails";
import { PLUS_TARGET_ALERT_LIMIT } from "@/lib/alert-limits";

// THE CONFIRMATION STEP for a one-tap link in a price-alert email
// (lib/alert-actions.ts). Mail scanners and link prefetchers GET every link in
// a message, so this page CHANGES NOTHING: it verifies the signed token, says
// exactly what the button will do, and only its form's POST to
// /api/alerts/action acts. After the POST, the route 303s back here with ?r=
// (the outcome) and the page reports it.
//
// Token-addressed and session-free (the tap comes from a mail client), one
// scoped primary-key read. Personal: never indexed, and no Referer carries the
// token off-site.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Price alert",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const OUTCOMES: readonly AlertActionOutcome[] = ["ok", "gone", "not-plus", "limit", "no-account", "invalid"];

function one(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md py-10">
      <div className="card p-6">
        <h1 className="font-display text-xl font-bold text-white">{title}</h1>
        {children}
      </div>
    </div>
  );
}

const dateLabel = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default async function AlertActionPage({ searchParams }: { searchParams: { t?: string | string[]; r?: string | string[] } }) {
  const token = one(searchParams.t);
  const rawOutcome = one(searchParams.r);
  const outcome = (OUTCOMES as readonly string[]).includes(rawOutcome) ? (rawOutcome as AlertActionOutcome) : null;
  const v = verifyAlertAction(token);

  if (!v.ok) {
    return (
      <Shell title={v.reason === "expired" ? "This link has expired" : "Link not valid"}>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          {v.reason === "expired"
            ? "Links in price-alert emails work for 90 days. The next alert email carries fresh ones, and the footer of any alert email still pauses or manages your alerts."
            : "This link looks broken. The footer of any price-alert email still pauses or manages your alerts."}
        </p>
        <Link href="/watching" className="btn-ghost mt-4">
          My watchlist
        </Link>
      </Shell>
    );
  }

  const row = await prisma.priceAlert
    .findUnique({
      where: { id: v.alertId },
      select: {
        market: true,
        targetCents: true,
        snoozedUntil: true,
        userId: true,
        user: { select: { email: true, isAdmin: true, premiumUntil: true, premiumTier: true, premiumTierFloor: true } },
        card: { select: { id: true, slug: true, name: true } },
      },
    })
    .catch(() => null);

  const market = normalizeCountry(row?.market);
  const money = (c: number | null) => (c == null ? "" : formatMoney(c, currencyOf(market)));
  const cardName = row?.card.name ?? "this card";
  const entitled = !!row?.user && isPremium({ ...row.user, isAdmin: row.user.isAdmin || isAdminEmail(row.user.email) });
  const isTarget = (a: AlertAction) => a === "target-set" || a === "target-down";

  // ── After the POST: report what happened ──────────────────────────────────
  if (outcome) {
    if (outcome === "ok") {
      if (v.action === "stop") {
        return (
          <Shell title="You've stopped watching it">
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              We won&apos;t email you about {cardName} again. Your other watches are unchanged.
            </p>
            <Link href="/watching" className="btn-ghost mt-4">
              My watchlist
            </Link>
          </Shell>
        );
      }
      if (v.action === "snooze") {
        return (
          <Shell title="Snoozed for 30 days">
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              No emails about <strong className="text-white">{cardName}</strong>
              {row?.snoozedUntil ? ` until ${dateLabel(row.snoozedUntil)}` : " for 30 days"}. We keep checking its price, so
              after that you hear about news from then on, not a backlog.
            </p>
            <Link href="/watching" className="btn-ghost mt-4">
              My watchlist
            </Link>
          </Shell>
        );
      }
      return (
        <Shell title="Target saved">
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            We&apos;ll email you when the cheapest Near Mint copy of <strong className="text-white">{cardName}</strong> is at or
            under <strong className="text-white">{money(row?.targetCents ?? v.value)}</strong>, checked after every price update.
          </p>
          <Link href="/watching" className="btn-ghost mt-4">
            My watchlist
          </Link>
        </Shell>
      );
    }
    if (outcome === "gone") {
      return (
        <Shell title="You're no longer watching this card">
          <p className="mt-2 text-sm leading-relaxed text-slate-300">It was removed from your watchlist, so there was nothing to change.</p>
          <Link href="/watching" className="btn-ghost mt-4">
            My watchlist
          </Link>
        </Shell>
      );
    }
    if (outcome === "limit") {
      return (
        <Shell title="All your Plus targets are in use">
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            Plus covers target prices on {PLUS_TARGET_ALERT_LIMIT} cards. Clear one on your watchlist to set this one, or move to
            Premium for unlimited targets.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/watching" className="btn-primary">
              My watchlist
            </Link>
            <Link href="/premium?src=alert-action" className="btn-ghost">
              See Premium
            </Link>
          </div>
        </Shell>
      );
    }
    if (outcome === "not-plus" || outcome === "no-account") {
      return (
        <Shell title="Target prices are part of Plus">
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            Plus (ad-free) lets you set your own price on up to {PLUS_TARGET_ALERT_LIMIT} watched cards and emails you as soon as
            it&apos;s met, after every price update. Your free alerts keep working either way.
          </p>
          <Link href="/premium?src=alert-action" className="btn-primary mt-4">
            See Plus
          </Link>
        </Shell>
      );
    }
  }

  // ── Before: confirm ────────────────────────────────────────────────────────
  if (!row) {
    return (
      <Shell title="You're no longer watching this card">
        <p className="mt-2 text-sm leading-relaxed text-slate-300">It isn&apos;t on your watchlist any more, so there&apos;s nothing to change.</p>
        <Link href="/watching" className="btn-ghost mt-4">
          My watchlist
        </Link>
      </Shell>
    );
  }

  if (isTarget(v.action) && !entitled) {
    return (
      <Shell title="Set your own price with Plus">
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          Target prices are part of Plus (ad-free): set your own price on up to {PLUS_TARGET_ALERT_LIMIT} watched cards and hear
          as soon as it&apos;s met, after every price update. Your free alerts for {cardName} keep working either way.
        </p>
        <Link href="/premium?src=alert-action" className="btn-primary mt-4">
          See Plus
        </Link>
      </Shell>
    );
  }

  const copy: Record<AlertAction, { title: string; body: string; button: string }> = {
    stop: {
      title: `Stop watching ${cardName}?`,
      body: `This removes ${cardName} (${market}) from your watchlist. Your other watches, and any other emails, are unchanged.`,
      button: "Stop watching",
    },
    snooze: {
      title: `Snooze ${cardName} for 30 days?`,
      body: `No price-alert emails about ${cardName} for 30 days. It stays on your watchlist and we keep checking its price.`,
      button: "Snooze 30 days",
    },
    "target-set": {
      title: `Set your target at ${money(v.value)}?`,
      body: `We'll email you when the cheapest Near Mint copy of ${cardName} (${market}) is at or under ${money(v.value)}.${row.targetCents != null ? ` Your current target is ${money(row.targetCents)}.` : ""}`,
      button: `Set target at ${money(v.value)}`,
    },
    "target-down": {
      title: `Lower your target to ${money(v.value)}?`,
      body: `We'll email you when the cheapest Near Mint copy of ${cardName} (${market}) is at or under ${money(v.value)}.${row.targetCents != null ? ` Your current target is ${money(row.targetCents)}.` : ""}`,
      button: `Set target at ${money(v.value)}`,
    },
  };
  const c = copy[v.action];

  return (
    <Shell title={c.title}>
      <p className="mt-2 text-sm leading-relaxed text-slate-300">{c.body}</p>
      {/* A plain form: works with no JavaScript, and a prefetcher never posts it. */}
      <form method="post" action="/api/alerts/action" className="mt-4">
        <input type="hidden" name="t" value={token} />
        <button type="submit" className="btn-primary w-full">
          {c.button}
        </button>
      </form>
      <Link href={cardHref(row.card)} className="mt-3 block text-center text-xs text-slate-500 hover:text-slate-300">
        View {cardName} instead
      </Link>
    </Shell>
  );
}
