import type { Metadata } from "next";
import { AppSignInFinish } from "@/components/AppSignInFinish";
import { sanitizeNextPath } from "@/lib/next-param";

// Where a sign-in started inside the Android app comes back to (lib/app-auth.ts). Reads no session and no database: the client
// trades the code and the WebView's own verifier for a session.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Signing in",
  robots: { index: false, follow: false },
};

export default function AppSignInPage({ searchParams }: { searchParams: { code?: string; n?: string } }) {
  const code = typeof searchParams.code === "string" ? searchParams.code.slice(0, 96) : "";
  const next = sanitizeNextPath(searchParams.n) ?? undefined;
  return (
    <div className="mx-auto w-full max-w-sm py-10">
      <div className="card-surface p-6">
        <h1 className="text-xl font-extrabold text-white">Signing you in</h1>
        <AppSignInFinish code={code} next={next} />
      </div>
    </div>
  );
}
