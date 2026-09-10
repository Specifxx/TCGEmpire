/**
 * INBOX CENSUS — read-only. Dumps everything a human sent in through a site form
 * and nobody has actioned yet: contact messages, store suggestions, feedback and
 * wrong-price/wrong-card reports. The same four queues /admin/messages renders,
 * in a form that can be read from a CI log.
 *
 * WHY THIS EXISTS. /admin/messages is the only way to read these queues, and it
 * needs either an admin session or ADMIN_TOKEN against a running deployment.
 * Neither is available to an agent or to anyone triaging from a terminal, so the
 * queue could only be worked through a browser. This is the same read-only-census
 * shape as audit-users / audit-store-health, and it exists so the queue can be
 * ACTED on (a store added to retailers.ts, a card page corrected) from the repo
 * rather than transcribed out of a web page by hand.
 *
 * NO PII IN THE LOG. Job logs are visible to every repo collaborator, and these
 * tables are the one place on this site where members of the public typed their
 * own email address into a form. Addresses and IPs are therefore NEVER printed —
 * an address is reduced to its domain (`@gmail.com`) purely so a reply-needed row
 * is distinguishable from an anonymous one. Same rule audit-users states in its
 * own header. Message BODIES are printed: they are the thing being actioned, and
 * they were sent to be read.
 *
 * Usage:  npx tsx scripts/audit-inbox.ts          # open items only
 *         ALL=1 npx tsx scripts/audit-inbox.ts    # every row, whatever its status
 */
import { prisma } from "../src/lib/db";
import { issueLabel } from "../src/lib/price-report";

const ALL = process.env.ALL === "1";

// An address becomes "@domain" and nothing else. Enough to tell "this person
// wants a reply" from "anonymous"; not enough to identify anyone.
const emailDomain = (e: string | null | undefined) => {
  if (!e) return "(none)";
  const at = e.lastIndexOf("@");
  return at === -1 ? "(malformed)" : `@${e.slice(at + 1)}`;
};

const day = (d: Date) => new Date(d).toISOString().slice(0, 10);
const line = (s: string) => console.log(s);
const rule = (title: string) => {
  console.log("");
  console.log("═".repeat(78));
  console.log(title);
  console.log("═".repeat(78));
};

// A body can be long and can contain newlines; both wreck a log. Collapsed to
// single-spaced text, never truncated — the whole point is to read what they said.
const body = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

async function main() {
  rule(`INBOX${ALL ? " (every row)" : " (open items only)"}`);

  // ── Contact messages ──────────────────────────────────────────────────────
  // ContactMessage has no status column at all — every row is "open" by the
  // model's own definition, so ALL changes nothing here. Capped like the admin
  // page caps it.
  const messages = await prisma.contactMessage.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
  rule(`CONTACT MESSAGES — ${messages.length}`);
  if (!messages.length) line("(none)");
  for (const m of messages) {
    line(`- [${day(m.createdAt)}] ${emailDomain(m.email)} · subject: ${body(m.subject) || "(none)"}`);
    line(`    ${body(m.message)}`);
  }

  // ── Store suggestions ─────────────────────────────────────────────────────
  const suggestions = await prisma.storeSuggestion.findMany({
    where: ALL ? {} : { status: "pending" },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  rule(`STORE SUGGESTIONS — ${suggestions.length}${ALL ? "" : " pending"}`);
  if (!suggestions.length) line("(none)");
  for (const s of suggestions) {
    line(`- [${day(s.createdAt)}] ${s.status.toUpperCase()} · ${s.country} · ${s.storeName}`);
    line(`    url:  ${s.storeUrl}`);
    line(`    from: ${emailDomain(s.email)}${s.note ? ` · note: ${body(s.note)}` : ""}`);
    line(`    id:   ${s.id}`);
  }

  // ── Feedback ──────────────────────────────────────────────────────────────
  const feedback = await prisma.feedback.findMany({
    where: ALL ? {} : { status: "NEW" },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  rule(`FEEDBACK — ${feedback.length}${ALL ? "" : " NEW"}`);
  if (!feedback.length) line("(none)");
  for (const f of feedback) {
    const stars = f.rating == null ? "no rating" : `${f.rating}/5`;
    line(
      `- [${day(f.createdAt)}] ${f.status} · ${stars} · source:${f.source} · page:${f.page ?? "(none)"}` +
        ` · consentPublic:${f.consentPublic} · ${f.userId ? "signed-in" : "anonymous"} · ${emailDomain(f.email)}`,
    );
    line(`    ${body(f.message)}`);
    line(`    id:   ${f.id}`);
  }

  // ── Wrong-price / wrong-card reports ──────────────────────────────────────
  const reports = await prisma.priceReport.findMany({
    where: ALL ? {} : { status: "NEW" },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  rule(`PRICE / CARD REPORTS — ${reports.length}${ALL ? "" : " NEW"}`);
  if (!reports.length) line("(none)");

  // Resolve card slugs so a report names the PAGE a human would open, not an
  // opaque cuid. One query for the whole batch.
  const cardIds = [...new Set(reports.map((r) => r.cardId).filter((v): v is string => !!v))];
  const cards = cardIds.length
    ? await prisma.card.findMany({
        where: { id: { in: cardIds } },
        select: { id: true, slug: true, name: true, setCode: true, collectorNumber: true },
      })
    : [];
  const cardById = new Map(cards.map((c) => [c.id, c]));

  for (const r of reports) {
    const card = r.cardId ? cardById.get(r.cardId) : null;
    const what = card
      ? `${card.name} [${card.setCode} ${card.collectorNumber}] → /card/${card.slug}`
      : r.cardId
        ? `cardId ${r.cardId} (NO LONGER IN THE CATALOGUE)`
        : `sealed ${r.sealedGroupKey ?? "(no key)"}`;
    const shown = r.shownPriceCents == null ? "(listing already gone)" : `${(r.shownPriceCents / 100).toFixed(2)} ${r.currency}`;
    const claimed = r.actualPriceCents == null ? "(not given)" : `${(r.actualPriceCents / 100).toFixed(2)} ${r.currency}`;
    line(`- [${day(r.createdAt)}] ${r.status} · ${r.kind} · ${issueLabel(r.issue)}`);
    line(`    what:   ${what}`);
    line(`    store:  ${r.retailerName} (${r.retailer}) · ${r.country}`);
    line(`    we said ${shown} · they say ${claimed}`);
    if (r.note) line(`    note:   ${body(r.note)}`);
    line(`    page:   ${r.page ?? "(none)"} · from ${emailDomain(r.email)}`);
    line(`    id:     ${r.id}`);
  }

  // ── Per-store rollup ──────────────────────────────────────────────────────
  // The same signal /admin/messages surfaces: several OPEN reports against one
  // store in a fortnight is a broken scraper, not bad luck.
  const FORTNIGHT_MS = 14 * 86_400_000;
  const recentOpen = reports.filter(
    (r) => r.status === "NEW" && Date.now() - new Date(r.createdAt).getTime() < FORTNIGHT_MS,
  );
  const byRetailer = [...recentOpen.reduce((m, r) => m.set(r.retailerName, (m.get(r.retailerName) ?? 0) + 1), new Map<string, number>())]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1]);
  rule(`STORES WITH >1 OPEN REPORT IN THE LAST FORTNIGHT — ${byRetailer.length}`);
  if (!byRetailer.length) line("(none — no store is repeatedly wrong)");
  for (const [name, n] of byRetailer) line(`- ${name}: ${n} open reports`);

  rule("END");
}

main()
  .catch((e) => {
    console.error("audit-inbox failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
