// "What you get without an account, and what an account adds" — the signed-out
// nudge's whole pitch, in four rows.
//
// WHY THIS EXISTS (2026-09-16, owner's call reversing the 2026-09-04 one): the
// signed-out popup had been pitching Premium, on the reasoning that a visitor
// who arrived wanting the pro tools shouldn't have to survive a later nudge to
// hear about it. In practice, asking a stranger to buy before they have an
// account put the paid ask first for an audience that has not yet had a reason
// to come back. So the signed-out surface sells the FREE account again, and
// Premium waits for PremiumSlideIn, which only ever fires once someone is
// signed in and has browsed a little.
//
// WHY A COMPARISON RATHER THAN A FEATURE LIST: a bare list of three perks reads
// as "here are some things", and does not answer the only question a signed-out
// visitor actually has, which is whether they are missing anything right now.
// The first row deliberately gives the honest answer that price comparison — the
// whole reason anyone is on this site — needs no account at all. Conceding that
// up front is what makes the three rows under it believable.
//
// FOUR ROWS, NOT SEVEN. This renders inside a corner card on a phone, where the
// previous Premium panel's taller table was what made the nudge cover most of
// the screen. Every row costs height that pushes the sign-in buttons further
// down, so the list stays at the three things an account genuinely unlocks
// (AuthForm's own PERKS, the same three /login sells) plus the free row.
//
// The perks are NOT re-listed anywhere else in the popup — AuthForm is embedded
// `bare` precisely so its own PERKS line doesn't restate these directly
// underneath, which is a mistake this dialog has made before.
//
// STILL FOUR ROWS (2026-09-23): the free account gained the top three of Deal
// Finder and Rising Cards — the most concrete thing it now unlocks, and the
// row a visitor who met either tool's lock is looking for. Watchlist and price
// alerts share a row to make room rather than growing the card on a phone.
const ROWS: { label: string; free: boolean }[] = [
  // free: true = available without an account too, so the tick appears in BOTH
  // columns. Only this row qualifies today; if that ever changes, the honest
  // framing changes with it.
  { label: "Compare prices across every store", free: true },
  { label: "Top 3 in Deal Finder & Rising Cards", free: false },
  { label: "Watchlist & price alerts by email", free: false },
  { label: "Portfolio tracking", free: false },
];

function Tick() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-brand-400" fill="none" aria-hidden>
      <path d="M3.5 8.5l3 3 6-6.5" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Cross() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3 text-slate-600" fill="none" aria-hidden>
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
    </svg>
  );
}

export function FreeAccountCompare() {
  return (
    <table className="w-full border-collapse text-[11px]">
      <caption className="sr-only">What a free RiftCompare account adds</caption>
      <thead>
        {/* Fixed 3.5rem columns, so the two headers cannot crowd each other in
            a 320px-wide card (they wrap to two short lines instead of running
            together) and every tick lands on the same two vertical lines. */}
        <tr className="text-[9px] font-bold uppercase leading-tight tracking-wider text-slate-500">
          <th scope="col" className="pb-1 text-left font-bold">
            <span className="sr-only">Feature</span>
          </th>
          <th scope="col" className="w-14 pb-1 text-center font-bold">No account</th>
          <th scope="col" className="w-14 pb-1 text-center font-bold text-brand-300">Free account</th>
        </tr>
      </thead>
      <tbody>
        {ROWS.map((r) => (
          <tr key={r.label} className="border-t border-ink-800/80">
            <td className="py-1 pr-2 text-slate-300">{r.label}</td>
            {/* The icons are aria-hidden and each cell carries its own text for
                assistive tech: a screen reader reading "tick" in a table of
                ticks conveys nothing about which column it was in. */}
            <td className="w-14 py-1">
              <span className="flex justify-center">
                {r.free ? <Tick /> : <Cross />}
                <span className="sr-only">{r.free ? "included" : "not included"}</span>
              </span>
            </td>
            <td className="w-14 py-1">
              <span className="flex justify-center">
                <Tick />
                <span className="sr-only">included</span>
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
