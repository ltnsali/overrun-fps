'use strict';
/**
 * Weapon audio is synthesised, so it can be rendered offline and measured
 * instead of being argued about. A tester asked for "loud bullet sounds that
 * make the gun punchier", which in this synthesis means two specific things:
 * an instant transient, and energy low enough to feel.
 */

const { test, expect } = require('@playwright/test');
const { bootGame } = require('./helpers');

/**
 * Render one shot through an OfflineAudioContext by temporarily pointing AUD at
 * it. The helpers all go through this.ctx / this.master, so nothing in the game
 * needs a test hook.
 */
async function renderShot(page, kind) {
  return page.evaluate(async (weapon) => {
    const sr = 44100;
    const off = new OfflineAudioContext(1, sr * 0.6, sr);
    const keep = { ctx: AUD.ctx, master: AUD.master, buf: AUD.noiseBuf, ready: AUD.ready };

    AUD.ctx = off;
    AUD.master = off.createGain();
    AUD.master.connect(off.destination);
    const len = sr * 2;
    const nb = off.createBuffer(1, len, sr);
    const d = nb.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    AUD.noiseBuf = nb;
    AUD.ready = true;

    AUD.shot(weapon, null);
    const rendered = await off.startRendering();

    AUD.ctx = keep.ctx;
    AUD.master = keep.master;
    AUD.noiseBuf = keep.buf;
    AUD.ready = keep.ready;

    const ch = rendered.getChannelData(0);
    const peak = (from, to) => {
      let m = 0;
      for (let i = Math.floor(from * sr); i < Math.min(ch.length, Math.floor(to * sr)); i++) {
        const v = Math.abs(ch[i]);
        if (v > m) m = v;
      }
      return m;
    };

    /* One-pole low-pass at ~120Hz, then compare its energy with the whole
       signal's - that ratio is "how much of this you feel in your chest". */
    const a = Math.exp((-2 * Math.PI * 120) / sr);
    let y = 0;
    let lowE = 0;
    let allE = 0;
    for (let i = 0; i < ch.length; i++) {
      y = (1 - a) * ch[i] + a * y;
      lowE += y * y;
      allE += ch[i] * ch[i];
    }

    return {
      attack: peak(0, 0.012),
      tail: peak(0.09, 0.35),
      lowRatio: allE > 0 ? lowE / allE : 0
    };
  }, kind);
}

test.describe('weapon audio', () => {
  /* Thresholds come from measuring both versions rather than from taste. Before
     the crack and thump layers the loudest attack of any weapon was 0.53 and
     three of the four put under 14% of their energy below 120Hz; afterwards the
     quietest attack is 0.70. 0.6 therefore separates them cleanly, which is what
     makes this a regression test rather than a restatement of the code. */
  for (const kind of ['pistol', 'rifle', 'shotgun', 'sniper']) {
    test(`${kind} opens with a transient and carries low end`, async ({ page }) => {
      await bootGame(page);
      const r = await renderShot(page, kind);

      expect(r.attack, `${kind} attack peak`).toBeGreaterThan(0.6);
      expect(
        r.attack,
        `${kind} attack ${r.attack.toFixed(3)} vs tail ${r.tail.toFixed(3)}`
      ).toBeGreaterThan(r.tail * 3);
      expect(
        r.lowRatio,
        `${kind} low-band share ${(r.lowRatio * 100).toFixed(1)}%`
      ).toBeGreaterThan(0.2);
    });
  }
});
