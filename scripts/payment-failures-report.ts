/**
 * WHY DID STRIPE REFUSE THE PAYMENT — read-only.
 *
 * Owner, 2026-10-12: a member's feedback read "payment wouldnt go through with
 * multiple cards for a membership", and the owner saw the attempts "keep getting
 * blocked in stripe". The dashboard shows each refusal one at a time; this lists
 * every charge Stripe made or refused in the window, with the field that says
 * WHO refused it:
 *
 *   outcome.type      authorized | manual_review | issuer_declined | blocked | invalid
 *                     "blocked" = Stripe Radar refused it before the bank saw it;
 *                     "issuer_declined" = the card's bank said no.
 *   outcome.reason    e.g. highest_risk_level, elevated_risk_level, rule
 *   outcome.rule      the Radar rule id/action when a rule (not the model) blocked it
 *   risk_level/score  Radar's assessment
 *   checks            CVC / postcode / address-line results — "unavailable" when the
 *                     checkout never asked for them, which raises the risk score
 *
 * Plus card brand, funding, country and the 3-D Secure result, so a pattern
 * (one country's cards, prepaid cards, $1 charges) is visible in one read.
 *
 * NEVER WRITES. No email, name, customer id or card digits reach the CI log:
 * the customer is shown as #1, #2 … (stable within one run) and an account's
 * charges are grouped under that number, so "one person tried four cards" reads
 * as four rows under one #.
 *
 * Usage: DAYS=30 npx tsx scripts/payment-failures-report.ts   (needs STRIPE_SECRET_KEY)
 */
import type Stripe from "stripe";
import { stripe, stripeEnabled } from "../src/lib/stripe";

const DAYS = Math.max(1, Math.min(90, Number(process.env.DAYS) || 30));

async function main() {
  if (!stripeEnabled()) {
    console.log("STRIPE_SECRET_KEY is not set — nothing to read.");
    return;
  }
  const since = Math.floor(Date.now() / 1000) - DAYS * 86_400;
  const charges: Stripe.Charge[] = [];
  let startingAfter: string | undefined;
  for (let i = 0; i < 20; i++) {
    const page = await stripe().charges.list({
      limit: 100,
      created: { gte: since },
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    charges.push(...page.data);
    if (!page.has_more || !page.data.length) break;
    startingAfter = page.data[page.data.length - 1].id;
  }

  // Anonymise: one number per customer (or per billing fingerprint when a
  // charge has no customer), in order of first appearance.
  const who = new Map<string, number>();
  const label = (c: Stripe.Charge) => {
    const key = (typeof c.customer === "string" ? c.customer : c.customer?.id) ?? c.billing_details?.email ?? c.id;
    if (!who.has(key)) who.set(key, who.size + 1);
    return `#${who.get(key)}`;
  };

  const tally = new Map<string, number>();
  const bump = (k: string) => tally.set(k, (tally.get(k) ?? 0) + 1);

  console.log(`CHARGES IN THE LAST ${DAYS} DAYS — ${charges.length}`);
  console.log("");
  const rows = [...charges].sort((a, b) => a.created - b.created);
  for (const c of rows) {
    const o = c.outcome;
    const card = c.payment_method_details?.card;
    const checks = card?.checks;
    const amount = `${(c.amount / 100).toFixed(2)} ${c.currency.toUpperCase()}`;
    const kind = o?.type ?? (c.paid ? "authorized" : "unknown");
    bump(`${c.status}/${kind}${o?.reason ? `:${o.reason}` : ""}`);
    const rule = o?.rule ? (typeof o.rule === "string" ? o.rule : `${o.rule.action} ${o.rule.predicate}`) : "";
    console.log(
      [
        new Date(c.created * 1000).toISOString().slice(0, 16).replace("T", " "),
        label(c),
        amount,
        c.status,
        `outcome=${kind}`,
        o?.reason ? `reason=${o.reason}` : "",
        o?.network_status ? `network=${o.network_status}` : "",
        o?.risk_level ? `risk=${o.risk_level}${o.risk_score != null ? `(${o.risk_score})` : ""}` : "",
        rule ? `rule=[${rule}]` : "",
        c.failure_code ? `failure=${c.failure_code}` : "",
        card ? `card=${card.brand}/${card.funding}/${card.country ?? "?"}` : "",
        checks ? `cvc=${checks.cvc_check ?? "-"} zip=${checks.address_postal_code_check ?? "-"} line1=${checks.address_line1_check ?? "-"}` : "",
        card?.three_d_secure ? `3ds=${card.three_d_secure.result ?? "?"}` : "",
        c.description ? `desc="${c.description.slice(0, 40)}"` : "",
      ]
        .filter(Boolean)
        .join("  "),
    );
    if (o?.seller_message && kind !== "authorized") console.log(`      stripe says: ${o.seller_message}`);
  }

  console.log("");
  console.log("BY STATUS / OUTCOME");
  for (const [k, n] of [...tally.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
