import type { Metadata } from "next";
import { CONTACT_EMAIL } from "@/lib/site";

// (No force-dynamic: this is pure static content — the old export was
// gratuitous and opted the page out of caching for nothing.)

// Standalone buylist page — "Sell us your cards". Deliberately NOT linked from any
// nav/menu; reachable by direct URL only (like /marketplace).
export const metadata: Metadata = {
  title: "Sell Us Your Riftbound Cards — Buylist",
  description:
    "Sell your Riftbound singles and sealed product directly to RiftCompare. Send us your list, get a quote, post your cards, get paid.",
  robots: { index: false, follow: false },
};

// Placeholder buylist mailing address — swap for the real one before going live.
const BUYLIST_ADDRESS = [
  "RiftCompare Buylist",
  "PO Box 0000",
  "Melbourne VIC 3000",
  "Australia",
];

const STEPS: { title: string; body: string }[] = [
  {
    title: "1. Send us your list",
    body:
      "Email us the cards you want to sell — card name, set, condition (NM / LP / MP / HP), and whether each is foil/promo. A photo of the cards (or a screenshot of your list) speeds things up.",
  },
  {
    title: "2. Get a quote",
    body:
      "We benchmark every card against live RiftCompare market prices and reply with a firm offer — paid in cash (bank transfer) or store credit (more credit than cash). Quotes are held for 7 days.",
  },
  {
    title: "3. Post your cards",
    body:
      "Accept the quote and post the cards to our buylist address below. Use a tracked/insured service for anything over $50 — keep your tracking number until payment lands.",
  },
  {
    title: "4. Get paid",
    body:
      "We inspect on arrival (usually within 2 business days) and pay out the agreed amount the same day. If a card grades lower than described we'll contact you first — never adjust silently.",
  },
];

const CONDITIONS: { grade: string; label: string; note: string }[] = [
  { grade: "NM", label: "Near Mint", note: "Pack-fresh; minimal to no wear, sharp corners, clean surface." },
  { grade: "LP", label: "Lightly Played", note: "Minor edge/corner wear or light scuffing; tournament-legal in sleeves." },
  { grade: "MP", label: "Moderately Played", note: "Noticeable wear, scratches or whitening, still no creases/tears." },
  { grade: "HP", label: "Heavily Played", note: "Heavy wear, creasing, or surface damage. Bought at reduced rates." },
];

function mailto(subject: string) {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

export default function SellCardsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      {/* Hero */}
      <div className="card-surface overflow-hidden">
        <div className="relative border-l-2 border-brand-500 bg-ink-900 px-6 py-10 text-center">
          <h1 className="font-display text-3xl font-extrabold text-white">Sell us your cards</h1>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-slate-300">
            Clearing out a collection or off-loading spares? Sell your Riftbound singles and sealed
            product straight to RiftCompare. We pay fair, market-based rates — in cash or store credit —
            and make the whole thing painless.
          </p>
          <a href={mailto("Buylist — cards I'd like to sell")} className="btn-primary mt-6 inline-flex text-base">
            Email your list to get a quote
          </a>
          <p className="mt-3 text-xs text-slate-500">No account needed. Quotes are obligation-free.</p>
        </div>
      </div>

      {/* How it works */}
      <section className="mt-6">
        <h2 className="font-display text-xl font-bold text-white">How it works</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {STEPS.map((s) => (
            <div key={s.title} className="card-surface p-4">
              <h3 className="text-sm font-bold text-brand-300">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* What we buy */}
      <section className="mt-6">
        <h2 className="font-display text-xl font-bold text-white">What we buy</h2>
        <div className="card-surface mt-3 p-5">
          <ul className="space-y-2 text-sm leading-relaxed text-slate-300">
            <li className="flex gap-2"><span className="text-brand-400">✓</span> Riftbound singles — commons through to mythics, foils, promos and alt-arts.</li>
            <li className="flex gap-2"><span className="text-brand-400">✓</span> Sealed product — booster boxes, packs, starter/precon decks and bundles.</li>
            <li className="flex gap-2"><span className="text-brand-400">✓</span> Bulk lots — got a shoebox of commons? We take bulk by the hundred.</li>
            <li className="flex gap-2"><span className="text-slate-600">✗</span> Heavily damaged, water-marked or counterfeit cards. If in doubt, send a photo and ask.</li>
          </ul>
          <p className="mt-4 text-xs text-slate-500">
            We base offers on live RiftCompare market data, so you can sanity-check any quote against the
            same prices you see across the site.
          </p>
        </div>
      </section>

      {/* Condition guide */}
      <section className="mt-6">
        <h2 className="font-display text-xl font-bold text-white">Condition guide</h2>
        <div className="card-surface mt-3 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-ink-900/60 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Grade</th>
                <th className="px-4 py-2.5 font-semibold">Condition</th>
                <th className="px-4 py-2.5 font-semibold">What it means</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {CONDITIONS.map((c) => (
                <tr key={c.grade}>
                  <td className="px-4 py-3 font-bold text-brand-300">{c.grade}</td>
                  <td className="px-4 py-3 font-medium text-white">{c.label}</td>
                  <td className="px-4 py-3 text-slate-400">{c.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Grade honestly — we re-check every card on arrival. Accurate descriptions get the fastest payouts.
        </p>
      </section>

      {/* Where to send */}
      <section className="mt-6">
        <h2 className="font-display text-xl font-bold text-white">Where to send your cards</h2>
        <div className="card-surface mt-3 p-5">
          <p className="text-sm text-slate-300">
            Once your quote is accepted, post your cards (sleeved, in a top-loader or rigid mailer) to:
          </p>
          <address className="mt-3 rounded-lg border border-ink-700 bg-ink-900/50 p-4 not-italic text-sm leading-relaxed text-white">
            {BUYLIST_ADDRESS.map((line, i) => (
              <div key={i} className={i === 0 ? "font-bold" : ""}>{line}</div>
            ))}
          </address>
          <ul className="mt-4 space-y-1.5 text-xs text-slate-500">
            <li>• Include a slip with your name, email and the quote reference so we can match your parcel.</li>
            <li>• Use tracked &amp; insured post for anything over $50 — keep proof of postage until you&apos;re paid.</li>
            <li>• Don&apos;t send before you have a confirmed quote — unsolicited parcels can&apos;t be guaranteed.</li>
          </ul>
          <p className="mt-4 text-xs text-amber-400/80">
            Placeholder address — confirm the current buylist address in your quote email before posting.
          </p>
        </div>
      </section>

      {/* CTA footer */}
      <div className="mt-6 card-surface p-6 text-center">
        <h2 className="font-display text-lg font-bold text-white">Ready to sell?</h2>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-400">
          Send through your list and we&apos;ll get a quote back to you, usually within a day.
        </p>
        <a href={mailto("Buylist — cards I'd like to sell")} className="btn-primary mt-4 inline-flex">
          Email {CONTACT_EMAIL}
        </a>
      </div>
    </div>
  );
}
