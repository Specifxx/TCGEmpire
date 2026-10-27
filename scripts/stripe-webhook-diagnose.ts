/**
 * Why are Stripe events failing to reach the site? Read-only unless HEAL=1.
 *
 * The ops monitor's "Stripe webhook" check counts events Stripe has not
 * delivered (`delivery_success=false`: still retrying or given up). This prints
 * what it would take a person in the Stripe Dashboard to see:
 *
 *   1. every webhook endpoint on the account: URL, status, API version, and
 *      whether it is subscribed to the events lib/../webhook/route.ts needs;
 *   2. what each endpoint URL answers to an unsigned POST, WITHOUT following
 *      redirects (Stripe never follows one: a 301/308 is a failed delivery).
 *      A healthy endpoint answers 400 "Missing signature"; 503 means
 *      STRIPE_WEBHOOK_SECRET is unset in Vercel; 404 a wrong path;
 *   3. the undelivered events of the last few days: type and age, and for a
 *      subscription event whether the paying account has its Pro.
 *
 * The repository is public, so the log carries NO email, name, customer id or
 * amount: event ids, types, statuses and yes/no only. HEAL=1 runs the same
 * extend-only reconcile as the daily cron and prints counts.
 */
import { prisma } from "../src/lib/db";
import { stripe, stripeEnabled } from "../src/lib/stripe";
import { runStripeReconcile } from "../src/lib/stripe-reconcile";
import { entitledUntilFromSubscription, subscriptionIdFromInvoice, userIdFromSubscription, customerIdOf } from "../src/lib/stripe-entitlement";

const KEY = process.env.STRIPE_SECRET_KEY ?? "";
const DAYS = Number(process.env.DAYS || 4);
const NEEDED = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "invoice.paid",
  "invoice.payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
];

async function api<T>(path: string): Promise<T> {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`Stripe ${path.split("?")[0]} answered ${r.status}`);
  return (await r.json()) as T;
}

type Endpoint = { url: string; status: string; api_version: string | null; enabled_events: string[]; livemode: boolean; created: number };
type Ev = { id: string; type: string; created: number; pending_webhooks: number; livemode: boolean; data: { object: Record<string, unknown> } };

async function main() {
  if (!stripeEnabled()) throw new Error("STRIPE_SECRET_KEY is not set");
  console.log(`Key mode: ${KEY.startsWith("sk_live") || KEY.startsWith("rk_live") ? "live" : "test"}\n`);

  const eps = (await api<{ data: Endpoint[] }>("webhook_endpoints?limit=50")).data;
  console.log(`== ${eps.length} webhook endpoint(s)`);
  for (const e of eps) {
    const all = e.enabled_events.includes("*");
    const missing = all ? [] : NEEDED.filter((n) => !e.enabled_events.includes(n));
    console.log(`- ${e.url}`);
    console.log(`    status ${e.status}, api_version ${e.api_version ?? "account default"}, created ${new Date(e.created * 1000).toISOString().slice(0, 10)}`);
    console.log(`    events: ${all ? "all (*)" : e.enabled_events.join(", ")}`);
    if (missing.length) console.log(`    MISSING: ${missing.join(", ")}`);
    try {
      const r = await fetch(e.url, { method: "POST", body: "{}", headers: { "content-type": "application/json" }, redirect: "manual" });
      const loc = r.headers.get("location");
      const body = (await r.text()).slice(0, 120).replace(/\s+/g, " ");
      console.log(`    unsigned POST → ${r.status}${loc ? ` redirect to ${loc}` : ""} ${body}`);
    } catch (err) {
      console.log(`    unsigned POST → network error: ${err instanceof Error ? err.message : err}`);
    }
  }

  const since = Math.floor(Date.now() / 1000) - DAYS * 86400;
  const failed: Ev[] = [];
  let after = "";
  for (let i = 0; i < 5; i++) {
    const page = await api<{ data: Ev[]; has_more: boolean }>(`events?delivery_success=false&limit=100&created[gte]=${since}${after}`);
    failed.push(...page.data);
    if (!page.has_more || !page.data.length) break;
    after = `&starting_after=${page.data[page.data.length - 1].id}`;
  }
  const total = (await api<{ data: Ev[] }>(`events?limit=100&created[gte]=${since}`)).data.length;
  console.log(`\n== Undelivered events in the last ${DAYS} days: ${failed.length} (of ${total}${total === 100 ? "+" : ""} events)`);
  const byType = new Map<string, number>();
  for (const e of failed) byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
  for (const [t, n] of byType) console.log(`  ${n} × ${t}`);

  console.log("");
  for (const e of failed) {
    const age = ((Date.now() / 1000 - e.created) / 3600).toFixed(1);
    let note = "";
    const obj = e.data.object;
    let subId: string | null = null;
    if (e.type.startsWith("customer.subscription.")) subId = String(obj.id);
    else if (e.type.startsWith("invoice.")) subId = subscriptionIdFromInvoice(obj);
    else if (e.type.startsWith("checkout.session.")) subId = typeof obj.subscription === "string" ? obj.subscription : null;
    if (subId) {
      try {
        const sub = await stripe().subscriptions.retrieve(subId);
        const until = entitledUntilFromSubscription(sub);
        let userId = userIdFromSubscription(sub) ?? (typeof obj.metadata === "object" && obj.metadata ? ((obj.metadata as Record<string, string>).userId ?? null) : null);
        const cust = customerIdOf(sub);
        if (!userId && cust) userId = (await prisma.user.findFirst({ where: { stripeCustomerId: cust }, select: { id: true } }))?.id ?? null;
        const u = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { premiumUntil: true } }) : null;
        const covered = until && u?.premiumUntil ? u.premiumUntil >= new Date(until.getTime() - 60_000) : false;
        note = ` sub status ${sub.status}; account ${u ? "found" : "NOT FOUND"}; ${until ? (covered ? "Pro covers the paid period" : "PRO MISSING for a paid period") : "not entitled (nothing owed)"}`;
      } catch (err) {
        note = ` (could not check: ${err instanceof Error ? err.message.slice(0, 80) : "error"})`;
      }
    }
    console.log(`- ${e.id} ${e.type}, ${age}h ago, still pending to ${e.pending_webhooks} endpoint(s), ${e.livemode ? "live" : "test"}.${note}`);
  }

  if (process.env.HEAL === "1") {
    // The reconcile logs each healed account's email; keep those out of this public log.
    const [log, err] = [console.log, console.error];
    console.log = console.error = () => {};
    const s = await runStripeReconcile({ notify: false }).finally(() => {
      console.log = log;
      console.error = err;
    });
    console.log(`\n== Reconcile: ok=${s.ok} checked=${s.checked} extended=${s.extended.length} linked=${s.customersLinked} unmatched=${s.unmatched.length}${s.error ? ` error=${s.error}` : ""}`);
  }
}

main()
  .catch((e) => {
    console.error(`::error::${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
