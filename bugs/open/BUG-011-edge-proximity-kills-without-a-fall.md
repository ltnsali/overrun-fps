---
id: BUG-011
title: Standing near a ledge kills the player from a height that should be survivable
severity: major
area: player
status: open
found-by: testers
devices: [android]
---

## Summary

> "When you get close to the edge you get hit and die even you far away from
> them high"

A tester reported taking damage and dying by approaching a ledge, while the drop
below was far enough away that it should not have applied. The report is terse
and the exact ledge is not named, so the trigger has to be found before it can be
fixed.

## What it is probably not

Ordinary fall damage on landing. The tester says it happens on getting *close to*
the edge, not on landing from it, which points at either the fall-damage check
reading a distance to a surface the player never touches, or the player's capsule
clipping the edge and registering a fall that never happens.

## Steps to reproduce

Not yet reduced. Walk to the edges of the upper floor and approach each one
slowly; watch for health loss without a fall.

## Why it matters

Dying to a rule the player cannot see is the fastest way to make an arena feel
unfair, and it happens in the part of the map the same testers said they enjoyed
most - one specifically praised the stairs.
