---
id: BUG-002
title: A busy host is abandoned after one retry, splitting a deathmatch room into two arenas
severity: critical
area: gameplay
status: fixed
found-by: game-qa
devices: [desktop]
---

## Summary

Three players who pressed Enter Arena at the same moment did not all meet. Two of them
landed in one arena and the third sat alone in its own, with a sparring bot, believing it
was hosting the room. The room code was the same for all three. Deathmatch against other
people is the whole game, so a player silently getting a private arena is as bad as the
game not working at all.

## Steps to reproduce

Only reproducible against the deployed site over real WebRTC - the local suite stubs the
transport, so the timing that causes it cannot occur there.

1. `npm run test:live`
2. Watch `online arenas on the deployed site › three players entering an empty room at once
   land in one arena`
3. The room must be **fresh**. A room that already has a host absorbs everyone and hides
   the race entirely.

## Expected

All three players end up in one arena: the same `NET.slot`, exactly one host, and each
player sees the other two.

## Actual

```
ONE {"state":"playing","kind":"p2p","slot":0,"host":true, "sees":["TWO"],"bots":0}
TWO {"state":"playing","kind":"p2p","slot":0,"host":false,"sees":["ONE"],"bots":0}
TRE {"state":"playing","kind":"p2p","slot":1,"host":true, "sees":[],     "bots":1}
```

## Evidence

- Failing live test: `tests/live.spec.js` -g "three players entering an empty room at once"
- All three claimed slot 0. ONE won the peer id, so **two** losers (TWO and TRE) were told
  `unavailable-id` and went back to join ONE at the same time. Only one retry was allowed,
  so the loser whose single offer arrived while ONE was busy with the other gave up on a
  slot it had just been told was occupied, and hosted slot 1 instead.
- The two-player version of this test never caught it, because two players produce only one
  loser and therefore no contention on the retry.

## Resolution

- **Root cause:** `mpP2PSlot()` allowed exactly one rejoin after `unavailable-id`. With more
  than two players entering at once there are multiple losers knocking on the same host, so
  a single missed offer was enough to make a client step over a slot it knew was owned -
  and hosting the next slot of the same room is precisely a room split.
- **Change:** `MP_REJOIN_TRIES` (3) and `MP_REJOIN_MS` (600 ms) in
  `src/js/14-multiplayer.js`; the loser now knocks several times before giving up, still
  bounded so a slot pinned by a dead registration is eventually stepped over.
- **Guarded by:** `tests/multiplayer.spec.js` -g "a busy host is knocked on again rather
  than abandoned for the next slot", plus the live test above.
