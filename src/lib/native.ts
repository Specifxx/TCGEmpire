// Small helpers for the bits of the site that behave differently inside the
// native Capacitor shell (mobile/). Everything here is a no-op on the plain web
// and — critically — every native package is behind a dynamic import that only
// runs after isNative() is true, so a browser visitor never downloads a byte of
// Capacitor. See src/components/NativeShell.tsx for the shell itself and
// mobile/README.md for how the two halves fit together.

export type NativePlatform = "ios" | "android";

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
};

function cap(): CapacitorGlobal | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

/** True only inside the iOS/Android shell. False during SSR and on the web. */
export function isNative(): boolean {
  return cap()?.isNativePlatform?.() === true;
}

/** Which shell we're in. Returns null on the web. */
export function nativePlatform(): NativePlatform | null {
  if (!isNative()) return null;
  return cap()?.getPlatform?.() === "ios" ? "ios" : "android";
}

/**
 * Open a URL outside the app.
 *
 * In the shell this is a Custom Tab (Android) / SFSafariViewController (iOS):
 * the retailer's site opens over ours with a close button that comes straight
 * back, instead of navigating the app's only WebView away to a page with no way
 * home. On the web it's a normal new tab.
 *
 * Falls back to window.open if the Browser plugin can't start — better a
 * clumsy tab than a buy button that does nothing.
 */
export async function openExternal(url: string): Promise<void> {
  if (!isNative()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url, presentationStyle: "popover" });
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/**
 * A short tactile tick. Used for the one or two interactions that commit to
 * something (a buy click, adding a watch) — not for ordinary navigation, where
 * constant buzzing just reads as a broken phone.
 *
 * Deliberately fire-and-forget: haptics are a nicety and must never be able to
 * delay or reject the action they accompany.
 */
export function haptic(style: "light" | "medium" = "light"): void {
  if (!isNative()) return;
  void (async () => {
    try {
      const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
      await Haptics.impact({ style: style === "medium" ? ImpactStyle.Medium : ImpactStyle.Light });
    } catch {
      /* no haptic engine, or the user has them off — nothing to do */
    }
  })();
}

/**
 * Share a card/page via the OS share sheet in the app, or the Web Share API in
 * a browser that has one. Resolves false when there is nothing to share with,
 * so the caller can fall back to copy-to-clipboard.
 */
export async function shareUrl(opts: { title: string; text?: string; url: string }): Promise<boolean> {
  if (isNative()) {
    try {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title: opts.title, text: opts.text, url: opts.url, dialogTitle: opts.title });
      return true;
    } catch {
      return false;
    }
  }
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title: opts.title, text: opts.text, url: opts.url });
      return true;
    } catch {
      // A user dismissing the sheet rejects too; either way there is nothing
      // more for us to do, and it is not a failure worth surfacing.
      return false;
    }
  }
  return false;
}
