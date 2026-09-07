---
id: TASK-002
title: Revisit hiding the Android system bars, now that players notice the strip
severity: minor
area: android
status: wontfix
found-by: testers
devices: [android]
tracked-as: https://github.com/ltnsali/overrun-fps/issues/6
---

## What people see

> "Good game bro. The mechanics are excellent. There's only one problem: it
> doesn't cover the whole screen. As you can see, the top tab is visible."

Reported by a closed-test tester with a screenshot, and confirmed on the
developer's own device: the notification bar sits above the game the whole time
it is running. To a player this reads as the game failing to go fullscreen.

## Why it is like that

This is not an oversight. [MainActivity.java](../../android/app/src/main/java/com/overrun/fps/MainActivity.java)
does it deliberately and says why: from API 35 the window is always edge to edge
and the bars float on top, so the app either insets its content or lets the
navigation bar sit on the FIRE button in the bottom corner. It insets, and paints
the strip `#05070C` to match the game background.

Hiding the bars was rejected for a specific reason. With the bars hidden, Android
consumes the first BACK press to bring them back - and BACK is how this game
pauses. [src/js/19b-native.js](../../src/js/19b-native.js) makes `pauseGame()`
the first thing the `backButton` listener does while playing, so swallowing that
press means a player who presses BACK mid-fight keeps taking damage while the
status bar slides in.

Note also that `goFullscreen()` in [src/js/03-input.js](../../src/js/03-input.js)
is not the lever here. The Fullscreen API applies to the WebView's own document;
it does not touch the Android system bars, so no amount of work on the web side
will remove that strip.

## What a fix has to preserve

Any change here is only acceptable if, on a real device:

1. The first BACK press while playing still pauses. Not the second.
2. The navigation bar does not overlap FIRE, and the display cutout does not
   cover the HUD on a notched phone.
3. Coming back from the recents screen or a phone call does not leave the bars
   stranded on top of the game.

The likely shape is `WindowInsetsControllerCompat.hide(Type.systemBars())` with
`BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE`, plus taking BACK through
`OnBackPressedDispatcher` so the pause still fires on the first press. That
combination is worth measuring rather than assuming - the swallowed-BACK
behaviour is what drove the current design, and it has to be shown to be gone,
not hoped away.

## Worth weighing

The strip costs a little screen and looks unfinished. Losing the pause on the
first BACK press costs the player a death. If the two cannot both be had, the
current trade is the right one and this should be closed as declined rather than
half-fixed.


## Outcome: the existing behaviour stands, now with evidence

The alternative was implemented and measured rather than argued about.
`MainActivity` was changed to hide the bars and reveal them on a swipe, using the
modern API rather than the legacy immersive flags:

```java
bars.setSystemBarsBehavior(
        WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
bars.hide(WindowInsetsCompat.Type.systemBars());
```

The reasoning was sound on paper: `BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE` reveals
the bars on a *swipe*, so it should leave BACK alone - unlike the legacy flags the
original comment was written against.

It does not. The Android suite failed on:

```
the back button pauses the match instead of closing the game
  TimeoutError: window.G.state === 'paused'
```

The first failure was on a cold emulator, so it was re-run twice more on a warm
one and failed both times; reverting put the suite straight back to 16/16. The
system still swallows the first BACK press while the bars are hidden.

BACK is how this game pauses. Trading a reliable pause for a 24-pixel strip is a
bad deal, because a player who cannot pause loses the round.

Worth revisiting only if a future Android release genuinely decouples BACK from
bar visibility - and then with a device run attached, not on the strength of the
documentation.

