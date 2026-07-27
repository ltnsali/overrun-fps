---
id: BUG-004
title: A host that is proven to be there is abandoned for another slot, splitting the room
severity: critical
area: gameplay
status: fixed
found-by: game-qa
devices: [desktop]
---

## Summary

A player joining a room that already had a host ended up hosting a different slot of the
same room instead. Two players, one room code, two arenas, a sparring bot each. Same
symptom as BUG-002 and BUG-003, third distinct cause - and this time the client had
positive proof the slot was occupied and walked past it anyway.

## Steps to reproduce

Only reproducible against the deployed site over real WebRTC.

1. `npm run test:live -- --retries=0`
2. Watch `online arenas on the deployed site › a player who leaves disappears from the arena`
3. Intermittent: it needs the host to be slow to answer, which is what happens when its tab
   is in the background.

## Expected

The joiner connects to the existing host and both stand in one arena.

## Actual

```
GONE {"state":"playing","kind":"p2p","slot":0,"host":true,"sees":[],"bots":1}
STAY {"state":"playing","kind":"p2p","slot":1,"host":true,"sees":[],"bots":1}
```

## Evidence

`NET.trace` from the failing run, which is what made the cause obvious rather than guessed:

```
GONE  31997ms pass 0 for room 3NF41410
      32118ms join 0 no answer
      32188ms claim 0 ok                      <- GONE is the host of slot 0

STAY  62063ms slot 0 try
      65581ms join 0 no answer                <- 3.5s, no answer at all
      65667ms claim 0 failed unavailable-id   <- proof GONE owns slot 0
      66277ms slot 0 try (retry 1)
      69788ms join 0 no answer                <- 3.5s again
      69862ms claim 0 failed unavailable-id
      70467ms slot 0 try (retry 2)
      73970ms join 0 no answer
      74040ms claim 0 failed unavailable-id
      74648ms slot 0 try (retry 3)
      78159ms join 0 no answer
      78231ms claim 0 failed unavailable-id
      78231ms slot 0 looks dead - stepping over
      78403ms claim 1 ok                      <- and the room is now two arenas
```

Every join gave up at the 3.5 s mark having received nothing - not one of them got far
enough for the "somebody answered, be patient" extension to apply. Meanwhile every claim
said `unavailable-id`, which is the signalling server stating plainly that the slot is
taken.

## Resolution

- **Root cause, two halves:**
  1. `mpP2PTryJoin()` used the short `MP_JOIN_MS` probe deadline on *every* attempt. That
     deadline exists so an empty room fails fast, but a live host whose tab is in the
     background answers more slowly than that, so the joiner never heard back. The existing
     extension to `MP_HANDSHAKE_MS` only helped once an answer had already arrived, which
     is precisely what never happened.
  2. `mpP2PSlot()` then stepped over the slot even though `unavailable-id` had proved four
     times over that it was occupied.
- **Change:** `mpP2PTryJoin()` takes a `patient` flag and starts on the long deadline when
  set; `mpP2PSlot()` sets it for every retry, since a retry only happens after a failed
  claim has proved somebody is on the slot. And a slot that reports `unavailable-id` is now
  never stepped over: if the owner still cannot be reached the player is told
  "The arena host is not answering. Give it a moment and try again." Hosting a private
  arena under the same room code is worse than an honest error.
- **Guarded by:** `tests/multiplayer.spec.js` -g "a host that is proven to be there is
  never abandoned for another slot", plus the live tests.
