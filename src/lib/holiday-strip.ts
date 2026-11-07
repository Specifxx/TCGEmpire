import { blackFriday, cyberMonday } from "./black-friday";

// The holiday strip (DECISIONS.md, "Black Friday strip", 2026-11-07): one line at the top of every page from
// 1 November to the Saturday after Black Friday linking /black-friday, then /cyber-monday to the day after
// Cyber Monday, then nothing. Server HTML, so every page links the two pages for crawlers too; never a pop-up,
// a countdown or "ends soon". PURE: tests/black-friday.test.ts.

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function saleStrip(today: string): { href: "/black-friday" | "/cyber-monday"; name: string } | null {
  const y = Number(today.slice(0, 4));
  if (today < `${y}-11-01`) return null;
  if (today <= addDays(blackFriday(y), 1)) return { href: "/black-friday", name: "Black Friday" };
  if (today <= addDays(cyberMonday(y), 1)) return { href: "/cyber-monday", name: "Cyber Monday" };
  return null;
}
