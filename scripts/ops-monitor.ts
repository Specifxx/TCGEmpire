/**
 * THE OPS MONITOR. Run every few hours by .github/workflows/ops-monitor.yml.
 *
 * Checks the things that quietly break a site nobody is watching (database transfer
 * limits, eBay, store prices, scheduled jobs, the live site, Stripe, email, the
 * inbox), stores the result for /admin/health, and emails the owner only when
 * something needs attention, plus a short weekly "all healthy" digest.
 *
 * WHERE IT RUNS, AND WHY. In GitHub Actions, not on Vercel: it has to keep working
 * when the database has run out of transfer or the deploy is broken, which are
 * the two ways the site actually stops. Its memory between runs is the Actions cache
 * (.ops-state/state.json), not the database it is watching.
 *
 * DELIVERY. The mail keys are Vercel settings, so by default the finished email is
 * handed to POST /api/cron/ops-notify (CRON_SECRET), which sends it to the owner. If
 * RESEND_API_KEY is also a GitHub secret the script sends directly and does not need
 * the site at all. An undeliverable URGENT alert fails the job, so GitHub's own
 * failed-run email reaches the owner as a last resort.
 *
 * A mail is recorded as delivered only after it was; one that was not is planned
 * again next run (lib/ops/state.ts).
 *
 * Env:  DATABASE_URL (+DB_SOURCE_NAME) · NEON_API_KEY · EBAY_CLIENT_ID/SECRET ·
 *       STRIPE_SECRET_KEY · CRON_SECRET · GITHUB_TOKEN · RESEND_API_KEY (optional) ·
 *       OWNER_ALERT_EMAIL (optional) · DRY_RUN=1 prints and sends nothing ·
 *       OPS_DIGEST=1 sends the weekly digest now.
 */
import fs from "node:fs";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/db";
import { withLiveData } from "../src/lib/public-data/mode";
import { sendEmail } from "../src/lib/email";
import { runChecks } from "../src/lib/ops/checks";
import { realDeps } from "../src/lib/ops/real-deps";
import { SITE } from "../src/lib/ops/deps";
import { buildAlertEmail, buildDigestEmail, type BuiltOpsEmail } from "../src/lib/ops/mail";
import { ownerEmail } from "../src/lib/ops/owner";
import { decide, digestDue, markDelivered, parseState, planIsEmpty, planIsUrgent, type OpsState } from "../src/lib/ops/state";
import { countBy, emptyInbox, type OpsReport } from "../src/lib/ops/types";

const STATE_FILE = process.env.OPS_STATE_FILE || ".ops-state/state.json";
const DRY_RUN = process.env.DRY_RUN === "1";
const FORCE_DIGEST = process.env.OPS_DIGEST === "1";

type Delivery = "sent" | "unavailable" | "failed";

async function deliver(mail: BuiltOpsEmail): Promise<Delivery> {
  if (DRY_RUN) {
    console.log(`\n[dry run] would email ${ownerEmail()}: ${mail.subject}\n${mail.text}\n`);
    return "sent";
  }
  if (process.env.RESEND_API_KEY) {
    if (await sendEmail(ownerEmail(), mail.subject, mail.html, { text: mail.text })) return "sent";
    console.warn("Direct send failed; trying the site's route.");
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("::error::Cannot deliver: neither RESEND_API_KEY nor CRON_SECRET is available to this job.");
    return "failed";
  }
  try {
    const res = await fetch(`${SITE}/api/cron/ops-notify`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ subject: mail.subject, html: mail.html, text: mail.text }),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) return "sent";
    if (res.status === 404) {
      console.warn("The site has no /api/cron/ops-notify yet (it arrives with the next release). Will retry next run.");
      return "unavailable";
    }
    console.error(`::error::The site refused the alert email: HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
    return "failed";
  } catch (e) {
    console.error(`::error::Could not reach the site to send the alert email: ${e instanceof Error ? e.message : e}`);
    return "failed";
  }
}

function loadState(): OpsState {
  try {
    return parseState(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return parseState(null);
  }
}

function saveState(state: OpsState): void {
  if (DRY_RUN) return;
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state));
}

async function main() {
  const now = new Date();
  const state = loadState();
  const deps = realDeps(state, process.env, now);

  const results = await withLiveData(() => runChecks(deps));
  const inbox = await deps.db!.inbox().catch(() => emptyInbox());
  const report: OpsReport = { version: 1, generatedAt: now.toISOString(), results, inbox };

  const counts = countBy(results);
  console.log(`Ops report: ${counts.ok} ok · ${counts.warn} warn · ${counts.crit} crit · ${counts.unknown} not checked · inbox ${inbox.total}`);
  for (const r of results) console.log(`  [${r.severity.padEnd(7)}] ${r.id.padEnd(24)} ${r.summary}`);

  if (process.env.GITHUB_STEP_SUMMARY && !DRY_RUN) {
    const md = [`### Ops report`, "", `| | Check | Result |`, `|---|---|---|`, ...results.map((r) => `| ${{ ok: "🟢", warn: "🟠", crit: "🔴", unknown: "⚪" }[r.severity]} | ${r.title} | ${r.summary.replace(/\|/g, "/")} |`)].join("\n");
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n");
  }

  // Next state: verdicts and what we have been told; Neon's project map and samples were updated in place by the checks.
  const { next, plan } = decide(state, results, now);
  next.neonProjects = deps.state.neonProjects;
  next.samples = deps.state.samples;
  let saved: OpsState = next;

  // The dashboard's copy. Best effort: the table may not exist until the release that adds it, and a database
  // that cannot take this write is already reported by the checks above.
  if (!DRY_RUN) {
    try {
      const json = report as unknown as Prisma.InputJsonValue;
      await prisma.opsSnapshot.upsert({ where: { key: "latest" }, create: { key: "latest", json }, update: { json } });
    } catch (e) {
      console.warn(`(snapshot not stored for /admin/health: ${e instanceof Error ? e.message.split("\n").pop() : e})`);
    }
  }

  let urgentUndelivered = false;
  if (!planIsEmpty(plan)) {
    const outcome = await deliver(buildAlertEmail(plan));
    if (outcome === "sent") saved = markDelivered(saved, plan, now);
    else if (planIsUrgent(plan) && outcome === "failed") urgentUndelivered = true;
    console.log(`Alert email (${plan.problems.length} new, ${plan.escalations.length} worse, ${plan.reminders.length} reminders, ${plan.recoveries.length} recovered): ${outcome}`);
  } else {
    console.log("Nothing new to tell the owner.");
  }

  // The Sunday schedule forces the digest (OPS_DIGEST=1); a skipped Sunday is caught up once the last one is
  // 6.5 days old. The very first run only starts the clock, so nothing arrives as a surprise on day one.
  if (digestDue(saved, now, FORCE_DIGEST)) {
    const outcome = await deliver(buildDigestEmail(report));
    if (outcome === "sent") saved = { ...saved, lastDigestAt: now.toISOString() };
    console.log(`Weekly digest: ${outcome}`);
  } else if (!saved.lastDigestAt) {
    saved = { ...saved, lastDigestAt: now.toISOString() };
  }

  saveState(saved);
  if (urgentUndelivered) {
    console.error("::error::An urgent alert could not be delivered. Failing this job so GitHub's own failed-run email reaches the owner.");
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error("ops-monitor failed:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect().catch(() => undefined));
