import type { Metadata } from "next";
import Link from "next/link";
import { EmailLinkConfirm } from "@/components/EmailLinkConfirm";
import { EmailSignInForm } from "@/components/EmailSignInForm";
import { sanitizeNextPath } from "@/lib/next-param";

// Where an emailed sign-in link lands (2026-11-06, lib/email-sign-in.ts).
// Never signs in on load: the button POSTs the token, so a mail scanner that
// fetches the link cannot use it up. Reads no session and no database.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default function EmailLinkPage({ searchParams }: { searchParams: { token?: string; next?: string } }) {
  const token = typeof searchParams.token === "string" ? searchParams.token.slice(0, 2048) : "";
  const next = sanitizeNextPath(searchParams.next) ?? undefined;
  return (
    <div className="mx-auto w-full max-w-sm py-10">
      <div className="card-surface p-6">
        <h1 className="text-xl font-extrabold text-white">Sign in to RiftCompare</h1>
        {token ? (
          <>
            <p className="mt-2 text-sm text-slate-300">Tap the button to finish signing in. No password needed.</p>
            <EmailLinkConfirm token={token} next={next} />
            <p className="mt-6 text-xs text-slate-500">Link expired? Get a fresh one:</p>
            <div className="mt-2">
              <EmailSignInForm next={next} />
            </div>
          </>
        ) : (
          <div className="mt-4">
            <EmailSignInForm next={next} defaultOpen />
          </div>
        )}
        <p className="mt-6 text-center text-xs text-slate-500">
          Trouble signing in? <Link href="/contact" className="text-brand-400 hover:underline">Contact us</Link> and we&apos;ll sort it out.
        </p>
      </div>
    </div>
  );
}
