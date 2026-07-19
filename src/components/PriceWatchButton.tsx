"use client";

// Replaces the old wishlist heart — a direct "watch this card's price" action.
// No client-side state to track (there's no wishlist to be a member of
// anymore): every click just (re)confirms the watch by dispatching the same
// event PriceAlertModal already listens for, carrying this one card's id.
export function PriceWatchButton({
  cardId,
  variant = "icon",
}: {
  cardId: string;
  variant?: "icon" | "full";
}) {
  function click(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent("price-alert-prompt", { detail: { cardId } }));
  }

  const bell = (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  if (variant === "full") {
    return (
      <button onClick={click} className="btn bg-ink-800 text-slate-200 hover:bg-ink-700">
        {bell}
        Watch price
      </button>
    );
  }

  return (
    <button
      onClick={click}
      aria-label="Watch this card's price"
      title="Get an email when the price drops"
      className="grid h-8 w-8 place-items-center rounded-full border border-ink-600 bg-ink-950/80 text-slate-300 transition-colors hover:border-gold/50 hover:text-gold"
    >
      {bell}
    </button>
  );
}
