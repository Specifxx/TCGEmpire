# Android release signing

The Gradle signing is **already wired up** in `mobile/android/app/build.gradle`:
it reads `mobile/android/keystore.properties` if that file exists and signs the
release build with it. You only need to (1) create a keystore and (2) create the
properties file. Both are git-ignored.

## 1. Create your upload keystore (once — keep it forever)

```bash
cd mobile/android
keytool -genkey -v -keystore riftcompare-upload.keystore \
  -alias riftcompare -keyalg RSA -keysize 2048 -validity 10000
```

> ⚠️ Back this file up somewhere safe. If you lose it you cannot publish updates
> to the same app (unless you enrolled in Play App Signing, which is recommended —
> Google then holds the app signing key and this is "just" your upload key, which
> can be reset).

## 2. Create `mobile/android/keystore.properties`

```properties
storeFile=riftcompare-upload.keystore
storePassword=YOUR_STORE_PASSWORD
keyAlias=riftcompare
keyPassword=YOUR_KEY_PASSWORD
```

(`storeFile` may be relative to `mobile/android/` or an absolute path.)

## 3. Build the signed bundle

```bash
cd mobile/android
./gradlew bundleRelease
# → app/build/outputs/bundle/release/app-release.aab   (upload this to Play)
```

To produce a signed APK instead (e.g. for sideloading/testing):

```bash
./gradlew assembleRelease
# → app/build/outputs/apk/release/app-release.apk
```

## Notes

- The `signingConfig` block in `build.gradle` is conditional — with no
  `keystore.properties` present, debug builds still work and release builds are
  simply unsigned. So a fresh clone builds fine.
- Enable **Play App Signing** when you create the app in the Play Console (default
  and recommended). You upload with your upload key; Google re-signs with the app
  key.
