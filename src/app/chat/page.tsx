// Live chat pilot (docs/chat.md). Not indexed, not in the sitemap. Draws nothing while CHAT_MODE is "off".
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChatApp } from "@/components/chat/ChatApp";
import { getCurrentUser } from "@/lib/auth";
import { CHAT_MODE } from "@/lib/chat/core";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Live chat", robots: { index: false, follow: false }, alternates: { canonical: "/chat" } };

export default async function ChatPage() {
  if (CHAT_MODE !== "on") notFound();
  const user = await getCurrentUser();
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-3 text-xl font-bold">Live chat</h1>
      <ChatApp signedIn={!!user?.emailVerified} />
    </div>
  );
}
