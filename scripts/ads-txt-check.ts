/**
 * scripts/ads-txt-check.ts — what a correct /ads.txt BODY is, in one place.
 *
 * Shared by the two live checks, scripts/adsense-verify.ts and
 * `npm run adsense:guard -- --url`, and run against the route's own output in
 * tests/ads-txt.test.ts, so the gate and the route cannot disagree again.
 *
 * NOT AN EXACT-BODY MATCH (2026-09-26, "Blog and tools, joined up" in
 * DECISIONS.md). Both live checks used to require the body to be exactly the
 * one Google line. Since 2026-08-21 the file also carries a header-bidding
 * partner's records (PARTNER_RECORDS in src/app/ads.txt/route.ts), so both
 * reported a correct production file as broken — and a gate that fails on a
 * correct file invites someone to "fix" it by deleting the partner block. What
 * AdSense needs is the Google DIRECT record for this account on the FIRST line;
 * everything after it only has to be well-formed IAB records.
 *
 * No imports: adsense-verify.ts runs with nothing but tsx.
 */

/** Google's certification-authority id: the same for every AdSense publisher. */
export const GOOGLE_CERT_AUTHORITY_ID = "f08c47fec0942fa0";

/** The line AdSense looks for, for this seller id ("pub-…", never "ca-pub-…"). */
export function googleAdsTxtLine(pubId: string): string {
  return `google.com, ${pubId}, DIRECT, ${GOOGLE_CERT_AUTHORITY_ID}`;
}

// IAB ads.txt 1.1 variable declarations ("contact=…", "subdomain=…"). None are
// served today; accepting them keeps a future one from reading as a bad record.
const VARIABLE = /^(contact|subdomain|inventorypartnerdomain|ownerdomain|managerdomain)=/i;

/**
 * Every problem with an ads.txt body, or [] when it is valid:
 *   - the first line is exactly the Google DIRECT record for `pubId`;
 *   - no markup (the old failure: the path served the App Router's HTML page);
 *   - every other non-blank, non-comment line is a record of 3 or 4
 *     comma-separated fields whose third is DIRECT or RESELLER ("#" starts a
 *     trailing comment, per the IAB spec).
 */
export function adsTxtProblems(body: string, pubId: string): string[] {
  const problems: string[] = [];
  const lines = body.split(/\r?\n/);
  const expected = googleAdsTxtLine(pubId);
  if (lines[0] !== expected) {
    problems.push(`first line is ${JSON.stringify(lines[0].slice(0, 120))}, expected ${JSON.stringify(expected)}`);
  }
  if (/[<>]/.test(body)) problems.push("body contains markup: the path is serving a page, not the ads.txt file");
  lines.forEach((line, i) => {
    const record = line.split("#", 1)[0].trim();
    if (!record || VARIABLE.test(record)) return;
    const fields = record.split(",").map((f) => f.trim());
    if (fields.length !== 3 && fields.length !== 4) {
      problems.push(`line ${i + 1} has ${fields.length} fields, not 3 or 4: ${JSON.stringify(line.slice(0, 120))}`);
    } else if (!/^(DIRECT|RESELLER)$/.test(fields[2])) {
      problems.push(`line ${i + 1} has account type ${JSON.stringify(fields[2])}, not DIRECT or RESELLER`);
    }
  });
  return problems;
}
