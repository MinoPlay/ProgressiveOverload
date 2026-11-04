# Android App (Trusted Web Activity)

## Goal
Install the live site as a real Android app (launcher icon, fullscreen, no URL bar) without a second
codebase. The APK is a thin shell: it opens `https://minoplay.github.io/ProgressiveOverload/` in Chrome
as a Trusted Web Activity (TWA), so web changes ship via Pages and never need a new APK.

## Files (`android/`)
- Single-module Gradle project (Kotlin DSL) with no Java/Kotlin sources — the launcher is
  `com.google.androidbrowserhelper.trusted.LauncherActivity` (androidbrowserhelper 2.7.4).
- `build.gradle.kts`: AGP 9.5.0, compile/target SDK 36, minSdk 26, R8 on.
  `applicationId` = `io.github.minoplay.progressiveoverload` (never change it — it is the app's identity).
  `versionCode` = `GITHUB_RUN_NUMBER` (1 locally), `versionName` = `1.0.<versionCode>`.
- `src/main/AndroidManifest.xml`: TWA meta-data (launch URL, colors, splash, portrait) and an
  `autoVerify` link filter for `https://minoplay.github.io/ProgressiveOverload*`.
- Keep `ManageDataLauncherActivity` declared with `MANAGE_SPACE_URL` pointing to the launch URL.
  androidbrowserhelper toggles this component on every launch, even without a site-settings shortcut;
  omitting it crashes the app before Chrome opens.
- `res/values/strings.xml` (names, launch URL, `asset_statements`), `res/values/colors.xml`
  (`theme_color` / `background_color` of `manifest.json`).
- Icon: adaptive vector from `assets/favicon.svg` (`drawable/ic_launcher_*`, `mipmap-anydpi/ic_launcher.xml`).
  Splash: copy of `assets/icon-512.png` (`drawable-nodpi/splash.png`).
- Gradle wrapper pinned to 9.8.2 with `distributionSha256Sum`.
- `android/` is stripped from the Pages deploy (`pages.yml` STRIP list).

## Build & release (`.github/workflows/android.yml`)
- Triggers: push to `main` touching `android/**` or the workflow; `workflow_dispatch`.
- Temurin 17 → keystore secret decoded to `$RUNNER_TEMP` → `./gradlew assembleRelease` →
  GitHub Release `android-v<run>` with asset `ProgressiveOverload.apk`, marked latest.
- Stable link to the newest APK:
  `https://github.com/MinoPlay/ProgressiveOverload/releases/latest/download/ProgressiveOverload.apk`
- Repo secrets: `ANDROID_KEYSTORE_BASE64` (base64 of the `.p12`), `ANDROID_KEYSTORE_PASSWORD`
  (store and key password).

## Signing key
- `~/Keys/ProgressiveOverload/progressive-overload.p12` (PKCS12, alias `progressive-overload`,
  RSA-4096, valid until 2054) + `keystore-password.txt`. NOT in the repo — back both up.
- SHA-256: `8A:64:D7:9D:F5:01:D4:47:5B:9A:C9:92:26:C6:83:90:99:B1:FA:4E:ED:57:88:1F:2D:55:C8:64:96:E5:CD:20`
- Re-upload the secrets (never print the password):
  `base64 -i progressive-overload.p12 | gh secret set ANDROID_KEYSTORE_BASE64`,
  `gh secret set ANDROID_KEYSTORE_PASSWORD < keystore-password.txt`.
- Key lost → new key, new secrets, new fingerprint in `assetlinks.json`, uninstall + reinstall
  (updates only install over an APK signed with the same key). Data lives in Chrome/Supabase, not the app.

## Digital Asset Links (fullscreen)
- Chrome hides the URL bar only when the origin vouches for the app at
  `https://minoplay.github.io/.well-known/assetlinks.json` (package + SHA-256 above).
- The origin root is outside this repo's Pages path → served by the user-site repo
  `MinoPlay/minoplay.github.io` (with `.nojekyll`, so `.well-known/` is published). Don't delete it.
- App side: `asset_statements` in `strings.xml`.

## Install / update (sideload)
1. On the phone open the stable link above → download → open; allow "Install unknown apps" when asked.
2. Updates: install a newer APK over the old one (same key, higher `versionCode`).

## Auth (magic link)
- The TWA uses Chrome's storage for the origin → a session made in Chrome (or a Chrome Custom Tab,
  e.g. Gmail's in-app browser) is also the app's session, and vice versa.
- The magic-link redirect (`emailRedirectTo` = site URL) opens the app when the link is verified,
  otherwise Chrome; either way the session lands in the shared storage. Reopen the app if it still shows login.

## When to rebuild the APK
Only for shell changes: name, icon, colors, launch URL, orientation, SDK/library bumps.
Web code (HTML/JS/CSS, `manifest.json`, `sw.js`) ships via Pages.

## Troubleshooting
- App immediately closes → capture `adb logcat -b crash`. A `Component class ... does not exist`
  error from `setComponentEnabledSetting` can indicate a missing `ManageDataLauncherActivity`
  declaration (the class name is obfuscated in release builds). Verify fixes by installing and
  launching the signed release APK on Android, not just building or checking its signature.
- URL bar visible → asset links not verified: check `assetlinks.json` is live and its fingerprint matches
  the APK signer (`apksigner verify --print-certs`), then relaunch.
- Links open in the browser → `adb shell pm get-app-links io.github.minoplay.progressiveoverload`;
  re-verify with `adb shell pm verify-app-links --re-verify io.github.minoplay.progressiveoverload`.
- "App not installed" on update → APK signed with a different key or not a higher `versionCode`.
- Preview URLs (`/ProgressiveOverload/preview/…`) also match the link filter and open in the app.
