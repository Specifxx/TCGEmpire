import { prisma } from "@/lib/db";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { badLink, hidden, page } from "@/lib/sister-alerts/pages";
import { sisterSite } from "@/lib/sister-alerts/sites";
import { resolvePath } from "@/lib/sister-alerts/feed";

export const dynamic = "force-dynamic";

// Double opt-in for the sister-site alerts (lib/sister-alerts). GET shows a
// button; only its POST confirms (a mail scanner opening the link confirms
// nothing).

async function lookup(token: string) {
  if (!token || token.length > 100) return null;
  return prisma.sisterAlertAddress.findUnique({ where: { token }, select: { email: true, confirmedAt: true } });
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("t") ?? "";
  const a = await lookup(token);
  if (!a) return badLink();
  if (a.confirmedAt) return page("Price alerts confirmed", `<h1>You're already confirmed</h1><p>Your price alerts are on. We check prices once a day and email you when one hits your price.</p>`);
  return page(
    "Confirm your price alerts",
    `<h1>Confirm your price alerts</h1><p>We'll check prices every day and email you when a product reaches the price you picked. Each email has a link to stop it.</p><form method="post">${hidden("t", token)}<button type="submit">Confirm my price alerts</button></form>`,
  );
}

export async function POST(req: Request) {
  const rl = rateLimit(`sister-alerts:confirm:${clientIp(req)}`, 20, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  const form = await req.formData().catch(() => null);
  const token = String(form?.get("t") ?? "");
  const a = await lookup(token);
  if (!a) return badLink();
  if (!a.confirmedAt) await prisma.sisterAlertAddress.update({ where: { token }, data: { confirmedAt: new Date() } });
  const last = await prisma.sisterAlert.findFirst({ where: { email: a.email }, orderBy: { createdAt: "desc" }, select: { site: true, path: true, region: true } });
  const site = last ? sisterSite(last.site) : null;
  const back = site ? `<p><a href="${new URL(last?.path ? resolvePath(last.path, last.region) : "/", site.url).toString()}">Back to ${site.name}</a></p>` : "";
  return page("Price alerts confirmed", `<h1>You're all set</h1><p>Your price alerts are on. We check prices once a day and email you when one reaches your price. New alerts you set on any of our sites start straight away.</p>${back}`);
}
