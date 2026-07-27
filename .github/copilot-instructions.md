# OVERRUN — project conventions

WebGL FPS with **no build step**. [index.html](../index.html) is markup only; the code lives in
`src/` as plain classic scripts and stylesheets that the page loads in order. three.js r128 comes
from a CDN with fallbacks.

## Source layout

```
index.html            markup only - <link>s, then <script src> in load order
src/styles/           base, hud, screens, touch, multiplayer, responsive
src/js/00-engine-loader.js   three.js CDN loader (must stay first)
src/js/01-core.js            globals G/SET, math + viewport helpers
src/js/02-audio.js           synthesised audio (AUD)
src/js/03-input.js           keyboard/mouse + touch controls
src/js/04-textures.js        procedural canvas textures
src/js/05-world.js           arena generation (WORLD, buildWorld)
src/js/06-fx.js              particles + explosions
src/js/07-weapons.js         WDEF weapon table
src/js/08-player.js          player state + movement
src/js/09-weapon-logic.js    firing, hitscan, view models
src/js/10-enemies.js         EDEF + enemy AI
src/js/11-projectiles.js     rockets, grenades, plasma
src/js/12-damage.js          damagePlayer / damageEnemy / killEnemy
src/js/13-pickups.js         loot
src/js/14-multiplayer.js     MATCH + NET deathmatch netcode
src/js/15-hud.js             HUD, killfeed, minimap
src/js/16-waves.js           survival wave director
src/js/17-game-flow.js       start/pause/death/quit
src/js/18-settings.js        settings + persistence
src/js/19-menus.js           menu and lobby wiring
src/js/20-boot.js            engine init, resize, main loop (must stay last)
server/relay.js       dependency-free WebSocket relay for deathmatch
```

## Rules for game code

- **No bundler, no ES modules, no runtime dependencies.** Files are classic scripts sharing one
  global scope, so a `function`/`var` declared in any file is visible in every other. Adding a
  file means adding a `<script src>` to [index.html](../index.html) in the right position.
- Only `00-engine-loader.js` (first) and `20-boot.js` (last) are order-sensitive; everything else
  declares functions that run later.
- Match the existing style: `var`, `function` declarations, ES5-compatible syntax.
- Never read `window.innerWidth` / `window.innerHeight` directly. Use `viewW()` / `viewH()`,
  which measure `#app` and therefore respect mobile browser chrome and the notch.
- The WebGL canvas is sized by CSS (`#app canvas { width:100%; height:100% }`) and the drawing
  buffer by `onResize()`. Never call `renderer.setSize(w, h)` with `updateStyle` on — pinning
  inline pixels is what caused half the screen to go blank after a rotation.
- Touch input goes through the `#touchUI` layer. Buttons use `bindHold`, `bindToggle` or
  `bindDragButton` (drag-to-aim). Anything added there must be cleared in `resetTouchState()`.
- `?touch=1` / `?touch=0` force the touch control scheme on or off — used by the tests.

## Multiplayer (deathmatch)

`G.mode` is `'survival'` or `'dm'`. The netcode lives in
[src/js/14-multiplayer.js](../src/js/14-multiplayer.js) (`MATCH`, `NET`, `mp*` functions).

- The transport is a **dumb broadcast bus**: [server/relay.js](../server/relay.js) forwards a
  message to everyone else in the room; `BroadcastChannel` (`?net=local`) does the same between
  tabs. There is no authoritative server.
- Each client simulates only its own player. A shooter sends `h` (hit); the **victim** applies
  the damage — a client is the only authority on its own health. Scores are derived identically
  everywhere from `d` (death) messages.
- Remote players are interpolated `MP_LERP` seconds in the past from arrival-time-stamped
  snapshots, so no clock sync is needed. Their boxes are added to `hitscan` as extra targets.
- Deathmatch arenas are generated from a PRNG seeded with the room code (`mpBuildSeededWorld`),
  otherwise clients would stand in different geometry. Never call `buildWorld()` directly in dm.
- Bots are solo-practice only — with no host there is nobody to own their simulation.
- `?relay=ws://host:port` overrides the relay address; the default is port 8787 on the page host.
  `npm run relay` starts it.

## Tests

Playwright, four device projects (phone portrait/landscape, tablet, desktop) plus a serialized
`multiplayer` project, served by [tests/server.js](../tests/server.js) and
[server/relay.js](../server/relay.js). three.js is served from `node_modules` so the suite is
hermetic.

```
npm test                  # full suite
npx playwright test tests/aim.spec.js --project=phone-landscape
npx playwright test --project=multiplayer
```

- [tests/viewport.spec.js](../tests/viewport.spec.js) — canvas sizing, rotation, orientation gate
- [tests/aim.spec.js](../tests/aim.spec.js) — aim fidelity, FIRE / AIM drag-to-aim
- [tests/smoke.spec.js](../tests/smoke.spec.js) — boot, HUD, game flow
- [tests/multiplayer.spec.js](../tests/multiplayer.spec.js) — lobby, two-client deathmatch, relay
- [tests/helpers.js](../tests/helpers.js) — shared boot/measure/gesture helpers

Every bug fix needs a regression test that fails before the fix. The game gates portrait play
behind a rotate screen, so gameplay tests must call `ensureLandscape(page)` before `startPlaying(page)`.

## Bug workflow

Bug items live in [bugs/](../bugs/README.md). The `game-qa` agent files them, the
`game-bugfix` agent fixes them, `/qa-sweep` runs the whole loop.
