---
id: BUG-009
title: The touch buttons sit in the two places a thumb has to move, so aiming fires, swaps and throws grenades
severity: major
area: controls
status: open
found-by: testers
devices: [android]
---

## Summary

Five of the eight closed-test testers reported the same thing independently: they
cannot turn the camera without triggering something. One put it plainly - "every
time I try to move the camera, I accidentally press swap and frag" - and another,
who plays shooters seriously, said the crowding also makes it "really hard to pan
around with the camera on that side".

This is not a matter of taste, and it is not a phone-size problem. It follows
from the layout in [src/styles/touch.css](../../src/styles/touch.css), which puts
seven touch targets into the bottom-right corner:

| Button | Position | Size |
| --- | --- | --- |
| `#tFire` | right 20, bottom 20 | 96 x 96 |
| `#tAds` | right 128, bottom 28 | 66 x 66 |
| `#tMelee` | right 206, bottom 22 | 54 x 54 |
| `#tJump` | right 34, bottom 126 | 66 x 66 |
| `#tReload` | right 126, bottom 106 | 62 x 62 |
| `#tNade` | right 206, bottom 88 | 54 x 54 |
| `#tSwap` | right 206, bottom 154 | 54 x 54 |

That is roughly a 260 x 210 block of live controls occupying the exact region the
right thumb must drag across to look around. Any pan that starts low and travels
left crosses SWAP, NADE or MELEE on the way.

The left side has the same fault in miniature: `#tCrouch` is at left 18, bottom
18, directly under the thumb that works the movement stick, which is why a tester
reported crouching while trying to walk.

## Steps to reproduce

On a phone, start a wave and try to make a wide leftward camera sweep beginning
near the bottom-right corner - the natural motion when something flanks you.
The drag will pass over at least one of SWAP, NADE and MELEE and fire it.

## Why it matters more than it looks

Aiming is the verb of this game. A control layout that punishes the aiming
gesture makes the whole thing feel broken even though nothing has crashed, which
is exactly what the feedback says: the same testers called the mechanics "solid"
and "excellent" in the same message they complained about the buttons.

## What testers asked for

- Smaller buttons; the HUD "takes quite a large chunk of the screen"
- The ability to move the buttons themselves - three separate people asked
- Aim assist, on the grounds that mobile shooters normally have it

The first two are the fix. Aim assist is a separate design decision and is
tracked as an improvement, not part of this.
