---
id: BUG-007
title: Entering an arena hangs for over a minute with no message when the network blocks a direct connection
severity: critical
area: multiplayer
status: fixed
found-by: user
devices: [android, desktop]
---

## Summary

A player hosted a deathmatch from the installed Android app and a second player pressed
Enter Arena in a browser. The browser sat in the lobby saying `FINDING PLAYERS IN …` and
never went anywhere. No error, no timeout the player could see, no way to tell whether it
was still trying. The reporter's words: "I have clicked the multiplayer but then I could
not enter the room."

The direct connection genuinely could not be made - the two peers were on networks that do
not permit it. That is allowed to happen. Hanging silently for a minute and a half is not.

## Steps to reproduce

1. Enter an arena in the Android app, on a network that does not allow peer-to-peer
   (mobile data, an office network, or an emulator behind QEMU's NAT).
2. On another machine, open the same room in a browser and press Enter Arena.

## Expected

Within a few seconds: an explanation of what went wrong, the lobby still open, and
Enter Arena ready to try again.

## Actual

`NET.trace` from the joining browser, with the app hosting room `R6U3B3`:

```
1462ms  pass 0 for room R6U3B3
1462ms  slot 0 try
17170ms join 0 no answer
17453ms claim 0 failed unavailable-id
18220ms slot 0 try (retry 1)
42515ms join 0 no answer
42810ms claim 0 failed unavailable-id
43473ms slot 0 try (retry 2)
```

`NET.err` was empty and `#mpErr` was empty the whole time; the roster still read
`FINDING PLAYERS IN R6U3B3…` after 50 seconds. Three rejoins and a second pass put the
first message roughly 145 seconds out.

## Evidence

The reporter's HAR shows signalling working perfectly and the transport failing. The host
answered the offer every time, and both sides' server-reflexive addresses came back from a
different public IP on every attempt:

```
browser srflx : 172.213.204.91 .95 .89 .93 .95 .93 .91
host    srflx : 172.213.204.93 .93 .91 .92 .94 .89 .90
host    host  : 10.0.2.16          <- QEMU's NAT, unroutable from outside the emulator
```

An address that changes per connection is a symmetric NAT, and with one at each end and no
usable TURN, ICE cannot succeed. The offer/answer exchange still completes, which is why
the game kept believing the slot was worth another knock.

## Cause

`mpP2PTryJoin` could not tell "nobody is there" from "somebody is there and the channel
will not open". Both ended in the same `cb(false)`, so `mpP2PSlot` applied the same remedy
to both: knock again, `MP_REJOIN_TRIES` times, then let `mpP2PAttempt` run the whole pass a
second time. Every one of those retries was guaranteed to fail in exactly the same way,
and none of them printed anything.

## Fix

The join already knows the difference - it checks `peerConnection.remoteDescription` to
decide how long to wait. That knowledge is now kept: if the host answered and the channel
still never opened, `_iceBlocked` is set, the pass stops immediately instead of retrying,
and the player is told:

> Reached the arena host, but your network would not allow a direct connection. Mobile data
> and office networks often block this.

Retries that can still help are unchanged, and they now say `ARENA IS BUSY · KNOCKING
AGAIN…` instead of leaving the roster frozen on its first message.

## Guard tests

`tests/multiplayer.spec.js › an arena that will not connect`

- `a blocked direct connection is named, once, instead of retried forever` - asserts the
  error names the cause and that the client knocks at most twice.
- `the lobby stays open and says why, rather than hanging` - drives the real buttons and
  asserts `#mpErr`, the open lobby and `G.state === 'menu'`.

Both fail before the fix: the first on an empty `NET.err`, the second on an empty `#mpErr`.
