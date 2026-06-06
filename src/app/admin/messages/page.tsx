import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Keep this page out of search engines.
export const metadata: Metadata = {
  title: "Inbox",
  robots: { index: false, follow: false },
};

// Private inbox for contact-form submissions. Reads straight from the database,
// so it works with zero email setup. Access is gated by the ADMIN_TOKEN env var
// (set it in Vercel → Settings → Environment Variables, then visit
// /admin/messages?key=YOUR_TOKEN). A logged-in admin account also works.
export default async function AdminMessagesPage({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
  const token = process.env.ADMIN_TOKEN;
  const keyOk = !!token && searchParams.key === token;
  const user = await getCurrentUser();
  const authed = keyOk || !!user?.isAdmin;

  // Don't reveal the page exists to anyone without access.
  if (!authed) notFound();

  const messages = await prisma.contactMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const fmt = new Intl.DateTimeFormat("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Sydney",
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Contact inbox</h1>
          <p className="text-sm text-slate-400">
            {messages.length} message{messages.length === 1 ? "" : "s"} · newest first
          </p>
        </div>
      </div>

      {messages.length === 0 ? (
        <div className="rounded-xl border border-ink-700 bg-ink-850 px-4 py-10 text-center text-slate-400">
          No messages yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {messages.map((m) => (
            <li key={m.id} className="rounded-xl border border-ink-700 bg-ink-850 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <div className="font-semibold text-white">
                  {m.subject || "RiftCompareAU feedback"}
                </div>
                <div className="text-xs text-slate-500">{fmt.format(m.createdAt)}</div>
              </div>
              <div className="mt-0.5 text-sm text-slate-400">
                {m.name} ·{" "}
                <a href={`mailto:${m.email}`} className="text-accent hover:underline">
                  {m.email}
                </a>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">
                {m.message}
              </p>
              <div className="mt-3">
                <a
                  href={`mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent(
                    "Re: " + (m.subject || "RiftCompareAU feedback")
                  )}`}
                  className="text-xs font-medium text-brand-400 hover:underline"
                >
                  Reply →
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
