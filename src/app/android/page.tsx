import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { pageAlternates } from "@/lib/seo";

// Android app beta sign-up (2026-11-18, DECISIONS.md "Android app: closed test
// recruitment"). Google Play lets a new personal developer account publish only
// after 12 testers have stayed opted in to a closed test for 14 days. Testers
// join through an open Google Group that the closed track lists; Play itself
// never emails a tester, which is why the old email list never filled.
// Static: no database, no cookie, no session.
export const revalidate = 86400;

const GROUP_URL = "https://groups.google.com/g/riftcompare-android-testers";
const OPT_IN_URL = "https://play.google.com/apps/testing/com.riftcompare.app";
const STORE_URL = "https://play.google.com/store/apps/details?id=com.riftcompare.app";

export const metadata: Metadata = {
  title: "Test the RiftCompare Android app",
  description: "Help launch the RiftCompare Android app on Google Play: join the beta in two taps and keep it installed for 14 days.",
  alternates: pageAlternates("/android"),
  // A sign-up page that stops mattering once the app is public: kept out of search.
  robots: { index: false, follow: true },
};

const steps: { title: string; body: string; href: string; cta: string }[] = [
  {
    title: "Join the tester group",
    body: "Open the group with the Google account you use on your Android phone and press “Join group”. You won’t get any emails or posts from it.",
    href: GROUP_URL,
    cta: "Join the group",
  },
  {
    title: "Become a tester",
    body: "Open the Google Play testing page with the same account and press “Become a tester”.",
    href: OPT_IN_URL,
    cta: "Become a tester",
  },
  {
    title: "Install the app",
    body: "Install RiftCompare from Google Play and keep it on your phone for 14 days. Opening it now and then is plenty.",
    href: STORE_URL,
    cta: "Open in Google Play",
  },
];

export default function AndroidBetaPage() {
  return (
    <div className="mx-auto max-w-xl">
      <div className="card-surface overflow-hidden">
        <div className="relative border-l-2 border-brand-500 bg-ink-900 px-6 py-10">
          <Breadcrumbs trail={[{ name: "Android app", href: "/android" }]} />
          <h1 className="text-center text-2xl font-extrabold text-white">Test the RiftCompare Android app</h1>
          <p className="mx-auto mt-2 max-w-md text-center text-sm leading-relaxed text-slate-300">
            Google Play needs 12 people to test a new app for 14 days before anyone can download it. It takes a minute,
            it&apos;s free, and the app is the same RiftCompare you use here.
          </p>
          <ol className="mt-8 space-y-4">
            {steps.map((s, i) => (
              <li key={s.href} className="rounded-lg border border-ink-800 bg-ink-950 p-4">
                <p className="text-sm font-bold text-white">
                  {i + 1}. {s.title}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-slate-400">{s.body}</p>
                <a
                  href={s.href}
                  rel="noopener"
                  className="btn-buy mt-3 inline-block rounded-md px-4 py-2 text-sm font-semibold"
                >
                  {s.cta}
                </a>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-center text-xs text-slate-500">
            Android only for now. On an iPhone or a computer, riftcompare.com is the same thing.
          </p>
        </div>
      </div>
    </div>
  );
}
