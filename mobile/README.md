# RiftCompare — Mobile App (Android + iOS)

The native app for **RiftCompare**, built with [Capacitor 8](https://capacitorjs.com).
It is a native shell that loads the live [`https://riftcompare.com`](https://riftcompare.com)
in a native WebView and layers real native behaviour on top: **Google AdMob**
ads, App Links, launcher shortcuts, an offline screen, a share sheet, haptics,
hardware-back handling and connectivity awareness.

> **Why a wrapper?** The website is a full server-rendered Next.js app (auth,
> search, live multi-store price comparison). Wrapping it means the app reuses
> 100% of that and stays in sync automatically: ship a website change and every
> installed app has it on next launch — no store update. Only native changes
> (icons, ads, plugins, the shell config) need a new build.

---

## Contents

- [How it fits together](#how-it-fits-together)
- [Prerequisites](#prerequisites)
- [First-time setup](#first-time-setup)
- [Run it in development](#run-it-in-development)
- [What is actually native](#what-is-actually-native)
- [AdMob: from test ads to real revenue](#admob-from-test-ads-to-real-revenue)
- [App Links (riftcompare.com opens in the app)](#app-links-riftcomparecom-opens-in-the-app)
- [Release: Android (Google Play)](#release-android-google-play)
- [Release: iOS (App Store)](#release-ios-app-store)
- [Store listings & assets](#store-listings--assets)
- [Updating the app](#updating-the-app)
- [Known limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)

---

## How it fits together

```
mobile/
├── capacitor.config.ts   # appId, server.url, errorPath, appendUserAgent, splash
├── www/                  # bundled in the binary: launch shell + offline.html
├── resources/            # 1024 icon + 2732 splash source images
├── store/                # Play/App Store copy, signing guide, generated assets
├── android/              # native Android project  (committed)
└── ios/                  # native Xcode project    (committed)
```

The behaviour lives on **both** sides of the bridge:

| File (Next.js app, repo root) | Role |
| --- | --- |
| `src/lib/native-boot.ts` | The `<head>` boot script. Detects the app from the User-Agent before any bundle loads, stamps `html.capacitor-native`, and **pauses AdSense** (app inventory is AdMob's). |
| `src/components/NativeShell.tsx` | The shell bridge: splash, status bar, AdMob banner + its real height, back button, deep links, connectivity, keyboard. No-op on the web. |
| `src/lib/native.ts` | `isNative()`, `openExternal()`, `haptic()`, `shareUrl()`. |
| `src/lib/admob.ts` | AdMob **ad-unit** ids (test by default, overridden by `NEXT_PUBLIC_ADMOB_*`). |
| `src/components/OutboundLink.tsx` | Opens retailer "buy" links in a Custom Tab when in-app. |
| `src/components/AdSlot.tsx` | Never mounts an AdSense unit inside the app. |
| `src/app/globals.css` | Reserves space for the native banner; hides any AdSense unit in-app. |

The AdMob **app** id (not the unit ids) lives natively, in
`android/app/src/main/res/values/strings.xml` and `ios/App/App/Info.plist`.

---

## Prerequisites

| To build… | You need |
| --- | --- |
| Both | [Node.js 20+](https://nodejs.org), this repo cloned |
| **Android** | [Android Studio](https://developer.android.com/studio) (SDK 36 + JDK 21). macOS, Windows or Linux. |
| **iOS** | A **Mac** with [Xcode](https://developer.apple.com/xcode/) and [CocoaPods](https://cocoapods.org). iOS cannot be built on Windows/Linux. |

Android builds need **JDK 21** and **compileSdk 36** — Play requires apps to
target API 36 for new submissions, and the toolchain is pinned to match
(AGP 8.13, Gradle 8.14.3, set by Capacitor 8's template).

> No Mac? Android needs none. iOS can be built on a cloud Mac service such as
> [Codemagic](https://codemagic.io) or [EAS Build](https://docs.expo.dev).

---

## First-time setup

```bash
cd mobile
npm install
npx cap sync          # copies config + plugins into android/ and ios/
```

On a Mac, also install the iOS Pods (the Google Mobile Ads SDK arrives here):

```bash
cd ios/App && pod install && cd ../..
```

If you regenerate the icons/splash after a logo change:

```bash
# from the repo ROOT:
npx tsx scripts/gen-mobile-assets.ts
cd mobile && npm run assets
```

---

## Run it in development

```bash
cd mobile
npx cap run android          # or: npx cap open android → ▶ in Android Studio
npx cap run ios              # Mac only
```

You should get the RiftCompare splash, then the live site, with a **test**
AdMob banner pinned to the bottom. Test ads are safe to tap.

Useful scripts:

```bash
npm run build:debug   # sync + assembleDebug   → app/build/outputs/apk/debug/
npm run build:apk     # sync + assembleRelease → a signed APK (needs a keystore)
npm run build:aab     # sync + bundleRelease   → the .aab you upload to Play
npm run clean:android
```

`chrome://inspect` works against a debug build (Capacitor enables WebView
debugging for debuggable builds only — release builds are never inspectable).

---

## What is actually native

Worth knowing, both for debugging and because "it's just a website" is the
argument that gets wrapper apps rejected:

- **Offline screen.** `server.errorPath` points at the bundled
  `www/offline.html`, so a failed load shows a branded screen with a working
  retry instead of Chrome's error page. It auto-returns when connectivity comes
  back. Capacitor serves it from the binary, so it works with no network at all.
- **App Links.** Tapping any `riftcompare.com` link on the phone opens the app,
  routed through the SPA router rather than a full reload. Needs
  `assetlinks.json` published — see below.
- **Launcher shortcuts.** Long-press the icon for Search / Movers / Watchlist.
- **Hardware back.** Follows WebView history, then asks for a confirming second
  press before exiting.
- **Connectivity.** A visible notice when the network drops mid-session.
- **Keyboard-aware ads.** The banner is hidden while the soft keyboard is up, so
  an ad is never between you and the search field.
- **Share sheet + haptics.** Native share, and a tick on buy taps.
- **Custom Tabs.** Retailer links open over the app with a close button.
- **Edge-to-edge.** Android 15+ mandatory edge-to-edge is handled via
  Capacitor's `adjustMarginsForEdgeToEdge` plus the site's safe-area CSS.
- **Themed splash.** Uses the Android 12+ splash screen API, dismissed by the
  shell as soon as the site paints.

### Price-drop push notifications (not shipped in 1.0.0)

The obvious next native feature, and deliberately **not** in this build.
`@capacitor/push-notifications` cannot function without a Firebase
`google-services.json`, and bundling it meant declaring `POST_NOTIFICATIONS`,
`WAKE_LOCK`, `FOREGROUND_SERVICE` and `c2dm.RECEIVE` for a feature that does
nothing — so it was removed rather than shipped dead. To add it:

1. Create a Firebase project, add an Android app with id `com.riftcompare.app`,
   download `google-services.json` into `mobile/android/app/` (git-ignored; the
   Gradle file already applies the plugin when it is present).
2. `npm i @capacitor/push-notifications` in **both** `mobile/` and the repo root
   (the versions must match — see *Known limitations*).
3. Re-add `<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />`.
4. Register for a token in `NativeShell.tsx` and store it against the user.
5. Send from the existing alerts pipeline (`src/lib/alerts.ts`).

---

## AdMob: from test ads to real revenue

The app ships Google's official **test** ad ids, so ads work immediately and you
cannot get your account flagged. To earn real money:

1. **Create an AdMob account** → <https://admob.google.com>.
2. **Add the app** (choose "the app isn't listed yet" if it isn't live). You get
   an **App id** like `ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY`.
3. **Create a Banner ad unit.** You get a **unit id** `ca-app-pub-XXXX/ZZZZ`.
4. **Plug them in:**

   | Id | Where |
   | --- | --- |
   | Android **App** id | `android/app/src/main/res/values/strings.xml` → `admob_app_id` |
   | iOS **App** id | `ios/App/App/Info.plist` → `GADApplicationIdentifier` |
   | Banner **unit** ids | Website env vars (below) |

   ```
   NEXT_PUBLIC_ADMOB_BANNER_ANDROID=ca-app-pub-XXXX/ZZZZ
   NEXT_PUBLIC_ADMOB_BANNER_IOS=ca-app-pub-XXXX/ZZZZ
   ```

   Because the unit ids live on the website, ads can be changed **without
   rebuilding the app**. Only the native App ids need a new store build.

5. `npx cap sync`, rebuild, submit.

> ⚠️ **Never tap your own live ads.** AdMob bans accounts for invalid traffic.
> The defaults are test ids and are tap-safe; real ids are not.

> 📋 **app-ads.txt** — add one to `riftcompare.com` (AdMob shows the exact
> line). The site's web `ads.txt` is a separate file.

### AdSense vs AdMob

AdSense is a **web** product; in-app inventory — including a WebView wrapping
your own site — belongs to AdMob under the Google Publisher Policies. The site
was serving AdSense inside the app alongside the native AdMob banner. The app
now suppresses the AdSense half at three levels: `pauseAdRequests` from the
`<head>` boot script (stops Auto ads), an `isNative` gate in `AdSlot` (stops
manual units), and a CSS rule (stops anything that slips through). Do not remove
these — `tests/native-boot.test.ts` guards the first one.

---

## App Links (riftcompare.com opens in the app)

`AndroidManifest.xml` already declares the verified intent-filter. To make
verification succeed:

1. Get the **SHA-256 fingerprint of the App signing key** from
   Play Console → *Test and release → Setup → App signing*.
   (With Play App Signing on, this is **not** your upload key — using the upload
   fingerprint is the usual reason App Links silently fail.)
2. Fill in `store/assetlinks.json.template`, drop the `_comment` key, and
   publish it at `public/.well-known/assetlinks.json` so it is served from
   `https://riftcompare.com/.well-known/assetlinks.json`.
3. Verify on a device:

   ```bash
   adb shell pm verify-app-links --re-verify com.riftcompare.app
   adb shell pm get-app-links com.riftcompare.app   # expect "verified"
   ```

Until then nothing breaks — links simply keep opening in the browser.

---

## Release: Android (Google Play)

1. **Play Console account** ($25 once): <https://play.google.com/console>.
2. **Create an upload keystore + `keystore.properties`** — see
   [`store/android-signing.md`](store/android-signing.md).
3. **Build the bundle:**

   ```bash
   cd mobile && npm run build:aab
   # → android/app/build/outputs/bundle/release/app-release.aab
   ```

4. In the Play Console: create the app → fill the listing from
   [`store/listing.md`](store/listing.md) → upload the `.aab` under
   *Test and release → Production → Create new release* → roll out.

First review is typically a few hours to ~3 days. Separately, Play requires a
*personal* (non-organisation) developer account to run a **closed test with 12
testers for 14 continuous days** before it may promote anything to production.
Check the exact threshold in the Console — Google has changed it more than once —
but plan for it either way: it is the single biggest surprise in a first Play
launch, and it is not something you can shorten after the fact.

Bump `versionCode` (+1) and `versionName` in `android/app/build.gradle` for
every upload.

---

## Release: iOS (App Store)

Requires a **Mac + Xcode** and an **Apple Developer Program** membership
($99/yr).

1. `npx cap open ios`, then *Signing & Capabilities* → pick your Team.
2. Confirm the bundle id is `com.riftcompare.app`.
3. Set version/build, target *Any iOS Device (arm64)*.
4. **Product → Archive** → *Distribute App → App Store Connect → Upload*.
5. In App Store Connect: fill the listing, attach the build, answer the privacy
   questions (the app uses the advertising identifier via AdMob — declare it),
   and submit.

---

## Store listings & assets

See [`store/`](store):

- [`store/listing.md`](store/listing.md) — every Play Console field, written out
  and within the character limits, plus the Data safety and content-rating
  answers.
- [`store/screenshots.md`](store/screenshots.md) — how the graphics are
  generated.
- [`store/android-signing.md`](store/android-signing.md) — keystore + signing.
- [`store/assetlinks.json.template`](store/assetlinks.json.template) — App Links.
- [`store/assets/`](store/assets) — the generated icon, feature graphic and six
  phone screenshots, ready to upload.

Regenerate the graphics any time with, from the repo root:

```bash
npx tsx scripts/gen-store-screenshots.ts
```

---

## Updating the app

- **Content / features / pricing logic / bug fixes** → just deploy the website.
  Installed apps pick it up on next launch. **No store update.**
- **Native changes** (icon, splash, AdMob App id, plugins, shell config, min OS)
  → bump the version, rebuild, resubmit.

---

## Known limitations

Read these before promising any of it to a user.

### Google sign-in does not work inside the app

Google **blocks OAuth in embedded WebViews** (`disallowed_useragent`) as an
anti-phishing measure, and there is no setting that changes this. Discord
sign-in works: `capacitor.config.ts` keeps `discord.com` in `allowNavigation`
so the whole redirect chain stays in one WebView and the session cookie lands in
the right cookie jar. `accounts.google.com` is listed too, so the flow at least
stays in-app and fails visibly rather than opening an external browser that
signs you in *somewhere the app cannot see*.

Fixing it properly means native Google Sign-In (Credential Manager) plus a
server endpoint that exchanges the returned ID token for a session cookie. That
is a real change to production auth and was **deliberately not attempted here** —
it is security-sensitive and cannot be tested without live OAuth credentials.
A Custom Tab is *not* a workaround: Custom Tabs share cookies with Chrome, not
with the app's WebView, so the session still would not arrive.

### The app needs a connection

There is no offline browsing — only the offline *screen*. Everything is rendered
by the server. Caching a watchlist for offline reading would be the first real
offline feature.

### The two package.json files must agree

Capacitor plugin JS is imported by the **website** (`/package.json`) and the
native half is built from **`mobile/package.json`**. If the majors drift — as
they had, a v6 web bundle against a v8 native runtime — the bridge calls a
native plugin with a contract it no longer has, and it fails at runtime, not at
build time. Add or upgrade a plugin in both, together.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| White flash on launch | Expected briefly; the dark splash + `backgroundColor` minimise it. |
| No banner appears | Confirm you're in the native app, check Logcat for AdMob logs, and that the App id is set natively. Test ads can take a few seconds on first load. |
| Banner overlaps content | `--native-banner-h` is set from AdMob's own `bannerAdSizeChanged` event. If it's wrong, the site deploy is older than `NativeShell.tsx`. |
| App won't exit with back | By design — press back twice at the root. |
| Links open in the browser, not the app | `assetlinks.json` isn't published, or lists the upload fingerprint instead of the App signing one. |
| Retailer links open inside the app | They should use a Custom Tab via `OutboundLink`; ensure the deploy includes the latest `src/lib/native.ts`. |
| `cap sync` warns CocoaPods not installed | You're on Windows/Linux — fine, run the iOS steps on a Mac. |
| Gradle: "SDK location not found" | `echo "sdk.dir=$ANDROID_HOME" > android/local.properties` |
| Release build crashes but debug is fine | An R8 problem. Add a `-keep` to `android/app/proguard-rules.pro` and file what you found. |
