import { prisma } from "@/lib/db";
import { escapeHtml } from "@/lib/email";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { alertLabel, badLink, hidden, page, type ListedAlert } from "@/lib/sister-alerts/pages";
import { sisterSite } from "@/lib/sister-alerts/sites";

export const dynamic = "force-dynamic";

// Manage / stop sister-site alerts and weekly emails, addressed by the token in
// every email. GET lists the address's alerts and weekly emails (and, with
// ?stop=<id|all|digest:site> or ?weekly=<site>, asks to confirm that one
// action); only a POST from the page's buttons changes anything.

const select = { id: true, site: true, productId: true, region: true, targetCents: true, name: true, path: true } as const;
const siteName = (key: string) => sisterSite(key)?.name ?? key;

async function render(token: string, email: string, note = "", stop = "", weekly = "") {
  const alerts: ListedAlert[] = await prisma.sisterAlert.findMany({ where: { email }, select, orderBy: { createdAt: "desc" }, take: 100 });
  const digests = await prisma.sisterDigest.findMany({ where: { email }, select: { site: true, region: true }, orderBy: { createdAt: "asc" }, take: 20 });
  const digestStop = stop.startsWith("digest:") ? stop.slice(7) : "";
  const ask =
    stop === "all" && (alerts.length || digests.length)
      ? `<form method="post">${hidden("t", token)}${hidden("stop", "all")}<p><strong>Stop every price alert and weekly email for this address?</strong></p><button type="submit">Yes, stop them all</button></form>`
      : digestStop && digests.some((d) => d.site === digestStop)
        ? `<form method="post">${hidden("t", token)}${hidden("stop", stop)}<p><strong>Stop ${escapeHtml(siteName(digestStop))}'s weekly email?</strong></p><button type="submit">Yes, stop it</button></form>`
        : stop && alerts.some((a) => a.id === stop)
          ? `<form method="post">${hidden("t", token)}${hidden("stop", stop)}<p><strong>Stop this alert?</strong> ${alertLabel(alerts.find((a) => a.id === stop)!)}</p><button type="submit">Yes, stop it</button></form>`
          : weekly && sisterSite(weekly) && !digests.some((d) => d.site === weekly)
            ? `<form method="post">${hidden("t", token)}${hidden("weekly", weekly)}<p><strong>Get ${escapeHtml(siteName(weekly))}'s biggest price drops once a week?</strong> One email a week, with a link to stop it.</p><button type="submit">Yes, send it weekly</button></form>`
            : "";
  const list = alerts.length
    ? `<ul>${alerts.map((a) => `<li><span>${alertLabel(a)}</span><form method="post">${hidden("t", token)}${hidden("stop", a.id)}<button class="ghost" type="submit">Stop</button></form></li>`).join("")}</ul>${alerts.length > 1 ? `<form method="post">${hidden("t", token)}${hidden("stop", "all")}<button class="ghost" type="submit">Stop all</button></form>` : ""}`
    : `<p>You have no price alerts. You can set one on any of our sites.</p>`;
  const weeklyList = digests.length
    ? `<h1 style="margin-top:22px">Your weekly emails</h1><ul>${digests.map((d) => `<li><span>${escapeHtml(siteName(d.site))}'s biggest price drops<br><small>${escapeHtml(d.region)} stores · once a week</small></span><form method="post">${hidden("t", token)}${hidden("stop", `digest:${d.site}`)}<button class="ghost" type="submit">Stop</button></form></li>`).join("")}</ul>`
    : "";
  return page("Your price alerts", `${note}${ask}<h1>Your price alerts</h1>${list}${weeklyList}`);
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const token = u.searchParams.get("t") ?? "";
  if (!token || token.length > 100) return badLink();
  const a = await prisma.sisterAlertAddress.findUnique({ where: { token }, select: { email: true } });
  if (!a) return badLink();
  return render(token, a.email, "", (u.searchParams.get("stop") ?? "").slice(0, 64), (u.searchParams.get("weekly") ?? "").slice(0, 32));
}

export async function POST(req: Request) {
  const rl = rateLimit(`sister-alerts:manage:${clientIp(req)}`, 30, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  const form = await req.formData().catch(() => null);
  const token = String(form?.get("t") ?? "");
  const stop = String(form?.get("stop") ?? "").slice(0, 64);
  const weekly = String(form?.get("weekly") ?? "").slice(0, 32);
  if (!token || token.length > 100) return badLink();
  const a = await prisma.sisterAlertAddress.findUnique({ where: { token }, select: { email: true } });
  if (!a) return badLink();
  let note = "";
  if (stop === "all") {
    await prisma.sisterAlert.deleteMany({ where: { email: a.email } });
    await prisma.sisterDigest.deleteMany({ where: { email: a.email } });
    note = "Every alert and weekly email is stopped.";
  } else if (stop.startsWith("digest:")) {
    await prisma.sisterDigest.deleteMany({ where: { email: a.email, site: stop.slice(7) } });
    note = "That weekly email is stopped.";
  } else if (stop) {
    await prisma.sisterAlert.deleteMany({ where: { email: a.email, id: stop } });
    note = "That alert is stopped.";
  } else if (weekly && sisterSite(weekly)) {
    // The region is the one this address last used on that site; US when it has none there.
    const last = await prisma.sisterAlert.findFirst({ where: { email: a.email, site: weekly }, orderBy: { createdAt: "desc" }, select: { region: true } });
    const region = last?.region ?? "US";
    await prisma.sisterDigest.upsert({ where: { email_site: { email: a.email, site: weekly } }, create: { email: a.email, site: weekly, region }, update: {} });
    note = `${siteName(weekly)}'s weekly email is on. The first one comes within about a week.`;
  }
  return render(token, a.email, note ? `<p><strong>${escapeHtml(note)}</strong></p>` : "");
}
