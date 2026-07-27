---
id: BUG-003
title: A slot claim that times out is mistaken for a free slot, so two players host the same room
severity: critical
area: gameplay
status: fixed
found-by: game-qa
devices: [desktop]
---

## Summary

Two players entering the same fresh room both ended up hosting - one on slot 0, one on
slot 1 - each alone with a sparring bot. Same room code, same link, two arenas. This is the
same symptom as BUG-002 but a different cause, and it survived that fix: it needs only two
players, so there is no contention involved at all.

## Steps to reproduce

Only reproducible against the deployed site over real WebRTC.

1. `npm run test:live -- --retries=0`
2. Watch `online arenas on the deployed site › both players build the same arena from the
   room code`
3. Intermittent - it depends on the signalling server being slow to answer a claim, so it
   may take a few runs.

## Expected

One player hosts, the other joins it, both on the same slot, each seeing the other.

## Actual

```
MAPA {"state":"playing","kind":"p2p","slot":0,"host":true,"sees":[],"bots":1,"err":""}
MAPB {"state":"playing","kind":"p2p","slot":1,"host":true,"sees":[],"bots":1,"err":""}
```

## Evidence

- Failing live test: `tests/live.spec.js` -g "both players build the same arena from the
  room code" (live run: 1 failed, 24 passed)
- Reproduced locally after the fact by stubbing a claim that neither opens nor errors:
  `Expected: 0, Received: 1` - the client hosts the next slot.

## Resolution

- **Root cause:** `mpP2PTryClaim()` reports the reason a claim failed, but its
  `MP_CLAIM_MS` timeout path reports an empty reason, because no PeerJS error ever fired.
  `mpP2PSlot()` only went back to rejoin a slot when the reason was exactly
  `unavailable-id`, so a claim that merely timed out - the signalling server being slow or
  rate-limiting us - fell through to "this slot is a ghost, step over it" and the client
  hosted the next slot of the same room.
- **Change:** `mpP2PSlot()` in `src/js/14-multiplayer.js` now retries the same slot after
  **any** failed claim, not just `unavailable-id`. Failing to take a slot is never evidence
  that the slot is free; only after the retries are exhausted do we accept that it is a
  dead registration and step over it. Genuine network-down cases still bail out early via
  `_p2pDown`, so this does not make an offline player wait.
- Added `NET.trace`, a short log of which slots were joined, claimed or stepped over. A
  peer-to-peer mesh has no server log, so a live split previously left nothing to read; the
  live snapshot now reports the whole decision path.
- **Guarded by:** `tests/multiplayer.spec.js` -g "a claim that times out is not mistaken
  for a free slot", plus the live test above.
