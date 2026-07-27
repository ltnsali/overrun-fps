---
id: BUG-005
title: The live suite never closes the browser contexts it opens, starving later tests
severity: major
area: tests
status: fixed
found-by: game-qa
devices: [desktop]
---

## Summary

`entering the arena takes seconds, not minutes` failed twice in a row on the deployed site
at 21.0 s and 21.8 s against a 20 s budget - but passed three times out of three, at about
3.3 s each, when run on its own. The suite was reporting a product failure that did not
exist.

## Steps to reproduce

1. `npm run test:live -- --retries=0`
2. The timing test is the 24th of 25 and fails; run it alone with `-g` and it passes easily.

## Expected

A test's result does not depend on how many tests ran before it.

## Actual

```
Error: entering an empty room took 21759ms:
  35205ms pass 0 for room 3OJ7SS13
  35205ms slot 0 try
  35340ms join 0 no answer
  35415ms claim 0 ok
```

## Evidence

The `NET.trace` in the failure message settled it: the whole networking path took **210 ms**
- probe 135 ms, claim 75 ms. None of the 21.8 s was spent getting online. The time went on
building the arena and starting the match on a machine that had nothing left to give.

`openClient()` called `browser.newContext()` for every client and never closed it. Contexts
created from the `browser` fixture are not torn down between tests, and each one keeps a
full three.js game loop rendering under SwiftShader. By the 24th test a dozen of them were
still running.

## Resolution

- **Root cause:** leaked browser contexts, each holding a live software-rendered game loop.
- **Change:** `tests/live.spec.js` routes every context through `newPageIn()`, which tracks
  it, and a top-level `test.afterEach` closes them all.
- **Effect:** the timing test passes, and the whole live suite went from 8.4 min to 2.5 min
  - it had been competing with itself for the CPU all along.
- **Guarded by:** the timing test itself, which is only meaningful now that a test is not
  starved by its predecessors. It also reports the elapsed time and the trace on failure,
  so a slow entry says *why* instead of just failing.
