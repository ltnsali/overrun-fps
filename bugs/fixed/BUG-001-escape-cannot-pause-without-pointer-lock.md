---
id: BUG-001
title: Escape cannot pause the game when Pointer Lock is unavailable
severity: high
area: input
status: fixed
found-by: manual sweep (Game QA procedure)
devices: [desktop]
---

## Summary

Pausing with `Escape` is not implemented as a key binding. It works only as a side effect of
the browser releasing Pointer Lock: `Escape` exits the lock, `pointerlockchange` fires, and the
handler in `src/js/03-input.js` calls `pauseGame()`.

In any browser that refuses Pointer Lock — an iframe, an embedded webview, or a user who has
denied the permission — the game now runs via the `lockFallback()` path, where `IN.locked` is
set to `true` without an actual lock. There is then no lock for `Escape` to exit, no
`pointerlockchange` event, and therefore **no way to pause with the keyboard at all**. The
player can only quit by reloading the page. On touch devices the on-screen `II` button covers
this, so it is desktop-only.

## Steps to reproduce

1. Serve the game: `node tests/server.js 4173`
2. Open `http://127.0.0.1:4173/?touch=0` in a context where Pointer Lock is denied
   (the VS Code integrated browser reproduces this directly), or stub it:
   ```js
   HTMLElement.prototype.requestPointerLock = function () {
     return Promise.reject(new DOMException('denied', 'WrongDocumentError'));
   };
   ```
3. Start a round.
4. Press `Escape`.

## Expected

The game pauses: `G.state === 'paused'` and the `#pause` screen is shown.

## Actual

Nothing happens. `G.state` stays `'playing'` and no screen is shown.

## Evidence

Measured live in the integrated browser (Pointer Lock refused, fallback active):

```
d_escPause : { screens: "none", state: "playing" }   <- expected screens "pause", state "paused"
e_escResume: { screens: "none", state: "playing" }
```

`src/js/19-menus.js` line 33 — the `Escape` branch handles `paused`, the multiplayer lobby and
the help/settings screens, but has no case for `G.state === 'playing'`:

```js
if(e.code === 'Escape'){
  if(G.state === 'paused'){ resumeGame(); }
  else if(document.getElementById('mp').classList.contains('on')){ ... }
  else if(help or opts open){ ... }
  // no branch that pauses a running game
}
```

## Resolution

- **Root cause:** pausing was never bound to a key. It was an emergent side effect of the
  `pointerlockchange` handler in [src/js/03-input.js](../../src/js/03-input.js), which pauses
  when the lock is lost. Any browser that does not grant the lock therefore has no pause at all.
- **Change:** added an explicit `else if(G.state === 'playing'){ pauseGame(); }` branch to the
  `Escape` handler in [src/js/19-menus.js](../../src/js/19-menus.js). Browsers that do grant
  Pointer Lock swallow the key to exit the lock, so the existing unlock path is unaffected, and
  the double-pause case is harmless because `pauseGame()` returns early unless the state is
  `playing`.
- **Guarded by:** `tests/smoke.spec.js` -g "Escape pauses and resumes even without pointer lock"
  (verified failing before the change: `Expected "paused", Received "playing"`).
