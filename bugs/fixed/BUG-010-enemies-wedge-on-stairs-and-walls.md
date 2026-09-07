---
id: BUG-010
title: Enemies take the shortest path and wedge themselves on the stair corner and on walls
severity: major
area: enemies
status: fixed
found-by: testers
devices: [android]
---

## Summary

Two testers, independently, watched enemies get stuck on level geometry and stay
stuck:

> "When you go to the 2nd floor in the middle, the enemy gets stuck in the corner
> by the steps."

> "Sometimes the enemy would be stuck behind a wall while trying to get to me.
> They try to come in the shortest path, making them stuck."

The second report names the cause: pursuit steers straight at the player rather
than around what is in the way, so any concave corner holds an enemy until the
player moves.

## Steps to reproduce

Go to the middle of the second floor and let a wave path towards you past the
steps. At least one enemy stops in the corner and stays there.

## Why it matters

A wave that cannot end is worse than a hard wave. The player is left walking the
arena hunting for a stuck body, which reads as the game being broken rather than
difficult - and it wastes the goodwill of a player who was otherwise enjoying it.

Neither tester could finish the wave normally when it happened.

## Not yet established

Whether the two reports are the same defect. The stairs case may be a height or
step-climb failure rather than a pathing one; the wall case is clearly steering.
Worth confirming before fixing, because a fix for one may not touch the other.

## Fix

Avoidance was re-deciding from scratch every frame: at a corner the direct line
reads clear for one frame, the body turns in, re-blocks, and dithers on the
spot. It is now wall-following - once blocked it picks a side and holds it, and
only returns to the direct line when a look-ahead twice as long as the block
probe is clear. `pathClear()` samples along the segment rather than one point
ahead, because a clear point says nothing about the gap in between. An enemy
that can see the player will not turn more than 1.75 rad, or it walks off
downfield instead of closing.

Measured on the arena's central block: before, 8.8 m travelled in eight seconds
while grinding along one face; after, it rounds the corner and keeps going.

## What this does not do

There is still no pathfinding. Local steering cannot circumnavigate an eighteen
metre building, and this change does not pretend to - it stops a body wedging
and keeps it moving, which is what was reported. Routing around large structures
would need a navigation mesh and is a separate piece of work.

## Test

`an enemy behind cover works its way round instead of wedging` asserts it never
stalls for half a second, covers real ground, and gets past the face it started
on. Verified red without the fix.

