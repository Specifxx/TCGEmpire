import { SITE_URL } from "@/lib/site";
import { nextDatedRelease } from "@/lib/release-calendar";

// "Add to calendar" for the next dated Riftbound release — the phone/desktop
// half of taking the countdown elsewhere (the /embed/release-countdown route is
// the other-website half). A calendar app already syncs across every device its
// owner uses, which is a better answer to "have it on my phone or computer" than
// building a bespoke widget for each platform would be.
//
// ALL-DAY, not a timed event: Riot publishes the date, not the hour (the same
// line /release-dates itself carries), so a precise instant would be inventing
// a time nobody announced. An all-day event on the exact date needs no timezone
// conversion at all, which a timed one always would.
export const revalidate = 3600;

function icsEscape(s: string): string {
  // RFC 5545 §3.3.11: backslash, semicolon, comma and newline are the only
  // characters TEXT values must escape.
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function foldLine(line: string): string {
  // RFC 5545 §3.1: lines over 75 octets must be folded with CRLF + a leading
  // space. Riftbound release notes are short enough that this rarely fires,
  // but a long DESCRIPTION would otherwise produce an invalid calendar file.
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    parts.push(rest.slice(0, 75));
    rest = rest.slice(75);
  }
  parts.push(rest);
  return parts.join("\r\n ");
}

function addDaysUtc(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, "0")}${String(dt.getUTCDate()).padStart(2, "0")}`;
}

export async function GET() {
  const next = nextDatedRelease();
  if (!next || !next.date) {
    return new Response("No dated Riftbound release is currently scheduled.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const start = next.date.replace(/-/g, "");
  const end = addDaysUtc(next.date, 1); // DTEND is exclusive per RFC 5545
  const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const uid = `riftbound-release-${next.date}@riftcompare.com`;
  const description = `${next.note} Compare prices across every store from the moment it drops: ${SITE_URL}/release-dates`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RiftCompare//Release Calendar//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${start}`,
    `DTEND;VALUE=DATE:${end}`,
    foldLine(`SUMMARY:${icsEscape(`Riftbound: ${next.name} releases`)}`),
    foldLine(`DESCRIPTION:${icsEscape(description)}`),
    `URL:${SITE_URL}/release-dates`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8; method=PUBLISH",
      "Content-Disposition": `attachment; filename="riftbound-${next.date}.ics"`,
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      "X-Robots-Tag": "noindex",
    },
  });
}
