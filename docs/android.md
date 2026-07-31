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

  The two store graphics have **opposite** rules and it is worth knowing why the
  code looks inconsistent: Play requires the icon to be a 32-bit PNG *with* an
  alpha channel, and the feature graphic to be JPEG or 24-bit PNG with *no*
  alpha. A `<canvas>` always encodes PNG as RGBA, so the feature graphic is
  written as JPEG - the one format that cannot carry alpha.
- `npm run store:shots` drives the **installed app** on an attached device and
  captures the menu, a live wave, a firefight, the pause screen and the
  multiplayer lobby. Play refuses a screenshot whose long side is more than twice
  its short one, and a Pixel 5 framebuffer is 2340×1080 — just over the line — so
  each capture is fitted onto a 16:9 canvas rather than cropped into the HUD.

  Large screens get their own set, captured the same way from a Pixel Tablet
  emulator rather than reusing the phone images:

  ```
  SHOT_DIR=screenshots-tablet npm run store:shots
  ```
- Every answer the Play Console asks for is written down in
  [store/listing.md](../store/listing.md), including the technical requirements
  checked against the official pages rather than assumed. The privacy policy it
  links to is [privacy.html](../privacy.html), served from GitHub Pages alongside
  the game.

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

## Getting onto Play

Every answer the Console asks for is in [store/listing.md](../store/listing.md).
This section is the other half: the order things have to happen in, and which
step is waiting on which. Verified against the official pages on 30 July 2026.

The shape of it is unusual and worth stating plainly: **the code is not the long
pole.** A personal developer account cannot publish to production until it has
run a closed test with twelve people for a fortnight, so the calendar is set by
recruiting testers, not by finishing features.

### The account

Registration is a Google account, the Developer Distribution Agreement, and a
**one-off US$25 fee** — credit or debit card, no prepaid cards. You must be 18.
<https://support.google.com/googleplay/android-developer/answer/6112435>

Then you pick **personal** or **organisation**, and the choice is consequential:

- **Personal** is the right answer here — hobbyist, no company behind it. It
  verifies with an official government identity document, and Play publishes
  your legal name and country on the listing.
- **Organisation** needs a **D-U-N-S number** from Dun & Bradstreet, which is
  free but *"can take up to 30 days"*. You cannot create an organisation account
  without one.
  <https://support.google.com/googleplay/android-developer/answer/13628312>

Nothing can be submitted while verification is pending: *"You must verify your
developer account before you can submit apps for consideration on Google Play."*
<https://support.google.com/googleplay/android-developer/answer/10841920>

New personal accounts also have to prove they own an Android device, by signing
into the Play Console **mobile** app on a non-rooted physical device running
Android 10 or later and tapping Verify. An emulator will not do. It takes under
a minute, but it is a hard gate on making the app available.
<https://support.google.com/googleplay/android-developer/answer/14316361>

### The closed test, which is the long pole

Personal accounts created after **13 November 2023** must run a closed test
before they may publish to production. The rule, exactly:

> you must run a closed test for your app with a minimum of **12 testers** who
> have been **opted-in for at least the last 14 days continuously**.

Production and pre-registration are simply disabled in the Console until this is
met, and open testing is unavailable too — it is gated behind having production
access, so it cannot be used as a shortcut. Internal testing has no requirement
at all, and closed testing only needs the app's setup finished.
<https://support.google.com/googleplay/android-developer/answer/14151465>

Three details that cost people a fortnight if they get them wrong:

- **Continuously** means what it says. Google's own FAQ: testers who opt in,
  test for a few days, drop out and come back do not count — *"these 14 days
  must be consecutive"*. One person leaving the Google Group on day 10 resets
  that person's clock, not the group's.
- **The count is checked when you apply**, not averaged over the fortnight. Nine
  testers on the day you press the button is a rejection.
- Engagement is judged, not just presence. The application asks you to describe
  what testers did and what you changed as a result, and Google names *"your
  testers not being engaged with your app during your closed test"* as a reason
  to be sent back round. Twelve friends who install and never open it is a
  plausible failure mode for a game nobody has to sign into.

The requirement is written against personal accounts only; organisation accounts
are not covered by it. That is not a reason to create one — the D-U-N-S wait is
roughly the same fortnight, and it comes with a company's paperwork.

Applying for production access is a three-part form about the test, the game and
its readiness. Review *"usually takes 7 days or less, but may occasionally take
longer"*.

### The order, and what blocks what

1. **Create the account, pay, verify identity, verify the device.** Blocks
   everything. Do it first, before the build is finished, because it is the step
   with a queue in it.
2. **Generate the upload keystore** (see above) and produce a signed `.aab`.
   Blocks any upload.
3. **Create app** in the Console — name, app-or-game, free-or-paid, contact
   email, the policy declarations. Cheap and instant.
   <https://support.google.com/googleplay/android-developer/answer/9859152>
4. **App content** — privacy policy URL, ads declaration, app access, target
   audience, content rating questionnaire, data safety, news. Blocks *any*
   release, including a closed test.
   <https://support.google.com/googleplay/android-developer/answer/9859455>
5. **Store listing** — title, descriptions, icon, feature graphic, screenshots,
   category, contact details, countries. Blocks any release.
6. **Upload to closed testing and start the 14-day clock.** This is the moment
   the calendar starts. Everything after it is waiting.
7. **Apply for production access** on the Dashboard once twelve testers have
   held for fourteen days. Up to a week.
8. **Roll out to production.** The release itself is reviewed as normal —
   standard publishing is *"as soon as possible"*, but *"certain apps may be
   subject to extended reviews, which may result in review times of up to 7 days
   or longer in exceptional cases"*.
   <https://support.google.com/googleplay/android-developer/answer/9859751>

Steps 3–5 are an evening. Steps 1, 6 and 7 are the schedule: realistically about
three weeks from a standing start to a live listing, of which roughly two are
the closed test and most of the rest is review.

The Console distinguishes errors from warnings on the release summary: errors
must be cleared before publishing, warnings and minor issues do not block. There
is also a set of **pre-review checks** that run automatically on the Publishing
overview whenever you change something; some are blocking, some can be waved
past with a reason — but waving one past does not make it safe, because *"if the
issue makes your app non-functional, it might be rejected during review"*.
<https://support.google.com/googleplay/android-developer/answer/14807773>

## The pre-launch report, and why ours will look bad

Uploading a bundle triggers an automated crawl on real devices in Google's test
lab: install, launch, and a few minutes of typing, tapping and swiping, on a set
of phones and tablets running Android 9 and above. Results come back within an
hour or so, split into Stability, Performance, Accessibility and Screenshots.
<https://support.google.com/googleplay/android-developer/answer/9842757>

None of it blocks a release. All of it is worth reading once, and most of what it
says about this game can be predicted now.

**The crawler cannot play the game, and Google says so.** The report's own
guidance is that *"if you're testing a game or an app that uses OpenGL, you need
to provide a game loop to get a good pre-launch report"*. Everything here happens
inside a WebGL canvas, and the touch controls are `<div>`s in a WebView, not
Android widgets. The realistic outcome is a crawl that reaches the main menu and
stops, near-identical screenshots across every device, and a Stability tab that
is green because nothing was exercised rather than because nothing is wrong.
Green here means *untested*, not *tested*. Treat it as a smoke test that proves
the bundle installs and starts on hardware we do not own — which is genuinely
worth having, and is all it is.

**Accessibility will complain, and some of it is fair.** The report flags content
labelling, touch target size, implementation and low contrast. A WebView exposes
its DOM to the accessibility tree, so the on-screen controls are visible to it:
`#tStick` and `#tKnob` carry no text at all, `#tPause` is labelled `II`, and the
minimap `<canvas>` has no name. Those are real findings — a `role="button"` and
an `aria-label` on the touch layer would answer them and cost nothing. Low
contrast warnings on the deliberately dim HUD, and any complaint about the canvas
itself being unlabelled, can be ignored: the canvas is the game, and it is not
playable by a screen reader in any case.

**Performance numbers will be missing.** Average frames per second *"is only
available for tests using game loops"*, so the one metric that would actually
mean something for this app is the one that will be blank. CPU and memory will be
reported from a menu screen.
<https://support.google.com/googleplay/android-developer/answer/9844487>

**Crashes found here do not count against us.** *"Since crashes found while
generating a pre-launch report come from test devices, they don't affect your
crash statistics."* Anything the crawler does manage to break is free
information.

## What Play measures once people are playing

Two things carry real consequences.

**Android vitals.** Crash and ANR rates are *core vitals*, and exceeding a bad
behaviour threshold means Play *"may reduce the visibility of your title"* and
*"may also show users a warning on your store listing"*. The thresholds:

| Core vital | Overall | Per phone model |
| --- | --- | --- |
| User-perceived crash rate | 1.09% | 8% |
| User-perceived ANR rate | 0.47% | 8% |

<https://developer.android.com/topic/performance/vitals>

The ANR number is the one to watch for this app. An ANR is the main thread not
responding, and a WebView game holds the main thread through every frame of a
software-rasterised device's misery. The emulator's SwiftShader path is a
reasonable proxy for the slowest hardware that will install this.

**Large screens.** Google replaced the large screen app quality guidelines with
*adaptive app quality guidelines*, graded in tiers: Tier 3 runs full screen
without letterboxing, Tier 2 adds layouts optimised per screen size, Tier 1 is
per-device design. Tier 2 is the level described as *"an excellent user
experience on all Android devices"*, and the listed test sizes are an 8" tablet
at 1024×640 dp, a 10.5" tablet at 1280×800 dp and a 13" Chromebook at 1600×900
dp. A single scaling canvas plus a HUD sized from `viewW()`/`viewH()` gets Tier 3
essentially for free; Tier 2 would mean laying the touch controls out for a
tablet's reach rather than scaling a phone's.
<https://developer.android.com/docs/quality-guidelines/large-screen-app-quality>

There is a sharper edge hiding in this. From Android 16, for apps targeting API
36, **`android:screenOrientation` is ignored on displays of at least sw600dp** —
`sensorLandscape` included — along with `resizeableActivity` and the aspect ratio
attributes. The documented exception is *games, identified by the
`android:appCategory` flag*, and our manifest does not set `appCategory` at all.
So on an Android 16 tablet the landscape lock is currently a no-op, and a player
holding the tablet in portrait gets the `#rotate` gate instead of the game — the
one screen the native build was never supposed to show. `android:appCategory="game"`
on `<application>` is the intended fix and is a one-line manifest change; the
`PROPERTY_COMPAT_ALLOW_RESTRICTED_RESIZABILITY` opt-out exists but is explicitly
temporary and stops working at API 37.
<https://developer.android.com/about/versions/16/behavior-changes-16>

This also means the tablet screenshots and the tablet half of the pre-launch
report should be checked on an **Android 16** tablet image specifically. On
API 34 the lock still holds and the problem is invisible.

## Not done yet

- A Play Console developer account. Nothing below can start without one, and it
  is the step with a queue in it.
- An upload keystore. The build is wired for one; nobody has generated it yet.
- Multiplayer over cellular. P2P works on Wi-Fi; carrier-grade NAT frequently
  defeats it. The fix is to host `server/relay.js` behind `wss` and point the
  Android build at it — the transport switch already exists in `mpEnterArena`.
- The closed test that new Play developer accounts must run before production:
  twelve testers, fourteen continuous days. Recruiting is the work; start it
  before the build is finished.
- `android:appCategory="game"` on `<application>`. Without it the landscape lock
  is ignored on Android 16 tablets, as above.
- Labels on the touch layer — `role="button"` and `aria-label` on `#tStick`,
  `#tKnob` and the `tbtn` divs. Cheap, and it is most of what the pre-launch
  report's accessibility tab will find.
