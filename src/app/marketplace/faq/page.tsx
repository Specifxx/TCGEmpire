import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, SITE_NAME, SITE_URL } from "@/lib/site";
import {
  MARKETPLACE_FEE_BPS,
  MARKETPLACE_PREMIUM_FEE_BPS,
  MARKETPLACE_SHIP_DEADLINE_DAYS,
  MARKETPLACE_AUTO_RELEASE_DAYS,
  MARKETPLACE_LAUNCH_COUNTRIES,
} from "@/lib/marketplace";

export const metadata: Metadata = {
  title: "Marketplace FAQ",
  description: `Answers to common questions about buying and selling on ${SITE_NAME} Marketplace — fees, buyer protection, shipping, payouts and trust.`,
  alternates: { canonical: "/marketplace/faq" },
};

const FEE_PCT = (MARKETPLACE_FEE_BPS / 100).toFixed(0);
const PREMIUM_FEE_PCT = (MARKETPLACE_PREMIUM_FEE_BPS / 100).toFixed(0);

interface Faq { q: string; a: React.ReactNode }
interface FaqGroup { title: string; items: Faq[] }

// Plain-text mirror of every answer below, for the FAQPage JSON-LD (which needs
// a string, not JSX) — kept next to the rendered copy so the two can't drift far
// apart; duplication here is intentional (structured data can't hold links/lists).
const FAQ_GROUPS: FaqGroup[] = [
  {
    title: "General",
    items: [
      {
        q: `What is ${SITE_NAME} Marketplace?`,
        a: (
          <>
            It&apos;s a peer-to-peer marketplace for buying and selling individual Riftbound cards directly with other
            collectors — like eBay or Cardmarket, but built specifically for this game, and integrated with the same
            price data and card database you already use on RiftCompare. Every listing is created by a real seller;{" "}
            {SITE_NAME} handles payment, escrow, tracking and dispute support so neither side has to trust the other blind.
          </>
        ),
      },
      {
        q: "Is it safe to buy and sell here?",
        a: (
          <>
            Yes. Every payment is held by {SITE_NAME} (via Stripe) until you confirm your order arrived — the seller is
            never paid upfront. See <Link href="/marketplace/buyer-protection" className="text-brand-400 hover:underline">Buyer Protection</Link>{" "}
            below for the exact mechanics. Sellers also verify their identity through Stripe to get set up for payouts,
            and new sellers start under listing limits until they&apos;ve built a track record (see below).
          </>
        ),
      },
      {
        q: "The Marketplace is new — why aren't there many listings yet?",
        a: (
          <>
            It launched recently, so yes — it&apos;s early, and you&apos;ll see fewer listings than an established site
            like eBay or Cardmarket. That grows as more collectors list their spare cards; every listing you see is a
            real seller, not a placeholder. If you&apos;re after a specific card and it&apos;s not listed yet, the main{" "}
            <Link href="/browse" className="text-brand-400 hover:underline">price comparison</Link> across stores still
            covers the full catalogue in the meantime.
          </>
        ),
      },
      {
        q: "Do I need a Premium subscription to buy or sell?",
        a: (
          <>
            No — anyone with a free account can buy or sell. <Link href="/premium" className="text-brand-400 hover:underline">Premium</Link>{" "}
            just lowers a seller&apos;s platform fee to {PREMIUM_FEE_PCT}% (from {FEE_PCT}%) on top of its other tools —
            it&apos;s a discount, not a requirement.
          </>
        ),
      },
      {
        q: "Which countries can I buy or sell in?",
        a: (
          <>
            The Marketplace currently operates in {MARKETPLACE_LAUNCH_COUNTRIES.join(", ")}. Listings are visible and
            purchasable only within a single seller&apos;s own market, so a buyer in one of these countries can only buy
            from a seller shipping within that same country — no cross-border customs or currency conversion to worry
            about. Cross-border listings are planned for later.
          </>
        ),
      },
    ],
  },
  {
    title: "Buying & buyer protection",
    items: [
      {
        q: "How does buyer protection work?",
        a: (
          <>
            You pay by card at checkout, and that payment is held by {SITE_NAME}, not sent straight to the seller. The
            seller has {MARKETPLACE_SHIP_DEADLINE_DAYS} days to ship and enter tracking, or your order auto-cancels and
            refunds in full. Once it arrives, confirming delivery in{" "}
            <Link href="/marketplace/orders" className="text-brand-400 hover:underline">My orders</Link> releases the
            seller&apos;s payout. If you never confirm, it auto-releases {MARKETPLACE_AUTO_RELEASE_DAYS} days after
            shipping — reporting a problem before then pauses that release instantly. Full detail on the{" "}
            <Link href="/marketplace/buyer-protection" className="text-brand-400 hover:underline">Buyer Protection</Link> page.
          </>
        ),
      },
      {
        q: "What if my order never arrives, or isn't as described?",
        a: (
          <>
            Use the <strong className="text-white">Report a problem</strong> button on the order (or{" "}
            <Link href="/support" className="text-brand-400 hover:underline">open a support ticket</Link>) — this
            immediately pauses any automatic payout so nothing releases while we look into it, and our team can refund
            you from the held balance where the claim is valid. Covered cases: the item never arrives, it&apos;s
            significantly not as described (wrong card, condition or foil status), or it arrives damaged from
            inadequate packaging.
          </>
        ),
      },
      {
        q: "Can I cancel an order, or get a refund if I change my mind?",
        a: (
          <>
            Either you or the seller can request to cancel an order that hasn&apos;t been marked delivered yet — the
            other side just accepts it in <Link href="/marketplace/orders" className="text-brand-400 hover:underline">My orders</Link>,
            and you&apos;re refunded in full immediately. Once you&apos;ve confirmed delivery and released funds,
            buyer&apos;s remorse alone isn&apos;t covered — that&apos;s the same line eBay and Cardmarket draw.
          </>
        ),
      },
      {
        q: "What do the condition grades (NM, LP, MP, HP, DMG) mean?",
        a: "Standard TCG grading: NM (Near Mint) is straight from a pack or as good as it, LP (Lightly Played) has minor wear, MP (Moderately Played) has noticeable wear, HP (Heavily Played) is well-worn but intact, and DMG (Damaged) has creases, tears or water damage. Every listing states its grade and foil status up front.",
      },
      {
        q: "Can I buy from a seller in another country?",
        a: "Not yet — you can only buy from sellers shipping within your own market, so purchases stay same-country (no customs, import fees, or long-haul postage). Cross-border buying is a planned future update.",
      },
    ],
  },
  {
    title: "Selling",
    items: [
      {
        q: "How do I start selling?",
        a: (
          <>
            Open your <Link href="/marketplace/sell" className="text-brand-400 hover:underline">seller dashboard</Link>,
            set up payouts through Stripe (this also verifies your identity), and list a card with its price, quantity,
            condition and foil status. Your listing goes live immediately once payouts are enabled.
          </>
        ),
      },
      {
        q: "What are the fees?",
        a: (
          <>
            {SITE_NAME} takes a {FEE_PCT}% platform fee on the item price of each completed sale, deducted from your
            payout — buyers never see an added fee at checkout, and there&apos;s no listing fee. Sellers with an active{" "}
            <Link href="/premium" className="text-brand-400 hover:underline">Premium</Link> subscription pay a reduced{" "}
            {PREMIUM_FEE_PCT}% instead, applied automatically to every sale from the moment you subscribe. Stripe&apos;s
            own payment-processing fees are absorbed by {SITE_NAME}, not deducted again from you.
          </>
        ),
      },
      {
        q: "Is there a limit on how many cards I can list?",
        a: (
          <>
            No — you can list as much inventory as you like, at any value, from your very first day. There&apos;s no
            listing fee and no cap on the number of active listings or their combined value. Buyers stay protected by
            escrow (funds are only released to the seller once delivery is confirmed), the {MARKETPLACE_SHIP_DEADLINE_DAYS}
            -day shipping deadline and {SITE_NAME} buyer protection.
          </>
        ),
      },
      {
        q: "How and when do I get paid?",
        a: (
          <>
            Once a buyer confirms delivery (or the {MARKETPLACE_AUTO_RELEASE_DAYS}-day auto-release passes with no
            reported problem), your payout is released to your connected Stripe account and paid out to your bank on
            Stripe&apos;s normal schedule. {SITE_NAME} never holds your funds in its own account — Stripe is the
            custodian throughout. Track everything, including pending and paid-out balances, in{" "}
            <Link href="/marketplace/funds" className="text-brand-400 hover:underline">Seller Funds</Link>.
          </>
        ),
      },
      {
        q: "What's my shipping deadline, and what happens if I miss it?",
        a: (
          <>
            You must mark an order shipped with valid tracking within {MARKETPLACE_SHIP_DEADLINE_DAYS} days of payment.
            Miss it, and the order auto-cancels with a full refund to the buyer — so it&apos;s worth shipping promptly.
            See <Link href="/marketplace/shipping" className="text-brand-400 hover:underline">Shipping &amp; Tracking</Link>{" "}
            for packaging expectations and supported carriers.
          </>
        ),
      },
      {
        q: "What if a buyer disputes my sale, or their bank does a chargeback?",
        a: (
          <>
            Either side can open a support ticket or report a problem on the order — this pauses any automatic release
            until our team reviews it. If a chargeback lands after your payout has already released, {SITE_NAME} bears
            that loss rather than clawing back your payout at launch (repeated chargebacks against one seller can still
            lead to suspension). Full detail in the{" "}
            <Link href="/marketplace/terms" className="text-brand-400 hover:underline">Marketplace Terms</Link>.
          </>
        ),
      },
    ],
  },
  {
    title: "Trust & reviews",
    items: [
      {
        q: "How do seller reviews work?",
        a: "Buyers can leave a star rating and comment once an order ships, visible on the seller's shop page. Reviews should reflect genuine transactions — fake or coerced reviews can be removed and may lead to suspension.",
      },
      {
        q: "How is this different from eBay or Cardmarket?",
        a: (
          <>
            It&apos;s built specifically for Riftbound and lives right next to the price comparison you&apos;re already
            using — list a card and it&apos;s instantly comparable against every store price for the same card. The{" "}
            {FEE_PCT}% fee ({PREMIUM_FEE_PCT}% for Premium sellers) undercuts most general marketplaces&apos; seller
            fees, and buyer protection works the same way: your payment is held until you confirm delivery, not sent
            straight to the seller.
          </>
        ),
      },
    ],
  },
];

// Structured-data mirror of the JSX answers above (plain text, links/formatting
// stripped) — FAQPage schema requires a text-only "text" field per answer.
const FAQ_LD_ANSWERS: Record<string, string> = {
  [`What is ${SITE_NAME} Marketplace?`]:
    "It's a peer-to-peer marketplace for buying and selling individual Riftbound cards directly with other collectors. Every listing is created by a real seller; RiftCompare handles payment, escrow, tracking and dispute support.",
  "Is it safe to buy and sell here?":
    "Yes. Every payment is held by RiftCompare via Stripe until the buyer confirms the order arrived — the seller is never paid upfront. Sellers also verify their identity through Stripe, and new sellers start under listing limits until they've built a track record.",
  "The Marketplace is new — why aren't there many listings yet?":
    "It launched recently, so it's early and has fewer listings than an established marketplace. Every listing is a real seller, not a placeholder, and coverage grows as more collectors list their cards.",
  "Do I need a Premium subscription to buy or sell?":
    `No — anyone with a free account can buy or sell. Premium lowers a seller's platform fee to ${PREMIUM_FEE_PCT}% from ${FEE_PCT}%, on top of its other tools.`,
  "Which countries can I buy or sell in?":
    `The Marketplace currently operates in ${MARKETPLACE_LAUNCH_COUNTRIES.join(", ")}. A buyer can only buy from a seller shipping within the same country. Cross-border listings are planned for later.`,
  "How does buyer protection work?":
    `Payment is held until delivery is confirmed. The seller has ${MARKETPLACE_SHIP_DEADLINE_DAYS} days to ship and add tracking or the order auto-cancels and refunds. Funds release on delivery confirmation, or automatically ${MARKETPLACE_AUTO_RELEASE_DAYS} days after shipping if the buyer never confirms.`,
  "What if my order never arrives, or isn't as described?":
    "Report a problem on the order to pause any automatic payout while support reviews it. Covered cases include the item never arriving, being significantly not as described, or arriving damaged from inadequate packaging.",
  "Can I cancel an order, or get a refund if I change my mind?":
    "Either party can request to cancel an order that hasn't been marked delivered, refunding the buyer in full once accepted. After delivery is confirmed and funds released, buyer's remorse alone isn't covered.",
  "What do the condition grades (NM, LP, MP, HP, DMG) mean?":
    "NM (Near Mint) is pack-fresh condition, LP (Lightly Played) has minor wear, MP (Moderately Played) has noticeable wear, HP (Heavily Played) is well-worn but intact, and DMG (Damaged) has creases, tears or water damage.",
  "Can I buy from a seller in another country?":
    "Not yet — purchases are limited to sellers in your own market. Cross-border buying is a planned future update.",
  "How do I start selling?":
    "Open your seller dashboard, set up payouts through Stripe (which also verifies your identity), and list a card with its price, quantity, condition and foil status.",
  "What are the fees?":
    `RiftCompare takes a ${FEE_PCT}% platform fee on the item price of each completed sale, deducted from the seller's payout with no added buyer fee and no listing fee. Premium sellers pay ${PREMIUM_FEE_PCT}% instead.`,
  "Is there a limit on how many cards I can list?":
    `No — sellers can list unlimited inventory at any value from day one, with no listing fee and no cap on active listings or their combined value. Buyers are protected by escrow, the ${MARKETPLACE_SHIP_DEADLINE_DAYS}-day shipping deadline and buyer protection instead.`,
  "How and when do I get paid?":
    `Once a buyer confirms delivery, or ${MARKETPLACE_AUTO_RELEASE_DAYS} days pass with no reported problem, the payout releases to the seller's connected Stripe account and pays out on Stripe's normal schedule.`,
  "What's my shipping deadline, and what happens if I miss it?":
    `Sellers must mark an order shipped with valid tracking within ${MARKETPLACE_SHIP_DEADLINE_DAYS} days of payment, or the order auto-cancels with a full refund to the buyer.`,
  "What if a buyer disputes my sale, or their bank does a chargeback?":
    "Either party can report a problem to pause any automatic release while support reviews it. If a chargeback arrives after payout has already released, RiftCompare bears that loss rather than clawing back the seller's payout at launch.",
  "How do seller reviews work?":
    "Buyers can leave a star rating and comment once an order ships. Reviews should reflect genuine transactions.",
  "How is this different from eBay or Cardmarket?":
    `It's built specifically for Riftbound alongside the site's price comparison. The ${FEE_PCT}% fee (${PREMIUM_FEE_PCT}% for Premium sellers) undercuts most general marketplaces, and buyer protection holds payment until delivery is confirmed.`,
};

export default function MarketplaceFaqPage() {
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_GROUPS.flatMap((g) => g.items).map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: FAQ_LD_ANSWERS[f.q] ?? "" },
    })),
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Marketplace", item: `${SITE_URL}/marketplace` },
      { "@type": "ListItem", position: 3, name: "FAQ", item: `${SITE_URL}/marketplace/faq` },
    ],
  };

  return (
    <article className="mx-auto max-w-3xl">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([faqLd, breadcrumbLd]) }} />

      <nav className="mb-3 flex items-center gap-1.5 text-xs text-slate-500" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-slate-300">Home</Link>
        <span>/</span>
        <Link href="/marketplace" className="hover:text-slate-300">Marketplace</Link>
        <span>/</span>
        <span className="text-slate-300">FAQ</span>
      </nav>

      <h1 className="text-3xl font-extrabold leading-tight text-white">❓ Marketplace FAQ</h1>
      <p className="mt-2 text-sm text-slate-500">
        Everything about buying and selling on {SITE_NAME} Marketplace — fees, buyer protection, shipping and payouts.
      </p>

      <div className="mt-6 space-y-8 border-t border-ink-800 pt-6">
        {FAQ_GROUPS.map((group) => (
          <section key={group.title}>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-400">{group.title}</h2>
            <div className="card-surface divide-y divide-ink-800 overflow-hidden">
              {group.items.map((f) => (
                <details key={f.q} className="group px-5 py-3.5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-slate-200 hover:text-white">
                    {f.q}
                    <span className="shrink-0 text-slate-500 transition-transform group-open:rotate-180" aria-hidden>▾</span>
                  </summary>
                  <div className="mt-3 text-sm leading-relaxed text-slate-400">{f.a}</div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="mt-8 border-t border-ink-800 pt-6 text-sm leading-relaxed text-slate-300">
        Didn&apos;t find your answer? The full legal terms are in our{" "}
        <Link href="/marketplace/terms" className="text-brand-400 hover:underline">Marketplace Terms</Link>, or reach us
        directly via <Link href="/support" className="text-brand-400 hover:underline">Support</Link> or{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="text-gold hover:underline">{CONTACT_EMAIL}</a>.
      </p>
    </article>
  );
}
