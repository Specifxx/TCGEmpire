import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "TCGEmpire — Riftbound Marketplace (AU)",
  description:
    "Australia's marketplace for Riftbound trading cards. Buy and sell singles with confidence.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  return (
    <html lang="en-AU">
      <body className="min-h-screen bg-ink-950">
        <Navbar user={user} />
        <main className="container-app py-6">{children}</main>
        <footer className="container-app border-t border-ink-800 py-8 text-center text-xs text-slate-500">
          <p>
            TCGEmpire · Australia&apos;s Riftbound marketplace · MVP demo. Card
            data is sample data for demonstration. Not affiliated with Riot
            Games.
          </p>
        </footer>
      </body>
    </html>
  );
}
