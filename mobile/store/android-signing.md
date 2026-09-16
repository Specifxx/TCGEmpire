# Android release signing

Gradle signing is **already wired up** in `mobile/android/app/build.gradle`: it
reads `mobile/android/keystore.properties` if that file exists and signs the
release build with it. You only need to (1) create a keystore and (2) create the
properties file. Both are git-ignored.

## 1. Create your upload keystore (once — keep it forever)

```bash
cd mobile/android
keytool -genkey -v -keystore riftcompare-upload.keystore \
  -alias riftcompare -keyalg RSA -keysize 2048 -validity 10000
```

It will ask for a password and some identity fields (name, org, city, country).
The identity fields are not shown to users; answer them however you like, but
write the **passwords** down.

> ⚠️ **Back this file up somewhere you will still have in five years.** With
> Play App Signing enabled (step 4) a lost upload key can be reset by Google, so
> it is recoverable — but without it, it is not. Do not commit it.

## 2. Create `mobile/android/keystore.properties`

```properties
storeFile=riftcompare-upload.keystore
storePassword=YOUR_STORE_PASSWORD
keyAlias=riftcompare
keyPassword=YOUR_KEY_PASSWORD
```

`storeFile` is resolved **relative to `mobile/android/`** (the folder holding
this properties file), or you can give an absolute path.

> This used to be a trap. `build.gradle` called a bare `file(...)`, which in the
> `app` module resolves against `mobile/android/app/` — so the relative path
> documented here failed with *"Keystore file not found"* and only an absolute
> path worked. It now resolves through `rootProject.file(...)`, so both behave
> as written above.

## 3. Build the signed bundle

```bash
cd mobile
npm run build:aab
# → android/app/build/outputs/bundle/release/app-release.aab   (upload this)
```

Or by hand:

```bash
cd mobile && npx cap sync android && cd android && ./gradlew bundleRelease
```

For a signed APK to sideload onto a test device instead:

```bash
cd mobile && npm run build:apk
# → android/app/build/outputs/apk/release/app-release.apk
```

## 4. Enable Play App Signing

When you create the app in the Play Console, accept **Play App Signing** (it is
the default). You upload with your *upload* key; Google re-signs with the real
*app* key and keeps it safe. This is also what makes a lost upload key
recoverable.

## Verifying a build before you upload

```bash
# What's actually inside the bundle:
cd mobile/android
unzip -l app/build/outputs/bundle/release/app-release.aab | head -30

# Confirm it is signed, and with which certificate:
$ANDROID_HOME/build-tools/36.0.0/apksigner verify --print-certs \
  app/build/outputs/apk/release/app-release.apk
```

The SHA-256 fingerprint that `apksigner` prints is what goes in
`assetlinks.json` — **but see the warning in `assetlinks.json.template`: with
Play App Signing on, the fingerprint App Links must trust is Google's app
signing certificate, not your upload certificate.**

## Notes

- The `signingConfig` block is conditional. With no `keystore.properties`
  present, debug builds still work and release builds are simply unsigned, so a
  fresh clone builds without any secrets.
- Release builds run **R8** (`minifyEnabled true`, `shrinkResources true`). That
  takes the release APK from 10.7 MB to 4.9 MB. Capacitor's AAR contributes the
  `-keep` rules that preserve plugin reflection; `app/proguard-rules.pro` adds
  the few this app needs on top.
- `versionCode` must increase by 1 for **every** upload, even a re-upload of the
  same code. It lives in `mobile/android/app/build.gradle`.
