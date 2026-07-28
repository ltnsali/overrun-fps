# OVERRUN on Android

The Android app is the same game, not a port. Capacitor wraps `www/` — a plain
copy of `index.html`, `src/` and `vendor/` — in a WebView, so there is still no
bundler and no ES modules.

## Why `vendor/` exists

The web build could pull three.js and PeerJS from a CDN. An installed app on a
phone with no signal cannot. Both libraries are therefore committed under
`vendor/` and tried **first**; the CDNs remain as a fallback for the web build
only. `npm run vendor` regenerates them from `node_modules` so the committed
binaries stay reproducible.

## Commands

| Command | What it does |
| --- | --- |
| `npm run vendor` | Refresh `vendor/` from `node_modules`. |
| `npm run www` | Copy `index.html`, `src/`, `vendor/` into `www/`. |
| `npm run android` | `www` + `npx cap sync android`. |
| `npm run android:open` | The above, then open Android Studio. |
| `npm run android:install` | Build and install the debug APK on the attached device. |
| `npm run android:release` | Build a signed release APK. |
| `npm run android:bundle` | Build the `.aab` that Play actually wants. |
| `npm run art` | Regenerate launcher icons, splashes and the store graphics. |
| `npm run store:shots` | Recapture the listing screenshots from the installed app. |
| `npm run test:package` | Serve `www/` with every CDN blocked and play it. |
| `npm run test:android` | Drive the installed app on a device over adb. |

`www/` and the Gradle build output are generated and git-ignored. The native
project under `android/` is committed, because the manifest carries real
decisions.

## What the native shell changes

- **Landscape lock** — `android:screenOrientation="sensorLandscape"` in the
  manifest. The `#rotate` gate stays for the web build.
- **Screen stays on** — `android:keepScreenOn="true"`.
- **Back button** — [src/js/19b-native.js](../src/js/19b-native.js) turns it into
  "up one level": pause mid-match, close a screen, and only exit from the menu.
  Without this, one stray swipe ends the game.
- **Leaving the app pauses it** — otherwise the player returns to a corpse.
  Capacitor fires `appStateChange` without retaining it, and from Android 16 the
  WebView's JavaScript is frozen before the callback gets a turn, so the
  "leaving" event is simply dropped. The handler therefore pauses on *any*
  transition, including the one on the way back in: whichever of the two arrives,
  the player lands on the pause screen rather than in a firefight they cannot see.

Everything in that file is a no-op in a browser; `isNativeApp()` is false and
nothing is bound.

## Edge to edge, and why the bars stay

From API 35 an app can no longer ask the framework to lay out inside the system
bars — the window is always edge to edge and the bars float on top. For a game
whose FIRE button lives in the bottom corner that is not cosmetic: the
navigation bar would sit on the control the player needs most.

The obvious answer is to hide the bars, and it is what most engines do. It does
not work here. **With the system bars hidden, Android consumes the first BACK
press to bring them back** — and BACK is how this game pauses. Measured, not
guessed: with an immersive activity the game stayed in `playing` and the page
saw zero `backButton` events; with a plain activity it reached `paused` on the
first press. Hiding only `navigationBars()` behaved the same way, and the
manifest's `enableOnBackInvokedCallback` made no difference either way.

So the bars stay, and
[MainActivity](../android/app/src/main/java/com/overrun/fps/MainActivity.java)
pads the content view by exactly `systemBars() | displayCutout()` instead — the
behaviour the framework used to provide, asked for explicitly. The padded strip
is painted `#05070c`, the same as `--bg`, so it reads as part of the game rather
than as a white border.

## Versions, signing and the store build

- **The version lives in `package.json`.** `android/app/build.gradle` parses it
  so the web build and the store build cannot disagree about what `1.0.0` means.
  Play needs an integer that only ever goes up, so one is derived: `1.2.3` →
  `10203`. That leaves room for 99 patches and 99 minors per major without
  anyone having to remember to bump a counter.
- **`compileSdk` and `targetSdk` are 36**, `minSdk` 23. Play requires API 35
  today and API 36 from 31 August 2026; targeting 36 now avoids doing this twice.
  That needs AGP 8.9.2 and Gradle 8.11.1, which is why the wrapper moved.
- **Signing material never enters the repository.** Environment variables win, so
  CI can inject them; `android/keystore.properties` is the local fallback and is
  git-ignored. With neither present the release build is simply unsigned, which
  is a loud failure at upload time rather than a silent debug-signed release.

  | Environment variable | `keystore.properties` key |
  | --- | --- |
  | `OVERRUN_KEYSTORE` | `storeFile` |
  | `OVERRUN_KEYSTORE_PASSWORD` | `storePassword` |
  | `OVERRUN_KEY_ALIAS` | `keyAlias` |
  | `OVERRUN_KEY_PASSWORD` | `keyPassword` |

  Generate the upload key once, on the machine that will keep it. Losing it means
  losing the ability to update the app:

  ```
  keytool -genkeypair -v -keystore android/upload-keystore.jks \
          -keyalg RSA -keysize 4096 -validity 10000 -alias overrun-upload
  ```

- **Remote WebView debugging is not forced on.** Capacitor defaults
  `webContentsDebuggingEnabled` to the build's debuggable flag, so debug builds
  are inspectable (which is what lets Playwright attach) and release builds are
  not. Setting it explicitly in `capacitor.config.json` would have shipped an
  inspectable WebView to players.

## Artwork and store assets

Nothing here is drawn by hand, so nothing here can drift.

- `npm run art` renders the launcher icon at all five densities, the adaptive
  icon's foreground layer at 108dp, the portrait and landscape splashes, a
  512×512 store icon and the 1024×500 feature graphic. The adaptive icon's
  background is the flat colour in
  `android/app/src/main/res/values/ic_launcher_background.xml`.
- `npm run store:shots` drives the **installed app** on an attached device and
  captures the menu, a live wave, a firefight, the pause screen and the
  multiplayer lobby. Play refuses a screenshot whose long side is more than twice
  its short one, and a Pixel 5 framebuffer is 2340×1080 — just over the line — so
  each capture is fitted onto a 16:9 canvas rather than cropped into the HUD.
- Every answer the Play Console asks for is written down in
  [store/listing.md](../store/listing.md), and the privacy policy it links to is
  [privacy.html](../privacy.html), served from GitHub Pages alongside the game.

## Testing

Three layers, in increasing cost:

1. `npm test` — the browser suite. Fast, hermetic, proves the game logic.
2. `npm run test:package` — serves the exact bytes that go into the APK with
   `cdnjs`, `jsdelivr`, `unpkg` and friends aborted at the network layer. This
   catches the one bug this pipeline can produce that no other test can: a file
   that never made it into the copy. **Runs on any machine.**
3. `npm run test:android` — attaches Playwright to the app's WebView over adb
   and plays it on real hardware: real GPU, real touch, real back button, real
   orientation lock. Skips itself when no device is attached.

Layer 3 needs, on the developer's machine:

- JDK 17+
- Android Studio, or the command-line SDK plus platform-tools (`adb`) on `PATH`
- a device with USB debugging enabled, or a running emulator
- the debug APK installed (`npm run android:install`)

Debug builds enable WebView debugging, which is what lets Playwright attach.
Release builds do not, by design.

### A toolchain without Android Studio

Android Studio is a convenience, not a requirement, and it needs an installer.
The command-line SDK does not — it unzips into a user directory, so it works
without administrator rights:

1. Unzip a Temurin JDK 17 and `commandlinetools-win-<build>_latest.zip`. The
   SDK expects the tools at `<sdk>/cmdline-tools/latest/`, one level deeper
   than the zip lays them out.
2. `sdkmanager platform-tools "platforms;android-36" "build-tools;36.0.0" emulator "system-images;android-36;google_apis;x86_64"`
3. Set `JAVA_HOME` and `ANDROID_HOME`, and put `platform-tools` on `PATH`.
4. `avdmanager create avd -n overrun -k "system-images;android-36;google_apis;x86_64" -d pixel_5`
5. `emulator -avd overrun -no-snapshot -no-boot-anim -no-audio`

Gradle finds the SDK through `android/local.properties`, which is generated and
git-ignored.

### What an emulator is and is not

An emulator is a real device for the purposes of this suite — real WebView,
real lifecycle, real touch dispatch — with three differences the tests account
for explicitly:

- **The GPU is SwiftShader.** WebGL is genuinely live, but the renderer string
  names a software rasteriser, so the "not a software rasteriser" assertion is
  skipped when `ro.build.characteristics` says `emulator`.
- **A backgrounded WebView is frozen.** `waitForFunction` cannot poll a page
  that is not being scheduled, so lifecycle tests background the app, wait, then
  foreground it *before* asserting.
- **`am force-stop` is not how apps die.** Android flushes WebView storage when
  the activity pauses; killing a foreground process skips that flush and loses
  the last writes. Cold-restart tests press HOME first, like a person would.

## Not done yet

- An upload keystore. The build is wired for one; nobody has generated it yet.
- Multiplayer over cellular. P2P works on Wi-Fi; carrier-grade NAT frequently
  defeats it. The fix is to host `server/relay.js` behind `wss` and point the
  Android build at it — the transport switch already exists in `mpEnterArena`.
- The closed test that new Play developer accounts must run before production.
