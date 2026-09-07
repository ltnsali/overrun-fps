---
id: BUG-010
title: Enemies take the shortest path and wedge themselves on the stair corner and on walls
severity: major
area: enemies
status: open
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
