import { prisma } from "@/lib/db";
import { isGiveawayTeamEmail } from "@/lib/admin-emails";
import { escapeHtml, emailButton, emailShell, sendEmail } from "@/lib/email";
import { notifyOwnerBounded } from "@/lib/ops/notify-owner";
import { SITE_URL } from "@/lib/site";
import {
  GIVEAWAYS,
  GIVEAWAY_SITES,
  assignTickets,
  drandRoundAt,
  drandRoundUrl,
  giveawayState,
  notifyOnCount,
  publicName,
  ticketHolder,
  type Giveaway,
} from "@/lib/giveaway";
import { fetchDrandRound, signClaimToken, winningTicket } from "@/lib/giveaway-draw";
import { giveawayEntrants } from "@/lib/giveaway-server";

// THE DRAW, run every few hours by .github/workflows/giveaway-draw.yml through /api/cron/giveaway-draw (owner, 2026-11-22: "after
// the giveaway finishes, I need to be notified about who won ... display on the website like a trophy banner ... the winning
// number ... grab their details"). DECISIONS.md, 2026-11-22.
//
// For each closed giveaway with no draw: wait for the drand round published at the close, number every point as a ticket in
// entry order (the team left out), take ticket = randomness mod tickets + 1, record it, email the winner a claim link (their
// postal address, CLAIM days) and email the owner who won. A draw still waiting past its claim date with no claim is marked
// expired and redrawn (MAX_ATTEMPTS in all) from the same round's next seed, earlier winners left out. Everything is idempotent:
// one GiveawayDraw row per (giveaway, attempt), so a second run the same day does nothing.
export const MAX_ATTEMPTS = 3;

export interface DrawLine {
  giveaway: string;
  did: "nothing" | "waiting-drand" | "no-entries" | "drawn" | "redrawn" | "expired-final";
  ticket?: number;
  total?: number;
  winner?: string;
}

export async function runGiveawayDraws({ dryRun = false, now = new Date(), list = GIVEAWAYS }: { dryRun?: boolean; now?: Date; list?: Giveaway[] } = {}): Promise<DrawLine[]> {
  const out: DrawLine[] = [];
  for (const g of list) {
    if (giveawayState(g, now) !== "closed") continue;
    const draws = await prisma.giveawayDraw.findMany({ where: { giveaway: g.key }, orderBy: { attempt: "asc" } });
    const last = draws[draws.length - 1];
    if (last && (last.status !== "pending" || last.claimBy.getTime() > now.getTime())) {
      out.push({ giveaway: g.key, did: "nothing" });
      continue;
    }
    if (last && last.attempt + 1 >= MAX_ATTEMPTS) {
      if (!dryRun) await prisma.giveawayDraw.update({ where: { id: last.id }, data: { status: "expired" } });
      out.push({ giveaway: g.key, did: "expired-final" });
      continue;
    }
    const round = last?.drandRound ?? drandRoundAt(g.closesAt);
    const beacon = last ? { round, randomness: last.randomness } : await fetchDrandRound(round);
    if (!beacon) {
      out.push({ giveaway: g.key, did: "waiting-drand" });
      continue;
    }
    const attempt = last ? last.attempt + 1 : 0;
    const earlier = new Set(draws.map((d) => d.winnerId));
    const pool = (await giveawayEntrants(g, isGiveawayTeamEmail)).filter((e) => !e.admin && !earlier.has(e.userId));
    const { runs, total } = assignTickets(pool);
    if (total === 0) {
      out.push({ giveaway: g.key, did: "no-entries" });
      continue;
    }
    const ticket = winningTicket(beacon.randomness, total, attempt);
    const holder = ticketHolder(runs, ticket);
    if (!holder) throw new Error(`${g.key}: ticket ${ticket} has no holder`);
    const w = holder.row;
    const name = publicName(w.name, w.showName);
    out.push({ giveaway: g.key, did: last ? "redrawn" : "drawn", ticket, total, winner: name });
    if (dryRun) continue;
    const claimBy = new Date(now.getTime() + g.claimDays * 86_400_000);
    if (last) await prisma.giveawayDraw.update({ where: { id: last.id }, data: { status: "expired" } });
    await prisma.giveawayDraw.create({
      data: {
        giveaway: g.key,
        attempt,
        drandRound: beacon.round,
        randomness: beacon.randomness,
        totalTickets: total,
        entrants: pool.length,
        ticket,
        winnerId: w.userId,
        publicName: name,
        country: w.country,
        claimBy,
      },
    });
    const claimUrl = `${SITE_URL}/giveaway/claim#t=${await signClaimToken(g.key, w.userId, claimBy)}`;
    const sent = await sendEmail(w.email, `You won the ${GIVEAWAY_SITES[g.site].name} giveaway`, winnerEmail(g, ticket, total, claimUrl, claimBy), {
      text: `You won ${g.prize} (ticket #${ticket} of ${total}). Send us your postal address by ${claimBy.toUTCString()}: ${claimUrl}`,
    });
    await notifyOwnerBounded({
      kind: "giveaway-winner",
      headline: `${GIVEAWAY_SITES[g.site].name} giveaway${attempt ? ` (redraw ${attempt})` : ""}: ${w.name} won`,
      fields: [
        ["Prize", g.prize],
        ["Winner", `${w.name} <${w.email}>`],
        ["Country", w.country ?? "not set"],
        ["Ticket", `#${ticket} of ${total} (${pool.length} entrants)`],
        ["drand round", `${beacon.round} · ${drandRoundUrl(beacon.round)}`],
        ["Claim email", sent ? "sent" : "NOT sent (mail failed): email them yourself"],
        ["Claim by", claimBy.toISOString()],
        ["Next", "Their address arrives in a second email when they claim, and on /admin/giveaway."],
      ],
    });
  }
  return out;
}

function winnerEmail(g: Giveaway, ticket: number, total: number, claimUrl: string, claimBy: Date): string {
  const site = GIVEAWAY_SITES[g.site];
  const by = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "long", year: "numeric" }).format(claimBy);
  const inner = `
    <tr><td style="padding:8px 32px 0;font-size:15px;line-height:1.6;color:#e5e9f0">Congratulations! Your ticket <b>#${ticket}</b> (of ${total}) was drawn in the ${escapeHtml(site.name)} giveaway. You've won <b>${escapeHtml(g.prize)}</b>.</td></tr>
    <tr><td style="padding:12px 32px 0;font-size:14px;line-height:1.6;color:#b8c0cc">Tell us where to post it by <b>${by}</b>. We post it at our cost, anywhere we legally can.</td></tr>
    <tr><td style="padding:16px 32px 8px">${emailButton(claimUrl, "Claim your prize")}</td></tr>
    <tr><td style="padding:8px 32px 20px;font-size:12px;line-height:1.6;color:#6b7585">${escapeHtml(site.name)}'s giveaways are run by its sister site RiftCompare, where your account lives. If the link doesn't open, reply to this email.</td></tr>`;
  return emailShell("You won!", inner, "");
}

/** The claim form's answer: stored, the draw marked claimed, and the owner emailed the ready-to-ship packet. */
export async function recordClaim(
  g: Giveaway,
  userId: string,
  a: { fullName: string; line1: string; line2?: string; city: string; region?: string; postcode: string; country: string; phone?: string; note?: string },
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const draw = (await prisma.giveawayDraw.findMany({ where: { giveaway: g.key }, orderBy: { attempt: "desc" }, take: 1 }))[0];
  if (!draw || draw.winnerId !== userId) return { ok: false, status: 403, error: "This link is for a different winner." };
  if (draw.status === "expired") return { ok: false, status: 410, error: "The claim window for this prize has closed." };
  if (draw.status === "pending" && draw.claimBy.getTime() < Date.now()) return { ok: false, status: 410, error: "The claim window for this prize has closed." };
  await prisma.giveawayClaim.upsert({
    where: { giveaway_userId: { giveaway: g.key, userId } },
    create: { giveaway: g.key, userId, ...a },
    update: { ...a },
  });
  if (draw.status === "pending") await prisma.giveawayDraw.update({ where: { id: draw.id }, data: { status: "claimed", claimedAt: new Date() } });
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, displayName: true } });
  await notifyOwnerBounded({
    kind: "giveaway-winner",
    headline: `Ship it: ${GIVEAWAY_SITES[g.site].name} giveaway prize to ${a.fullName}`,
    fields: [
      ["Prize", g.prize],
      ["Ship to", [a.fullName, a.line1, a.line2, [a.city, a.region, a.postcode].filter(Boolean).join(" "), a.country].filter(Boolean).join("\n")],
      ["Phone", a.phone || "not given"],
      ["Winner's email", u?.email ?? "?"],
      ["Note", a.note || ""],
      ["Ticket", `#${draw.ticket} of ${draw.totalTickets}`],
      ["When sent", `Mark it shipped on ${SITE_URL}/admin/giveaway`],
    ],
  });
  return { ok: true };
}

/** The owner hears about a giveaway's first entrant and every 50th (lib/giveaway.ts notifyOnCount). */
export async function entryMilestone(g: Giveaway): Promise<void> {
  const count = await prisma.giveawayEntry.count({ where: { giveaway: g.key } }).catch(() => 0);
  if (!notifyOnCount(count)) return;
  await notifyOwnerBounded({
    kind: "giveaway",
    headline: `${GIVEAWAY_SITES[g.site].name} giveaway: ${count} ${count === 1 ? "entrant" : "entrants"}`,
    fields: [
      ["Giveaway", g.title],
      ["Closes", g.closesAt],
      ["Admin", `${SITE_URL}/admin/giveaway`],
    ],
  });
}
