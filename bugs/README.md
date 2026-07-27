# Bug items

Bugs found by the `game-qa` agent live here as one markdown file each.

- `bugs/open/` — filed, not yet fixed
- `bugs/fixed/` — resolved, kept as a record of what regressed and what now guards it

Filename: `BUG-<NNN>-<kebab-slug>.md`, e.g. `BUG-007-fire-button-drag-ignored.md`.
`NNN` is the next free number across **both** folders.

## Workflow

| Step | Who | Command |
|------|-----|---------|
| Find and file bugs | `game-qa` agent | pick "Game QA" in the agent picker |
| Fix one bug | `game-bugfix` agent | pick "Game Bugfix", give it a bug id |
| Do the whole loop | orchestrator prompt | `/qa-sweep` |

## Template

Copy this exactly. Frontmatter fields are required.

```markdown
---
id: BUG-000
title: Short imperative description of what is wrong
severity: critical | high | medium | low
area: mobile-layout | input | rendering | gameplay | hud | audio | performance
status: open
found-by: game-qa
devices: [phone-landscape, phone-portrait, tablet, desktop]
---

## Summary

One paragraph: what is broken and why it matters to the player.

## Steps to reproduce

1. Serve the game: `node tests/server.js 4173`
2. Open `http://127.0.0.1:4173/?touch=1` at 932x430
3. ...

## Expected

What should happen.

## Actual

What happens instead.

## Evidence

Console output, failing test name, measured values, screenshot path — whatever proves it.
```

When a bug is fixed, the `game-bugfix` agent moves the file to `bugs/fixed/`, sets
`status: fixed`, and appends:

```markdown
## Resolution

- **Root cause:** ...
- **Change:** ...
- **Guarded by:** `tests/<spec>.js` -g "<test name>"
```
