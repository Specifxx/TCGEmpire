/**
 * Owned audience count, read-only (code red, 2026-11-20: "contacts gained per week"). Job logs are public, so this
 * prints counts only: never an address, a name or an id.
 *
 * A reachable contact is an email address we may write to (an account, a price/restock/release alert, a newsletter
 * subscriber, a CONFIRMED sister-site alert or weekly-email address), counted once, in the week it was FIRST seen in
 * any of those tables, under the source it first came through. Plus the Discord hub's member count now (Discord's
 * public invite endpoint, no login). Weeks are UTC, Monday to Sunday; the current week is partial and says so.
 *
 * Usage: npx tsx scripts/owned-audience.ts            (maintenance.yml task "owned-audience")
 */
import { appendFileSync } from "node:fs";
import { prisma } from "../src/lib/db";
import { NOT_SEED_WHERE } from "../src/lib/premium";

const DAY = 86_400_000;
const WEEKS = 8;
/** The hub's catch-all invite (Singles DB, emails, other): its counts are the whole server's. */
const DISCORD_INVITE_CODE = "cdJEpmuTW2";

function mondayOf(t: number): string {
  const d = new Date(t);
  const back = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - back)).toISOString().slice(0, 10);
}

type First = { at: number; source: string };

async function main() {
  const first = new Map<string, First>();
  const see = (email: string | null | undefined, at: Date | null | undefined, source: string) => {
    if (!email || !at) return;
    const k = email.trim().toLowerCase();
    if (k.endsWith("@tcgempire.au") || k === "test@test.com") return;
    const t = at.getTime();
    const cur = first.get(k);
    if (!cur || t < cur.at) first.set(k, { at: t, source });
  };
  const unreadable: string[] = [];
  const read = async (label: string, f: () => Promise<void>) => {
    try {
      await f();
    } catch (e) {
      unreadable.push(`${label}: ${(e as Error).message.split("\n")[0].slice(0, 80)}`);
    }
  };

  await read("accounts", async () => {
    const rows = await prisma.user.findMany({ where: { AND: [NOT_SEED_WHERE, { emailVerified: { not: null } }] }, select: { email: true, createdAt: true } });
    for (const r of rows) see(r.email, r.createdAt, "rift:account");
  });
  await read("priceAlert", async () => {
    const rows = await prisma.priceAlert.groupBy({ by: ["email"], _min: { createdAt: true } });
    for (const r of rows) see(r.email, r._min.createdAt, "rift:alert");
  });
  await read("sealedWatch", async () => {
    const rows = await prisma.sealedWatch.groupBy({ by: ["email"], _min: { createdAt: true } });
    for (const r of rows) see(r.email, r._min.createdAt, "rift:restock");
  });
  await read("setReleaseAlert", async () => {
    const rows = await prisma.setReleaseAlert.groupBy({ by: ["email"], _min: { createdAt: true } });
    for (const r of rows) see(r.email, r._min.createdAt, "rift:release");
  });
  await read("newsletter", async () => {
    const rows = await prisma.newsletterSubscriber.findMany({ select: { email: true, createdAt: true } });
    for (const r of rows) see(r.email, r.createdAt, "rift:newsletter");
  });
  await read("sister", async () => {
    // Only confirmed addresses are reachable; each is credited to the site (and kind) of its earliest row.
    const confirmed = new Set(
      (await prisma.sisterAlertAddress.findMany({ where: { confirmedAt: { not: null } }, select: { email: true } })).map((r) => r.email.trim().toLowerCase()),
    );
    const site = new Map<string, First>();
    const take = (email: string, at: Date | null, source: string) => {
      const k = email.trim().toLowerCase();
      if (!at || !confirmed.has(k)) return;
      const cur = site.get(k);
      if (!cur || at.getTime() < cur.at) site.set(k, { at: at.getTime(), source });
    };
    for (const r of await prisma.sisterAlert.groupBy({ by: ["email", "site"], _min: { createdAt: true } })) take(r.email, r._min.createdAt, `${r.site}:alert`);
    for (const r of await prisma.sisterDigest.groupBy({ by: ["email", "site"], _min: { createdAt: true } })) take(r.email, r._min.createdAt, `${r.site}:weekly`);
    for (const [k, v] of site) see(k, new Date(v.at), v.source);
  });

  let discord: string = "unreadable";
  try {
    const r = await fetch(`https://discord.com/api/v10/invites/${DISCORD_INVITE_CODE}?with_counts=true`, { headers: { "User-Agent": "riftcompare-owned-audience (counts only)" } });
    const j = (await r.json()) as { approximate_member_count?: number; approximate_presence_count?: number };
    if (r.ok && typeof j.approximate_member_count === "number") discord = `${j.approximate_member_count} members (${j.approximate_presence_count ?? "?"} online)`;
    else discord = `unreadable (HTTP ${r.status})`;
  } catch (e) {
    discord = `unreadable (${(e as Error).message.slice(0, 60)})`;
  }

  const now = Date.now();
  const weeks: string[] = [];
  for (let i = WEEKS - 1; i >= 0; i--) weeks.push(mondayOf(now - i * 7 * DAY));
  const thisWeek = weeks[weeks.length - 1];
  const bySourceWeek = new Map<string, Map<string, number>>();
  const totals = new Map<string, number>();
  for (const v of first.values()) {
    const w = mondayOf(v.at);
    if (w < weeks[0]) continue;
    totals.set(w, (totals.get(w) ?? 0) + 1);
    const m = bySourceWeek.get(v.source) ?? new Map<string, number>();
    m.set(w, (m.get(w) ?? 0) + 1);
    bySourceWeek.set(v.source, m);
  }

  const head = `| source | ${weeks.map((w) => (w === thisWeek ? `${w.slice(5)} (so far)` : w.slice(5))).join(" | ")} |`;
  const sep = `|---|${weeks.map(() => "---:").join("|")}|`;
  const row = (label: string, m: Map<string, number> | undefined) => `| ${label} | ${weeks.map((w) => m?.get(w) ?? 0).join(" | ")} |`;
  const lines = [
    `## Owned audience: new reachable contacts per week (UTC weeks from Monday)`,
    "",
    `Reachable addresses all time: ${first.size}. Discord hub now: ${discord}.`,
    "",
    head,
    sep,
    row("**all new contacts**", totals),
    ...[...bySourceWeek.keys()].sort().map((s) => row(s, bySourceWeek.get(s))),
    "",
    ...(unreadable.length ? [`Unreadable: ${unreadable.join("; ")}`] : []),
  ];
  const text = lines.join("\n");
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + "\n");
}

main()
  .catch((e) => {
    console.error((e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
