---
id: BUG-011
title: Enemies a full storey below still land melee hits, because chase distance ignores height
severity: major
area: enemies
status: fixed
found-by: testers
devices: [android]
---

## What was reported

> When you get close to the edge you get hit and die even you far away from
> them high

Filed originally as a fall-damage bug, on the reading that approaching a ledge
was hurting the player. That reading was wrong, and checking it before writing
any code is what found the real fault.

## Why it was not fall damage

Fall damage is measured in **time in the air**, not distance:

```js
if(!PL.onGround) PL.wasAir += dt; else PL.wasAir = 0;
...
if(PL.wasAir > 1.25) damagePlayer((PL.wasAir-1.25)*46, null, true);
```

Gravity is 24 m/s^2, so clearing the 1.25 s threshold means falling about
eighteen metres. The upper floor is nowhere near that. No drop inside this arena
can trigger it, so the tester was not being hurt by the fall.

## The actual cause

Re-reading the sentence with the emphasis the tester put on it - hit *even
though far away from them*, and *high* - points at the enemies, and the chase
code explains it exactly:

```js
var toP = _eToP.set(PL.pos.x-e.pos.x, 0, PL.pos.z-e.pos.z);
var dist = toP.length();
```

The Y component is zeroed, so `dist` is purely horizontal, and melee gates on
that same `dist`. A grunt on the ground floor standing under the balcony has a
horizontal gap of nothing. The only other condition is `seesPlayer`, and the
line of sight over the lip of a ledge is clear. So it swings, and it connects,
through four metres of concrete.

The player was also being kept there: an enemy that believes it is in melee
range slows to `moveDir.multiplyScalar(0.12)`, so instead of walking to the
stairs it loitered underneath, hitting upwards.

## The fix

`enemyCanReach()` requires the two bodies to overlap vertically, with enough
tolerance for a step but not for a storey. It gates the damage, the slow-down,
and the boss's melee/ranged switch.

Chase distance stays horizontal on purpose. An enemy below should still walk
towards the player - it just has to use the stairs like everyone else.

## Test

`an enemy cannot claw the player through a floor` in `tests/combat.spec.js`
asserts both directions: a grunt at arm's length must still hurt, and the same
grunt four metres below must not. Verified red without the fix, green with it.
