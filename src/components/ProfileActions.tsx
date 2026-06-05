"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/");
        router.refresh();
      }}
      className="btn-ghost"
    >
      Sign out
    </button>
  );
}

export function TopUpButton({ amount = 10000 }: { amount?: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <button
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        await fetch("/api/wallet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amountCents: amount }),
        });
        router.refresh();
        setLoading(false);
      }}
      className="btn-accent"
    >
      {loading ? "Adding…" : `+ Add $${(amount / 100).toFixed(0)} (demo)`}
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
