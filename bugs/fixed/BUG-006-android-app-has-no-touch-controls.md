---
id: BUG-006
title: The Android app shows no on-screen controls, so the game is unplayable
severity: critical
area: input
status: fixed
found-by: game-qa
devices: [android]
---

## Summary

In the packaged Android app the touch UI never appears. `IS_TOUCH` evaluates to
`false`, so `setTouchUI(true)` is a no-op, `#touchUI` stays hidden and the player
is left staring at an arena with no stick, no FIRE button and no pause button.
There is no keyboard on a phone, so the game cannot be played at all — this is a
ship-blocker for the store build.

The cause is the detection rule in `src/js/01-core.js`:

```js
var hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
var coarse = window.matchMedia && window.matchMedia('(pointer:coarse)').matches;
return !!(hasTouch && coarse);
```

An Android WebView does not have to report a coarse pointer. It reports the
pointer of whatever is currently driving the window, which on an emulator — and
on a phone attached to a mouse, or in desktop-mode WebViews — is `fine`. The
touch capability is still there and is still the only way to play.

## Steps to reproduce

1. `npm run android:install` with an emulator or device attached
2. `adb shell am start -n com.overrun.fps/.MainActivity`
3. Tap **Single Player**

## Expected

The on-screen controls appear: `#touchUI` visible, with `#tStick` and `#tFire`.

## Actual

`#touchUI` is hidden. Nothing responds to touch.

## Evidence

Probed inside the installed app on an Android 14 emulator:

```json
{
  "IS_TOUCH": false,
  "maxTouchPoints": 5,
  "ontouchstart": true,
  "coarse": false,
  "anyCoarse": false,
  "hover": false,
  "href": "https://localhost/"
}
```

Touch is plainly available (`maxTouchPoints: 5`, `ontouchstart: true`) and there
is plainly no mouse (`hover: false`), yet the coarse-pointer probe says `false`
and that one signal vetoes everything else.

Failing test: `tests/android.spec.js` › the installed app › *shows the touch
controls, not a keyboard prompt* — `#touchUI` expected visible, received hidden.

## Resolution

`src/js/01-core.js` no longer treats a coarse pointer as the only evidence of a
touch device. Two independent signals now count:

- running under Capacitor is decisive on its own — a packaged app is a phone
- otherwise touch capability plus *either* a coarse pointer *or* the absence of
  hover, since "there is no mouse here" is the thing actually being asked

Requiring touch as well keeps touchscreen laptops, which do report hover, on the
desktop scheme.

Guard tests:

- `tests/smoke.spec.js` › touch detection — three cases (fine-pointer touch
  device, mouse desktop, touchscreen laptop) across all four device projects
- `tests/android.spec.js` › the installed app › shows the touch controls, not a
  keyboard prompt — runs against the installed APK on a real device or emulator
