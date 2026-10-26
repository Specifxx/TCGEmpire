import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { RETAILER_LIST } from "@/lib/retailers";
import { CONTACT_EMAIL, SITE_URL } from "@/lib/site";
import { pageAlternates } from "@/lib/seo";
import { CODE_RECHECK_DAYS } from "@/lib/store-partner-deals";

// The store partner program (DECISIONS.md, "Store partner codes: the store links
// start earning", 2026-10-26). Static: no query, a day's cache like /stores.
export const revalidate = 86400;

const TITLE = "Store Partners — Pay Only When RiftCompare Sends You a Sale";

export const metadata: Metadata = {
  title: TITLE,
  description:
    "Riftbound stores: give RiftCompare shoppers an exclusive discount code and pay a commission only on the orders we send. No monthly fee, and it never changes your place in any comparison.",
  alternates: pageAlternates("/stores/partners"),
  openGraph: {
    title: TITLE,
    description: "An exclusive code for our shoppers, a commission only on the sales we send. Free to join.",
    url: `${SITE_URL}/stores/partners`,
  },
};

const STEPS = [
  {
    title: "Make a code just for our shoppers",
    body: "Create a discount code in Shopify (or WooCommerce) that you give only to RiftCompare, for example RIFT5 for 5% off singles. Your discount report then counts every order we sent, including the ones on phones, where tracking links often get lost.",
  },
  {
    title: "Optionally, add a commission link",
    body: "If you run an affiliate app such as Shopify Collabs, UpPromote, GoAffPro or Refersion, send us the referral parameter. We add it to every link to your store, and you pay the commission you set only when a visitor buys. No app? The code alone works, and we agree a percentage of the orders it shows.",
  },
  {
    title: "We show it beside your prices",
    body: "Your code appears as a chip on every one of your rows, on card pages, quick views and sealed product lists, and on your store page. Shoppers tap it to copy.",
  },
];

export default function StorePartnersPage() {
  const stores = RETAILER_LIST.length;
  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumbs
        trail={[
          { name: "Stores", href: "/stores" },
          { name: "Store partners", href: "/stores/partners" },
        ]}
      />

      <div className="card-surface overflow-hidden">
        <div className="bg-gradient-to-br from-gold/20 via-ink-850 to-brand-600/20 px-6 py-10 text-center">
          <span className="chip mb-3 inline-flex bg-gold/15 font-bold uppercase tracking-wide text-gold">Store partners · free to join</span>
          <h1 className="mx-auto max-w-xl font-display text-3xl font-extrabold text-white">
            Pay only when we send you a sale
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-300">
            RiftCompare compares Riftbound prices across {stores} stores and sends shoppers to the one they pick. Give
            those shoppers an exclusive code, and pay a commission only on the orders it brings you. No monthly fee,
            no contract.
          </p>
          <a href="#join" className="btn-primary mt-5 inline-block">How to join →</a>
        </div>
      </div>

      <p className="card-surface mt-6 border border-brand-500/30 p-4 text-sm leading-relaxed text-slate-300">
        <strong className="text-white">A partnership never changes your place in any comparison.</strong> Rows are
        sorted by item price, the same for every store, and the price we show is your price before the code. The code is
        a label beside it. A cheaper store that is not a partner still ranks above you.
      </p>

      <h2 className="mt-8 text-lg font-extrabold text-white">How it works</h2>
      <ol className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="card-surface p-4">
            <div className="text-xs font-bold text-slate-500">Step {i + 1}</div>
            <h3 className="mt-1 text-sm font-bold text-white">{s.title}</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{s.body}</p>
          </li>
        ))}
      </ol>

      <div className="card-surface mt-6 p-5 text-sm leading-relaxed text-slate-400">
        <h2 className="font-bold text-white">See what we already send you</h2>
        <p className="mt-2">
          Every link from RiftCompare to your store carries <code className="rounded bg-ink-800 px-1 text-xs">utm_source=riftcompare</code>.
          Open your analytics (in Shopify: Analytics → Reports → Sessions by referrer, or filter by UTM source) to see
          the visitors and orders we sent last month before you decide.
        </p>
        <h2 className="mt-5 font-bold text-white">Codes that always work</h2>
        <p className="mt-2">
          Coupon sites are full of codes that fail at checkout. Ours come from you, and we re-check each one at your
          checkout at least every {CODE_RECHECK_DAYS} days. A code that hasn&apos;t been checked in that time disappears
          from the site on its own until it is, so shoppers never see a dead one next to your name.
        </p>
        <h2 className="mt-5 font-bold text-white">Want more?</h2>
        <p className="mt-2">
          The <Link href="/stores" className="text-brand-400 hover:underline">Stores plan</Link> adds a daily repricing
          report against every competitor we track and what buyers search for in your market. You can be a partner
          without it.
        </p>
      </div>

      <section id="join" className="card-surface mt-6 scroll-mt-header p-6 text-center">
        <h2 className="font-bold text-white">Join</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-slate-400">
          Email us from your store&apos;s address with your code, what it gives, any end date, and your affiliate app&apos;s
          referral link if you have one. We test the code at your checkout and it goes live with the next daily update.
        </p>
        <p className="mt-4 select-all font-mono text-sm text-white">{CONTACT_EMAIL}</p>
        <a
          href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Store partner code")}`}
          className="btn-primary mt-3 inline-block"
        >
          Email us →
        </a>
        <p className="mt-4 text-xs text-slate-500">
          Not tracked yet? <Link href="/stores/suggest" className="text-brand-400 hover:underline">Suggest your store</Link> first.
        </p>
      </section>
    </div>
  );
}
