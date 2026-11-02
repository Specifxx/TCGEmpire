import { prisma } from "@/lib/db";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { alertLabel, badLink, hidden, page, type ListedAlert } from "@/lib/sister-alerts/pages";

export const dynamic = "force-dynamic";

// Manage / stop sister-site alerts, addressed by the token in every alert
// email. GET lists the address's alerts (and, with ?stop=<id|all>, asks to
// confirm that one action); only a POST from the page's buttons deletes.

const select = { id: true, site: true, productId: true, region: true, targetCents: true, name: true, path: true } as const;

async function render(token: string, email: string, note = "", stop = "") {
  const alerts: ListedAlert[] = await prisma.sisterAlert.findMany({ where: { email }, select, orderBy: { createdAt: "desc" }, take: 100 });
  const ask =
    stop === "all" && alerts.length
      ? `<form method="post">${hidden("t", token)}${hidden("stop", "all")}<p><strong>Stop every price alert for this address?</strong></p><button type="submit">Yes, stop them all</button></form>`
      : stop && alerts.some((a) => a.id === stop)
        ? `<form method="post">${hidden("t", token)}${hidden("stop", stop)}<p><strong>Stop this alert?</strong> ${alertLabel(alerts.find((a) => a.id === stop)!)}</p><button type="submit">Yes, stop it</button></form>`
        : "";
  const list = alerts.length
    ? `<ul>${alerts.map((a) => `<li><span>${alertLabel(a)}</span><form method="post">${hidden("t", token)}${hidden("stop", a.id)}<button class="ghost" type="submit">Stop</button></form></li>`).join("")}</ul>${alerts.length > 1 ? `<form method="post">${hidden("t", token)}${hidden("stop", "all")}<button class="ghost" type="submit">Stop all</button></form>` : ""}`
    : `<p>You have no price alerts. You can set one on any of our sites.</p>`;
  return page("Your price alerts", `${note}${ask}<h1>Your price alerts</h1>${list}`);
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const token = u.searchParams.get("t") ?? "";
  if (!token || token.length > 100) return badLink();
  const a = await prisma.sisterAlertAddress.findUnique({ where: { token }, select: { email: true } });
  if (!a) return badLink();
  return render(token, a.email, "", (u.searchParams.get("stop") ?? "").slice(0, 64));
}

export async function POST(req: Request) {
  const rl = rateLimit(`sister-alerts:manage:${clientIp(req)}`, 30, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  const form = await req.formData().catch(() => null);
  const token = String(form?.get("t") ?? "");
  const stop = String(form?.get("stop") ?? "").slice(0, 64);
  if (!token || token.length > 100) return badLink();
  const a = await prisma.sisterAlertAddress.findUnique({ where: { token }, select: { email: true } });
  if (!a) return badLink();
  if (stop === "all") await prisma.sisterAlert.deleteMany({ where: { email: a.email } });
  else if (stop) await prisma.sisterAlert.deleteMany({ where: { email: a.email, id: stop } });
  return render(token, a.email, stop ? `<p><strong>${stop === "all" ? "Every alert is stopped." : "That alert is stopped."}</strong></p>` : "");
}
