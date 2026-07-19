"use client";

// Some Stripe account-level errors (platform profile / loss-liability setup —
// one-time, Stripe-dashboard-only steps with no API equivalent) embed a
// dashboard URL right in the message text. Dumping that as plain red text means
// the user has to select/copy a URL out of a sentence — this turns it into a
// real button instead, so the only "external link" friction left is the click
// itself, not parsing it out of prose.
export function StripeErrorNotice({ message }: { message: string }) {
  const match = message.match(/https?:\/\/\S+/);
  const url = match ? match[0].replace(/[.,;:!?)]+$/, "") : null;

  return (
    <div className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
      <p className="text-sm text-rose-300">{message}</p>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="btn-primary mt-2 inline-flex text-xs">
          Open Stripe settings →
        </a>
      )}
    </div>
  );
}
