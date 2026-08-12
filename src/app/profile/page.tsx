import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { LogoutButton, ResendVerifyButton } from "@/components/ProfileActions";
import { MyCollection } from "@/components/MyCollection";
import { ShippingAddressCard } from "@/components/ShippingAddressCard";

export const metadata: Metadata = { robots: { index: false } }; // auth/utility — never indexed

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/profile");

  const account = await prisma.user.findUnique({ where: { id: user.id }, select: { googleId: true, discordId: true } });

  // Password sign-in was removed; Google and Discord are the only ways in, so a
  // "Password" row here would advertise a method nothing can use. The column is
  // still on the model — see the note in api/auth/oauth/[provider]/callback.
  const methods = [
    { label: "Google", on: !!account?.googleId },
    { label: "Discord", on: !!account?.discordId },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="card-surface flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-4">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt="" aria-hidden="true" className="h-14 w-14 rounded-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="grid h-14 w-14 place-items-center rounded-full bg-brand-500 text-2xl font-black text-white">
              {user.displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-xl font-extrabold text-white">{user.displayName}</h1>
            <p className="text-sm text-slate-400">{user.email}</p>
          </div>
        </div>
        <LogoutButton />
      </div>

      {/* My Collection — cards the user owns, valued live (separate from wishlist) */}
      <MyCollection />

      {/* Saved shipping address — prefills Marketplace checkout */}
      <ShippingAddressCard />

      {/* Account & security */}
      <div className="card-surface mt-5 p-5">
        <h2 className="font-bold text-white">Account &amp; security</h2>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-b border-ink-800 pb-3 text-sm">
          <span className="text-slate-400">Email</span>
          {user.emailVerified ? (
            <span className="chip bg-brand-500/15 text-brand-300">✓ Verified</span>
          ) : (
            <span className="flex items-center gap-2">
              <span className="chip bg-gold/15 text-gold">Not confirmed</span>
              <ResendVerifyButton />
            </span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-slate-400">Sign-in methods</span>
          <span className="flex gap-1.5">
            {methods.map((m) => (
              <span key={m.label} className={`chip ${m.on ? "bg-ink-800 text-slate-200" : "bg-ink-900 text-slate-600"}`}>
                {m.on ? "✓ " : ""}{m.label}
              </span>
            ))}
          </span>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Link more sign-in options any time from the <Link href="/login" className="text-brand-400 hover:underline">sign-in page</Link>.
        </p>
      </div>
    </div>
  );
}
