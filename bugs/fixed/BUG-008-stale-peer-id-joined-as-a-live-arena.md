---
id: BUG-008
title: A peer id that outlived its owner is joined as an arena, stranding the player alone
severity: major
area: multiplayer
status: fixed
found-by: user
devices: [desktop]
---

## Summary

Pressing Enter Arena on the default room connected in under two seconds, started the match,
and showed the player as online - in an arena with nobody in it, forever. The "host" was a
registration on the public signalling server that had outlived the tab that made it. It
answered the offer and opened a data channel, and then never said another word.

This is worse than a refusal. A refusal can be acted on; a match that calls itself online
and never fills up just looks like nobody else plays this game.

## Steps to reproduce

Against the deployed site, with a stale registration on `overrun-v1-ARENA` - which is what
the previous run of the Android app left behind:

1. Open `https://ltnsali.github.io/overrun-fps/?room=ARENA`
2. Press Enter Arena.

## Expected

Either a live arena with other players in it, or an honest failure.

## Actual

```
{"kind":"p2p","host":false,"state":"playing","sees":0,
 "trace":["1225ms pass 0 for room ARENA","1225ms slot 0 try","1754ms join 0 ok"]}
```

`join 0 ok` after half a second, then twenty seconds of nothing. `sees: 0` and an empty
roster, with the HUD reporting a normal online match.

## Cause

`mpP2PTryJoin` treated `conn.on('open')` as proof of an arena. An open data channel only
proves that a `RTCPeerConnection` was negotiated with something; it says nothing about
whether that something is still running the game.

The same blind spot also poisoned the room for everybody else: the slot could not be
claimed, because the dead registration still owned the id, so no new host could take over.

## Fix

An open channel is no longer enough. Every live player broadcasts a snapshot fifteen times
a second, so the join now waits for the first message before it accepts the connection -
`MP_ALIVE_MS`, 2.5 seconds. Silence means the slot is dead, the join fails, and the normal
path takes over and claims the slot instead. The message that proved the host is alive is
passed to `mpRecv` rather than dropped on the floor.

## Guard tests

`tests/multiplayer.spec.js › an arena that will not connect`

- `a host that opens a channel and then says nothing is not an arena` - the slot can be
  claimed, so the player ends up hosting; asserts `NET.peers` is empty rather than
  pretending.
- `a dead host on an id we cannot take is refused, not faked` - the id is taken as well, so
  the only honest outcome is a refusal with a readable reason.
- `a live host is joined and its players show up` - the guard against overcorrecting: a
  host that does speak is still joined, and the first message is not lost.

The first two fail before the fix; the third passes before and after.
