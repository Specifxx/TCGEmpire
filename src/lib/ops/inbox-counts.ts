// How many things are waiting in the inbox, for the admin badge and the monitor.
//
// "New" per queue:
//   feedback, wrong-price reports  status NEW        (the admin already works these)
//   store suggestions              status pending
//   support tickets                status OPEN
//   contact messages               created since the owner last opened the Inbox page.
//                                  ContactMessage has no status column, so "seen" is one
//                                  Counter row (epoch minutes), written when the page loads.
//
// One cheap aggregate per queue; none of them returns rows.
import { prisma } from "../db";
import type { InboxCounts } from "./types";

export const INBOX_SEEN_KEY = "admin:inbox:seen";

const toMinutes = (d: Date) => Math.floor(d.getTime() / 60_000);

export async function getInboxCounts(): Promise<InboxCounts> {
  const seenRow = await prisma.counter.findUnique({ where: { key: INBOX_SEEN_KEY } }).catch(() => null);
  const seen = seenRow ? new Date(seenRow.value * 60_000) : new Date(0);

  const [contact, feedback, sugg, reports, support] = await Promise.all([
    prisma.contactMessage.aggregate({ where: { createdAt: { gt: seen } }, _count: { _all: true }, _min: { createdAt: true } }),
    prisma.feedback.aggregate({ where: { status: "NEW" }, _count: { _all: true }, _min: { createdAt: true } }),
    prisma.storeSuggestion.aggregate({ where: { status: "pending" }, _count: { _all: true }, _min: { createdAt: true } }),
    prisma.priceReport.aggregate({ where: { status: "NEW" }, _count: { _all: true }, _min: { createdAt: true } }),
    prisma.supportTicket.aggregate({ where: { status: "OPEN" }, _count: { _all: true }, _min: { createdAt: true } }),
  ]);

  const oldest = [contact, feedback, sugg, reports, support]
    .map((a) => a._min.createdAt)
    .filter((d): d is Date => !!d)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  const counts = {
    contact: contact._count._all,
    feedback: feedback._count._all,
    storeSuggestions: sugg._count._all,
    priceReports: reports._count._all,
    support: support._count._all,
  };
  return { ...counts, total: Object.values(counts).reduce((a, b) => a + b, 0), oldestAt: oldest ? oldest.toISOString() : null };
}

/** The owner has opened the Inbox: everything in it up to now counts as seen. */
export async function markInboxSeen(now = new Date()): Promise<void> {
  const value = toMinutes(now);
  await prisma.counter.upsert({ where: { key: INBOX_SEEN_KEY }, create: { key: INBOX_SEEN_KEY, value }, update: { value } });
}
