import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { GIFT_FEATURES } from "@/lib/premium-gift-pass";
import { GiftPassConsole } from "@/components/admin/GiftPassConsole";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "3-day pass email", robots: { index: false, follow: false } };

// The 3-day Premium pass by Gmail (owner, 2026-11-27): pick a site, grant a batch, copy the addresses into BCC and the
// email into the body. lib/premium-gift-pass-server.ts `grantGiftPassBccBatch`.
export default async function GiftPassAdminPage({ searchParams }: { searchParams: { key?: string } }) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const me = await getCurrentUser();
  if (!(keyOk || me?.isAdmin)) notFound();
  const sites = ["rift", ...Object.keys(GIFT_FEATURES).filter((k) => k !== "rift")];
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold">3-day Premium pass, by Gmail</h1>
      <p className="mt-2 text-sm opacity-80">
        Grant a batch, then send ONE Gmail with the addresses in BCC (your own address in To) and the copied email as the body.
        At most 450 a batch, and about 500 people a day per Gmail account. Sends close 1 Dec 2026, 12:00 UTC.
      </p>
      <GiftPassConsole sites={sites} adminKey={keyOk && !me?.isAdmin ? token! : null} />
    </main>
  );
}
