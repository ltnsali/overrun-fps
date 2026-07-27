---
description: "Run a full QA sweep of OVERRUN: test the game, file bug items, then fix them"
mode: agent
tools: [read, search, edit, execute, todo, agent]
---

Run a complete QA and repair cycle for OVERRUN.

1. **Test.** Invoke the `game-qa` subagent to test the game and file bug items into `bugs/open/`.
   Pass along any focus area the user gave: ${input:focus:Focus area (blank = full sweep)}
2. **Triage.** List what landed in `bugs/open/`, ordered `critical` > `high` > `medium` > `low`.
   If nothing was filed, report that and stop.
3. **Fix.** For each open bug, one at a time, highest severity first, invoke the `game-bugfix`
   subagent with that bug id. Run them sequentially, not in parallel — they all edit
   [index.html](../index.html) and would conflict.
4. **Verify.** After the last fix, run `npx playwright test --reporter=line` yourself and confirm
   the suite is green.
5. **Report.** A single table: bug id, severity, title, fixed / still open, guarding test.

Do not fix anything yourself in steps 1-3 — delegate. Your job is orchestration and the final
verification.
