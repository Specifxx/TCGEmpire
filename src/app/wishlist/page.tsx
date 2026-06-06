import { WishlistView } from "@/components/WishlistView";

export const metadata = {
  title: "Your Wishlist",
  robots: { index: false },
};

export default function WishlistPage() {
  return (
    <div>
      <div className="card-surface mb-5 overflow-hidden">
        <div className="bg-gradient-to-r from-gold/15 via-ink-850 to-brand-600/20 p-6">
          <h1 className="text-2xl font-extrabold text-white">Your Wishlist</h1>
          <p className="mt-1 text-sm text-slate-300">
            Cards you&apos;re tracking. Saved on this device — sign-in to sync across devices is coming soon.
          </p>
        </div>
      </div>
      <WishlistView />
    </div>
  );
}
