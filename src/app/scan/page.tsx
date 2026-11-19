import type { Metadata } from "next";
import { CardScanner } from "@/components/scan/CardScanner";

// The card scanner (private beta, DECISIONS.md 2026-11-19). A static shell: it reads no session, cookie or
// database; /api/scan/identify decides who may scan (admins until SCAN_PUBLIC=1). Never indexed, in no sitemap
// and linked from nowhere until the owner opens it.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Scan a card",
  robots: { index: false, follow: false },
};

export default function ScanPage() {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6 sm:py-10">
      <h1 className="text-2xl font-bold text-white">Scan a card</h1>
      <p className="mt-1 text-sm text-ink-300">
        Take a photo of one Riftbound card. We read its name and number, find the exact printing and show what it sells for.
      </p>
      <CardScanner />
    </div>
  );
}
