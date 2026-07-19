"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const [loading, setLoading] = useState(false);
  return (
    <button
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        // Hard navigation so the server re-renders with the cleared session cookie,
        // bypassing the App Router client cache that can otherwise keep showing the
        // signed-in UI until a manual refresh.
        window.location.assign("/");
      }}
      className="btn-ghost"
    >
      {loading ? "Signing out…" : "Sign out"}
    </button>
  );
}

export function ResendVerifyButton() {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  return (
    <button
      disabled={loading || sent}
      onClick={async () => {
        setLoading(true);
        await fetch("/api/auth/resend-verify", { method: "POST" }).catch(() => {});
        setSent(true);
        setLoading(false);
      }}
      className="text-xs font-semibold text-gold underline hover:text-white disabled:no-underline disabled:opacity-70"
    >
      {sent ? "Sent — check your inbox" : loading ? "Sending…" : "Resend confirmation email"}
    </button>
  );
}

export function CancelListingButton({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <button
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        await fetch(`/api/listings?id=${id}`, { method: "DELETE" });
        router.refresh();
        setLoading(false);
      }}
      className="chip bg-ink-800 text-red-400 hover:bg-red-500/10"
    >
      {loading ? "…" : "Cancel"}
    </button>
  );
}
