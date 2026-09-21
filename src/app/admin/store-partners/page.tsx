import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/site";
import { RETAILER_LIST } from "@/lib/retailers";
import { COUNTRIES, type Country } from "@/lib/country";
import { StorePartnerForm } from "@/components/admin/StorePartnerForm";

export const dynamic = "force-dynamic";

// Admin-only — self-noindex (robots.ts doesn't block /admin) + gated below.
export const metadata: Metadata = {
  title: "Store report links",
  robots: { index: false, follow: false },
};

// ─────────────────────────────────────────────────────────────────────────────
// THE B2B REPRICING REPORT'S MISSING FRONT DOOR.
// ─────────────────────────────────────────────────────────────────────────────
// /stores/report renders a partner store's live "where you're beaten on price"
// report from a capability token, and /api/admin/store-partners has been able to
// mint those tokens since it was written. Nothing called it. No page, no script,
// no admin tile — so in practice the report could not be given to a store
// without hand-crafting an authenticated POST.
//
// That mattered the moment store outreach became the plan's one human channel
// (docs/OUTREACH-KIT.md): the free report is the entire reason a shop owner has
// to reply to a cold email, and "ask a developer to mint you a token" is not a
// step the person sending those emails can take.
//
// THE LISTING COUNTS ARE THE POINT, not decoration. A report built on a store
// with no live listings is an empty page, and sending an empty report to a
// prospect is worse than sending nothing — so the picker shows what the price
// data actually holds for each store and the form warns before you send one.
export default async function AdminStorePartnersPage({ searchParams }: { searchParams: { key?: string } }) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const user = await getCurrentUser();
  if (!(keyOk || user?.isAdmin)) notFound(); // don't reveal the page exists

  const [partners, listingCounts] = await Promise.all([
    prisma.storePartner.findMany({ orderBy: { createdAt: "desc" }, take: 300 }),
    // One grouped aggregate rather than a count per store — 168 retailers would
    // otherwise be 168 round trips on an uncached force-dynamic page (egress
    // rule 3, src/lib/db.ts).
    prisma.retailerPrice.groupBy({ by: ["retailer"], _count: { _all: true } }),
  ]);

  const countByKey = new Map(listingCounts.map((r) => [r.retailer, r._count._all]));

  const retailers = RETAILER_LIST.map((r) => ({
    key: r.key,
    name: r.name,
    country: (r.country ?? "AU") as Country,
    listings: countByKey.get(r.key) ?? 0,
  })).sort((a, b) => b.listings - a.listings || a.name.localeCompare(b.name));

  const partnered = new Set(partners.map((p) => p.retailer));
  const dateFmt = new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeZone: "Australia/Sydney" });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-extrabold text-white">Store report links</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          A report link is a store&apos;s private view of where their prices sit against the rest of the market. It is
          the thing that gives a cold email to a shop a reason to be opened, so it is worth sending before you ask them
          for anything. The wording to send with it is in the outreach kit.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          <span className="num">{partners.length}</span> link{partners.length === 1 ? "" : "s"} created ·{" "}
          <span className="num">{retailers.length}</span> stores tracked ·{" "}
          <Link href="/admin/clicks" className="text-brand-400 hover:underline">
            outbound clicks by store
          </Link>{" "}
          shows which of them already earn from us
        </p>
      </div>

      <StorePartnerForm
        adminKey={keyOk ? searchParams.key : undefined}
        retailers={retailers.map(({ key, name, listings }) => ({ key, name, listings }))}
      />

      <section className="card-surface overflow-hidden">
        <h2 className="border-b border-ink-800 px-4 py-3 text-sm font-extrabold text-white">Links already created</h2>
        {partners.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">
            None yet. Create one above, then send it to the store with the covering email from the outreach kit.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500">
                <tr className="border-b border-ink-800">
                  <th className="px-4 py-2 font-semibold">Store</th>
                  <th className="px-4 py-2 font-semibold">Market</th>
                  <th className="px-4 py-2 font-semibold">Listings</th>
                  <th className="px-4 py-2 font-semibold">Created</th>
                  <th className="px-4 py-2 font-semibold">Report link</th>
                </tr>
              </thead>
              <tbody>
                {partners.map((p) => {
                  const info = retailers.find((r) => r.key === p.retailer);
                  return (
                    <tr key={p.id} className="border-b border-ink-900 align-top">
                      <td className="px-4 py-2 font-semibold text-white">
                        {p.name}
                        <span className="block font-mono text-[10px] font-normal text-slate-600">{p.retailer}</span>
                      </td>
                      <td className="px-4 py-2 text-slate-400">
                        {info ? `${COUNTRIES[info.country].flag} ${info.country}` : "—"}
                      </td>
                      <td className="num px-4 py-2 text-slate-400">
                        {info ? info.listings.toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-2 text-slate-500">{dateFmt.format(p.createdAt)}</td>
                      <td className="px-4 py-2">
                        <code className="break-all font-mono text-[10px] text-slate-400">
                          {`${SITE_URL}/stores/report?token=${p.token}`}
                        </code>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* The working list for the outreach cadence — one email a week means the
          question "who next?" gets asked 12 times, and the answer is always the
          biggest tracked store that has never been sent a report. */}
      <section className="card-surface overflow-hidden">
        <h2 className="border-b border-ink-800 px-4 py-3 text-sm font-extrabold text-white">
          Not contacted yet, biggest first
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <tbody>
              {retailers
                .filter((r) => !partnered.has(r.key) && r.listings > 0)
                .slice(0, 25)
                .map((r) => (
                  <tr key={r.key} className="border-b border-ink-900">
                    <td className="px-4 py-2 font-semibold text-white">{r.name}</td>
                    <td className="px-4 py-2 text-slate-400">
                      {COUNTRIES[r.country].flag} {r.country}
                    </td>
                    <td className="num px-4 py-2 text-slate-400">{r.listings.toLocaleString()} listings</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
