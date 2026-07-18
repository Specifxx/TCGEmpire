# RiftCompare — Mobile App (iOS + Android)

The native iOS and Android app for **RiftCompare**, built with
[Capacitor](https://capacitorjs.com). It is a native shell that loads the live
[`https://riftcompare.com`](https://riftcompare.com) inside a native WebView and
layers **native Google AdMob** ads on top.

> **Why a wrapper?** The website is a full server-rendered Next.js app (auth,
> browse, live price comparison). Wrapping it means the app reuses 100% of
> that and stays in sync automatically: ship a website change and every installed
> app gets it instantly — no app-store update needed. Only native changes (icons,
> ads, plugins, the shell config) require a new store build.

---

## Contents

- [How it fits together](#how-it-fits-together)
- [Prerequisites](#prerequisites)
- [First-time setup](#first-time-setup)
- [Run it in development](#run-it-in-development)
- [AdMob: go from test ads to real revenue](#admob-go-from-test-ads-to-real-revenue)
- [Release: Android (Google Play)](#release-android-google-play)
- [Release: iOS (App Store)](#release-ios-app-store)
- [Store listings & assets](#store-listings--assets)
- [Updating the app](#updating-the-app)
- [Troubleshooting](#troubleshooting)

---

## How it fits together

```
mobile/
├── capacitor.config.ts     # appId, name, server.url → riftcompare.com, splash
├── www/                    # local shell/splash bundled in the binary (rarely seen)
├── resources/              # 1024 icon + 2732 splash source images
├── android/                # native Android Studio / Gradle project  (committed)
└── ios/                    # native Xcode project                    (committed)
```

The **ad + native behaviour lives in the website**, gated behind a "is this
running inside the native app?" check, so the same code serves web and app:

| File (in the Next.js app, repo root) | Role |
| --- | --- |
| `src/components/NativeShell.tsx` | Detects Capacitor, shows the AdMob banner, styles the status bar, wires the Android back button. No-op on the web. |
| `src/lib/admob.ts` | AdMob **ad-unit** ids (test by default, override via `NEXT_PUBLIC_ADMOB_*`). |
| `src/components/HilltopAdsLoader.tsx` | Loads the HilltopAds web ad zone **only** on the web (never in-app). |
| `src/components/OutboundLink.tsx` | Opens retailer "buy" links in the system browser when in-app. |
| `src/app/globals.css` | Reserves space for the native AdMob banner. |

The AdMob **app** id (not the unit ids) lives natively:
`android/app/src/main/res/values/strings.xml` and `ios/App/App/Info.plist`.

---

## Prerequisites

| To build… | You need |
| --- | --- |
| Both | [Node.js 18+](https://nodejs.org), this repo cloned |
| **Android** | [Android Studio](https://developer.android.com/studio) (includes the SDK + JDK 17). Works on macOS, Windows, or Linux. |
| **iOS** | A **Mac** with [Xcode](https://developer.apple.com/xcode/) and [CocoaPods](https://cocoapods.org) (`sudo gem install cocoapods`). iOS **cannot** be built on Windows/Linux. |

> No Mac? You can still build/ship iOS via a cloud Mac CI service such as
> [Codemagic](https://codemagic.io) or [EAS Build](https://docs.expo.dev) — both
> support Capacitor. The Android build needs no Mac.

---

## First-time setup

```bash
cd mobile
npm install          # install Capacitor + plugins
npx cap sync         # copy config + native plugins into android/ and ios/
```

On a Mac, also install the iOS Pods (the Google Mobile Ads SDK comes in here):

```bash
cd ios/App && pod install && cd ../..
```

If you ever regenerate the icons/splash (e.g. after a logo change):

```bash
# from the repo ROOT:
npx tsx scripts/gen-mobile-assets.ts
cd mobile && npx @capacitor/assets generate \
  --iconBackgroundColor '#0a0f1a' --iconBackgroundColorDark '#0a0f1a' \
  --splashBackgroundColor '#0a0f1a' --splashBackgroundColorDark '#0a0f1a'
```

---

## Run it in development

**Android** (emulator or USB device):

```bash
cd mobile
npx cap run android          # or: npx cap open android  → press ▶ in Android Studio
```

**iOS** (Mac only — simulator or device):

```bash
cd mobile
npx cap run ios              # or: npx cap open ios       → press ▶ in Xcode
```

You should see the RiftCompare splash, then the live site, with a **test** AdMob
banner pinned to the bottom. Test ads are safe to tap.

---

## AdMob: go from test ads to real revenue

The app ships with Google's official **test** ad ids, so ads work immediately and
you can't accidentally get your account flagged. To earn real money:

1. **Create an AdMob account** → <https://admob.google.com>.
2. **Add two apps** in AdMob (one iOS, one Android) — even before they're on the
   stores, choose "the app isn't listed yet". Each gives you an **App ID** that
   looks like `ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY`.
3. **Create ad units** (start with one **Banner** per platform; optionally an
   **Interstitial**). Each gives a **unit id** `ca-app-pub-XXXX/ZZZZ`.
4. **Plug the ids in:**

   | Id | Where it goes |
   | --- | --- |
   | Android **App** id | `mobile/android/app/src/main/res/values/strings.xml` → `admob_app_id` |
   | iOS **App** id | `mobile/ios/App/App/Info.plist` → `GADApplicationIdentifier` |
   | Banner **unit** ids | Website env vars (below) |

   Set these env vars on the website deployment (Vercel → Project → Settings →
   Environment Variables), then redeploy:

   ```
   NEXT_PUBLIC_ADMOB_BANNER_ANDROID=ca-app-pub-XXXX/ZZZZ
   NEXT_PUBLIC_ADMOB_BANNER_IOS=ca-app-pub-XXXX/ZZZZ
   # optional, if you add interstitials later:
   NEXT_PUBLIC_ADMOB_INTERSTITIAL_ANDROID=ca-app-pub-XXXX/ZZZZ
   NEXT_PUBLIC_ADMOB_INTERSTITIAL_IOS=ca-app-pub-XXXX/ZZZZ
   ```

   Because the unit ids live on the website, you can switch ads on/off **without
   rebuilding the app** — only the native App ids require a new store build.

5. `cd mobile && npx cap sync`, rebuild, and submit.

> ⚠️ **Never tap your own live ads.** AdMob bans accounts for invalid traffic.
> The defaults are test ids and are tap-safe; real ids are not.

> 📋 **app-ads.txt** — to authorise your ad sellers, add an `app-ads.txt` to
> `riftcompare.com` (AdMob shows you the exact line). The site already serves a
> web `ads.txt`; the app one is separate.

---

## Release: Android (Google Play)

1. **Create a Play Console account** ($25 one-time): <https://play.google.com/console>.
2. **Generate an upload keystore** (do this once, keep it safe forever — losing it
   means you can't update the app):

   ```bash
   keytool -genkey -v -keystore riftcompare-upload.keystore \
     -alias riftcompare -keyalg RSA -keysize 2048 -validity 10000
   ```

3. **Tell Gradle about it.** Create `mobile/android/keystore.properties` (it is
   git-ignored — never commit it):

   ```properties
   storeFile=/absolute/path/to/riftcompare-upload.keystore
   storePassword=********
   keyAlias=riftcompare
   keyPassword=********
   ```

   Then wire it into `mobile/android/app/build.gradle` — see
   [`store/android-signing.md`](store/android-signing.md) for the exact snippet.

4. **Build the release bundle (.aab):**

   ```bash
   cd mobile/android
   ./gradlew bundleRelease
   # output: app/build/outputs/bundle/release/app-release.aab
   ```

5. In the Play Console: create the app → fill the store listing (see
   [`store/listing.md`](store/listing.md)) → **Production → Create release** →
   upload the `.aab` → roll out. First review is typically a few hours to ~2 days.

---

## Release: iOS (App Store)

Requires a **Mac + Xcode** and an **Apple Developer Program** membership
($99/yr): <https://developer.apple.com/programs/>.

1. `cd mobile && npx cap open ios` to open the project in Xcode.
2. **Signing:** select the `App` target → *Signing & Capabilities* → pick your
   Team. Xcode manages the certificate/profile automatically.
3. **Bundle id:** confirm it is `com.riftcompare.app` (or change it consistently
   here, in App Store Connect, and in your AdMob iOS app).
4. **Set version/build** numbers, choose *Any iOS Device (arm64)* as the target.
5. **Product → Archive** → when done, *Distribute App → App Store Connect →
   Upload*.
6. In [App Store Connect](https://appstoreconnect.apple.com): create the app,
   fill the listing (see [`store/listing.md`](store/listing.md)), attach the
   build, answer the **privacy** questions (the app uses the *IDFA / advertising
   data* via AdMob — declare it), and **Submit for Review**. Review is typically
   24–48h.

> **Apple guideline 4.2 (minimum functionality).** Apple sometimes rejects apps
> that are "just a website". RiftCompare has substantial functionality (search,
> accounts, live multi-store price comparison) plus native ads, splash, and
> back-button handling, which usually satisfies 4.2 — but if reviewers push back,
> the fastest fixes are to add a native feature or two (e.g. push notifications
> for price drops, an offline screen, share sheets). Ask and I'll add them.

---

## Store listings & assets

See the [`store/`](store) folder:

- [`store/listing.md`](store/listing.md) — app name, subtitle, descriptions,
  keywords, category, content rating, privacy answers (copy-paste ready).
- [`store/screenshots.md`](store/screenshots.md) — exact screenshot sizes each
  store requires and how to capture them.
- [`store/android-signing.md`](store/android-signing.md) — the Gradle signing
  snippet.

The app icon (1024²) and splash are already generated into both native projects
from `resources/`.

---

## Updating the app

- **Content / features / pricing logic / bug fixes** → just deploy the website.
  Installed apps pick it up on next launch. **No store update.**
- **Native changes** (icon, splash, AdMob App id, Capacitor plugins, the shell
  config, the app's min OS version) → bump the version, rebuild, resubmit.

To bump versions:
- Android: `mobile/android/app/build.gradle` → `versionCode` (+1) and `versionName`.
- iOS: in Xcode target → *General* → Version / Build, or `MARKETING_VERSION` /
  `CURRENT_PROJECT_VERSION`.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| White flash on launch | Expected briefly; the dark splash + `backgroundColor` minimise it. Increase `SplashScreen.launchShowDuration` in `capacitor.config.ts` if needed. |
| No banner appears | Confirm you're in the **native** app (not a browser), check Xcode/Logcat for AdMob logs, and that the App id is set natively. Test ads can take a few seconds on first load. |
| iOS build: "Sandbox: rsync … Pods" | Run `pod install` in `ios/App`, then build from `App.xcworkspace` (not `.xcodeproj`). |
| `cap sync` warns CocoaPods not installed | You're on Windows/Linux — that's fine, run the iOS steps on a Mac. |
| Retailer links open inside the app | They should open in the system browser via `OutboundLink`; ensure the website deploy includes the latest `OutboundLink.tsx`. |
