// THE WEEKLY "YOUR WATCHED CARDS" EMAIL (retention lever 3, owner 2026-11-18; DECISIONS.md).
//
//   • Opt-in only. An account sees the "Turn on" card on /watching only in the OFFER arm
//     (watchDigestArm: a hash of its user id, half the accounts); the CONTROL arm never sees it.
//     Comparing the two arms' return rates (scripts/retention-census.ts "digestArm") measures what
//     the email does, without ever withholding an email someone asked for.
//   • One email a week per subscriber (ISO-week edition, idempotent: the daily run only sends to who
//     is still due), only when at least one watched card has a price, through Brevo (300 a day free;
//     DIGEST_BATCH leaves room for everything else). It is mail the person asked for, not marketing.
//   • Prices are the ones the daily alert run already keeps on each watch (PriceAlert.lastPriceCents:
//     the cheapest in-stock Near Mint copy at a store we track, never eBay), against the price the
//     watch started at (startPriceCents). No new price query, no affiliate links in the email (cards
//     link to their own page), and every email has a one-click stop link.
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./db";
import { currencyOf, normalizeCountry } from "./country";
import { cardHref } from "./card-url";
import { formatMoney } from "./format";
import { SITE_URL } from "./site";
import { editionKey } from "./newsletter";
import { emailShell, escapeHtml, getLastEmailError, isBrevoEnabled, sendEmailBrevo } from "./email";

export type DigestArm = "offer" | "control";

/** Half the accounts are offered the email; which half is fixed by the user id, so it never flips. */
export function watchDigestArm(userId: string): DigestArm {
  return createHash("sha256").update(`watch-digest:${userId}`).digest()[0] % 2 === 0 ? "offer" : "control";
}

export function newDigestToken(): string {
  return randomBytes(24).toString("base64url");
}

export interface DigestRow {
  name: string;
  setName: string;
  href: string;
  currency: string;
  startCents: number | null;
  nowCents: number;
}

/** The share a price moved since the watch started, or null with no start price. */
export function changePct(r: Pick<DigestRow, "startCents" | "nowCents">): number | null {
  if (r.startCents == null || r.startCents <= 0) return null;
  return Math.round(((r.nowCents - r.startCents) / r.startCents) * 1000) / 10;
}

export const DIGEST_MAX_ROWS = 10;

/**
 * What one email shows: cards cheaper than when the watch started first (biggest drop first), then the rest by the size of
 * the move, cards with no change last. A watch with no current price is left out.
 */
export function pickDigestRows(rows: DigestRow[], max = DIGEST_MAX_ROWS): { rows: DigestRow[]; cheaper: number } {
  const priced = rows.filter((r) => Number.isFinite(r.nowCents) && r.nowCents > 0);
  const key = (r: DigestRow) => changePct(r) ?? 0;
  const down = priced.filter((r) => key(r) < 0).sort((a, b) => key(a) - key(b));
  const rest = priced.filter((r) => key(r) >= 0).sort((a, b) => Math.abs(key(b)) - Math.abs(key(a)));
  return { rows: [...down, ...rest].slice(0, max), cheaper: down.length };
}

function rowHtml(r: DigestRow): string {
  const pct = changePct(r);
  const colour = pct == null || pct === 0 ? "#9aa4b2" : pct < 0 ? "#34d399" : "#f87171";
  const change = pct == null ? "" : pct === 0 ? "no change" : `${pct > 0 ? "+" : "−"}${Math.abs(pct)}% since you started watching`;
  const link = `${SITE_URL}${r.href}?utm_source=email&utm_medium=watch-digest`;
  return `<tr><td style="padding:8px 32px;border-top:1px solid #233047">
    <a href="${link}" style="color:#fff;font-weight:700;text-decoration:none">${escapeHtml(r.name)}</a>
    <span style="color:#6b7585;font-size:12px"> · ${escapeHtml(r.setName)}</span><br/>
    <span style="color:#e6ebf1">${escapeHtml(formatMoney(r.nowCents, r.currency))}</span>
    ${change ? `<span style="color:${colour};font-size:13px"> ${escapeHtml(change)}</span>` : ""}
  </td></tr>`;
}

export function buildWatchDigestEmail(picked: { rows: DigestRow[]; cheaper: number }, total: number, stopUrl: string): { subject: string; html: string; text: string } {
  const { rows, cheaper } = picked;
  const subject = cheaper > 0 ? `${cheaper} of your watched cards ${cheaper === 1 ? "is" : "are"} cheaper this week` : "Your watched cards this week";
  const intro = `Today's cheapest in-stock Near Mint price at the stores we track, for ${rows.length === total ? "every card" : `${rows.length} of the ${total} cards`} you watch.`;
  const inner = `<tr><td style="padding:6px 32px 10px;font-size:14px;line-height:1.6;color:#9aa4b2">${escapeHtml(intro)}</td></tr>
    ${rows.map(rowHtml).join("")}
    <tr><td style="padding:14px 32px 18px"><a href="${SITE_URL}/watching?utm_source=email&utm_medium=watch-digest" style="display:inline-block;background:#ef7d00;color:#fff;font-weight:700;padding:10px 18px;border-radius:10px;text-decoration:none">See my watchlist</a></td></tr>`;
  const footer = `<tr><td style="padding:16px 32px 26px;border-top:1px solid #233047;font-size:12px;color:#6b7585">
    You're getting this because you turned on the weekly watched-cards email on your RiftCompare watchlist. Your price alerts are separate and keep working.<br/>
    <a href="${stopUrl}" style="color:#9aa4b2;text-decoration:underline">Stop this weekly email</a>
  </td></tr>`;
  const text = [
    subject,
    "",
    intro,
    "",
    ...rows.map((r) => {
      const pct = changePct(r);
      return `${r.name} (${r.setName}): ${formatMoney(r.nowCents, r.currency)}${pct == null ? "" : pct === 0 ? ", no change" : `, ${pct > 0 ? "+" : "-"}${Math.abs(pct)}% since you started watching`}\n${SITE_URL}${r.href}`;
    }),
    "",
    `Your watchlist: ${SITE_URL}/watching`,
    `Stop this weekly email: ${stopUrl}`,
  ].join("\n");
  return { subject, html: emailShell(escapeHtml(subject), inner, footer, intro), text };
}

export function stopUrl(token: string): string {
  return `${SITE_URL}/watch-digest/stop?t=${encodeURIComponent(token)}`;
}

export interface WatchDigestSummary {
  edition: string;
  subscribers: number;
  due: number;
  emails: number;
  empty: number;
  failed: number;
  remaining: number;
  errors?: string[];
}

/** Room left in Brevo's 300 a day for everything else that shares it. */
export const DIGEST_BATCH = 120;

export async function runWatchDigest(opts: { limit?: number; now?: Date } = {}): Promise<WatchDigestSummary> {
  const edition = editionKey(opts.now);
  const limit = opts.limit && opts.limit > 0 ? Math.min(opts.limit, DIGEST_BATCH) : DIGEST_BATCH;
  const subs = await prisma.watchDigestSub.findMany({
    where: { optedOutAt: null },
    select: { userId: true, email: true, token: true, lastEditionKey: true },
  });
  const due = subs.filter((s) => s.lastEditionKey !== edition);
  const summary: WatchDigestSummary = { edition, subscribers: subs.length, due: due.length, emails: 0, empty: 0, failed: 0, remaining: 0 };
  if (!isBrevoEnabled()) {
    summary.remaining = due.length;
    summary.errors = ["Brevo not configured"];
    return summary;
  }
  const errors = new Set<string>();
  let attempted = 0;
  for (const s of due) {
    if (attempted >= limit) break;
    const watches = await prisma.priceAlert.findMany({
      where: { userId: s.userId },
      select: { cardId: true, market: true, startPriceCents: true, lastPriceCents: true },
      take: 500,
    });
    const cards = await prisma.card.findMany({
      where: { id: { in: [...new Set(watches.map((w) => w.cardId))] } },
      select: { id: true, slug: true, name: true, setName: true },
    });
    const byId = new Map(cards.map((c) => [c.id, c]));
    const rows: DigestRow[] = [];
    for (const w of watches) {
      const c = byId.get(w.cardId);
      if (!c || w.lastPriceCents == null) continue;
      rows.push({ name: c.name, setName: c.setName, href: cardHref(c), currency: currencyOf(normalizeCountry(w.market)), startCents: w.startPriceCents, nowCents: w.lastPriceCents });
    }
    const picked = pickDigestRows(rows);
    if (picked.rows.length === 0) {
      // Nothing priced to show: this week is done for them, and nothing is sent.
      await prisma.watchDigestSub.update({ where: { userId: s.userId }, data: { lastEditionKey: edition } });
      summary.empty++;
      continue;
    }
    attempted++;
    const mail = buildWatchDigestEmail(picked, rows.length, stopUrl(s.token));
    const oneClick = `${SITE_URL}/api/watch-digest/stop?t=${encodeURIComponent(s.token)}`;
    const ok = await sendEmailBrevo(s.email, mail.subject, mail.html, {
      text: mail.text,
      headers: { "List-Unsubscribe": `<${oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    });
    if (ok) {
      await prisma.watchDigestSub.update({ where: { userId: s.userId }, data: { lastEditionKey: edition, sentCount: { increment: 1 } } });
      summary.emails++;
    } else {
      summary.failed++;
      const e = getLastEmailError();
      if (e && errors.size < 3) errors.add(e);
    }
  }
  summary.remaining = Math.max(0, due.length - summary.emails - summary.empty);
  if (errors.size) summary.errors = [...errors];
  return summary;
}
