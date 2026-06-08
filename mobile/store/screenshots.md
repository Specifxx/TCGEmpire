# Screenshots

Stores require real device screenshots — capture them once the app runs on a
simulator/emulator or device.

## How to capture

- **iOS (Simulator):** run the app (`npx cap run ios`), then in the Simulator menu
  **File → Save Screen** (`⌘S`). Use the required simulators below.
- **Android (Emulator):** run the app, click the **camera** icon in the emulator
  toolbar, or `adb exec-out screencap -p > shot.png`.

Good frames to capture: the **browse/search** grid, a **card price-comparison**
page (the hero feature), the **deck builder**, and the **forum**.

## Apple App Store (required sizes)

You must provide at least one set; App Store Connect can scale some, but provide
both phone sizes to be safe:

| Device | Resolution (px) | Simulator to use |
| --- | --- | --- |
| 6.7" iPhone | 1290 × 2796 | iPhone 15 Pro Max / 16 Pro Max |
| 6.5" iPhone | 1242 × 2688 | iPhone 11 Pro Max |
| 12.9" iPad Pro (only if you ship iPad) | 2048 × 2732 | iPad Pro 12.9" |

- 3–10 screenshots per size. Portrait.

## Google Play (required)

| Asset | Spec |
| --- | --- |
| Phone screenshots | 2–8, min 320px, max 3840px on a side, 16:9 or 9:16. e.g. 1080 × 1920 |
| Feature graphic | **1024 × 500** PNG/JPG (required for the listing) |
| App icon | 512 × 512 (already generated — `resources/icon.png` scaled, or export from the project) |

> Tip: a quick **feature graphic** (1024×500) can be the wordmark logo centred on
> the `#0a0f1a` background, matching the splash.
