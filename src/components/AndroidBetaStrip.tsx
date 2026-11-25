import Link from "next/link";
import { ANDROID_STRIP_BOOT, AndroidStripClose } from "./AndroidStripClose";

// One line above the page's content asking Android visitors to test the app (2026-11-26, DECISIONS.md "Android app:
// closed test recruitment"). Google Play publishes a new personal account's app only after 12 testers stay opted in for
// 14 days, and the invite email alone brought 4.
//
// It is in the server HTML but hidden (display:none). The inline script right after it shows it BEFORE first paint, so
// there is no layout shift, and only when all of these hold: the browser is Android, it is not the app's own WebView, the
// visitor has not closed it in the last 30 days, and it is the first page of this visit (one prompt per visit). When it
// shows, the seasonal sale line is hidden on that page so the visitor sees one line, never two. Never on /android itself.
// Ends on its own after ANDROID_STRIP_UNTIL; remove it once the app is in production.
export const ANDROID_STRIP_UNTIL = "2027-01-31";

export function AndroidBetaStrip({ today = new Date().toISOString().slice(0, 10) }: { today?: string }) {
  if (today > ANDROID_STRIP_UNTIL) return null;
  return (
    <>
      <div className="relative border-b border-brand-500/20 bg-brand-500/10" data-android-strip style={{ display: "none" }}>
        <p className="container-app truncate py-1.5 pr-10 text-center text-xs sm:text-sm">
          <Link href="/android" prefetch={false} className="hover:underline">
            <b>On Android?</b> Help launch the RiftCompare app on Google Play ·{" "}
            <span className="font-semibold text-brand-400">become a tester →</span>
          </Link>
        </p>
        <AndroidStripClose />
      </div>
      <script dangerouslySetInnerHTML={{ __html: ANDROID_STRIP_BOOT }} />
    </>
  );
}
