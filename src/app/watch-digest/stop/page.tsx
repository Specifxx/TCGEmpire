import type { Metadata } from "next";
import Link from "next/link";

// The "Stop this weekly email" link of the watched-cards email (lib/watch-digest.ts). One button that POSTs, so a mail
// scanner opening the link stops nothing. Price alerts are separate and keep working.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stop the weekly watched-cards email",
  robots: { index: false, follow: false },
};

export default function WatchDigestStopPage({ searchParams }: { searchParams: { t?: string; done?: string } }) {
  const t = typeof searchParams.t === "string" ? searchParams.t : "";
  const done = searchParams.done;
  return (
    <div className="mx-auto max-w-lg py-10">
      <h1 className="font-display text-2xl font-extrabold text-white">Weekly watched-cards email</h1>
      {done === "1" ? (
        <p className="mt-3 text-slate-300">Stopped. You won&apos;t get the weekly email again. Your price alerts keep working.</p>
      ) : done === "0" || !t ? (
        <p className="mt-3 text-slate-300">That link didn&apos;t work. You can turn the email off on <Link className="underline" href="/watching">your watchlist</Link>.</p>
      ) : (
        <form method="post" action={`/api/watch-digest/stop?t=${encodeURIComponent(t)}`} className="mt-4">
          <p className="text-slate-300">Stop the weekly email about the cards you watch? Your price alerts are separate and keep working.</p>
          <button type="submit" className="btn-buy mt-4">Stop the weekly email</button>
        </form>
      )}
      <p className="mt-6 text-sm"><Link className="underline text-slate-400" href="/watching">Back to my watchlist</Link></p>
    </div>
  );
}
