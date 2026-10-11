// Betashar: the bride bows (sәlem salu) to each relative the singer names, on the beat of the dombra.
// A ring closes in on the bride; tap when it meets the gold circle. The veil lifts at the end.
import { C, rect, text, textS, textO, band, vband, panel, img, measure } from '../gfx';
import { Scene, btn, go } from '../ui';
import { sfx, playMusic, applause, musicClock } from '../audio';
import { BetasharSim, QUARTER, GOOD, type Judge } from '../sim/mini';
import { verify } from '../verify';
import { guestSprite, COIN, type Kind } from '../sprites';
import { run } from '../run';
import { t, nm } from '../i18n';
import { profile, saveProfile } from '../storage';

const RELATIVES: [Kind, string][] = [
  ['aksakal', 'ҚАЙЫН АТА'], ['azhe', 'ҚАЙЫН ЕНЕ'], ['kuda', 'ҚҰДА'], ['kudagi', 'ҚҰДАҒИ'],
  ['zhigit', 'ҚАЙНАҒА'], ['kelin', 'ЖЕҢГЕ'], ['aksakal', 'ҮЛКЕН АТА'], ['azhe', 'ҮЛКЕН ӘЖЕ'],
  ['nagashy', 'НАҒАШЫ'], ['kelin', 'АБЫСЫН'], ['zhigit', 'ҚАЙЫН ІНІ'], ['child', 'БАЛДЫЗ'],
];
const GAP_BEATS = 2; // a bow every half note (timing lives in BetasharSim)
const BRIDE_X = 66;
const BRIDE_Y = 150;
const RING_CX = BRIDE_X + 24;
const RING_CY = BRIDE_Y + 22;


function ring(cx: number, cy: number, r: number, c: string, dots = 48) {
  for (let i = 0; i < dots; i++) {
    const a = (i / dots) * Math.PI * 2;
    rect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2, 2, c);
  }
}

export class BetasharScene extends Scene {
  sim = new BetasharSim();
  start = 0;
  fallback = 0; // clock when the audio clock isn't available (muted before any tap)
  last: { j: Judge; t: number } | null = null;
  bowT = 0;
  done = false;
  doneT = 0;
  pops: { x: number; y: number; t: number }[] = [];

  enter() {
    playMusic('betashar');
    const mc = musicClock();
    this.fallback = 0;
    this.start = mc ? mc.start : 0;
    this.sim = new BetasharSim();
    this.last = null;
    this.bowT = 0;
    this.done = false;
    this.doneT = 0;
    this.pops = [];
    this.buttons = [btn(30, 262, 120, 18, t('nextToi'), () => { run.wave++; go('hall'); }, true)];
    this.buttons[0].hidden = true;
  }

  /** Seconds since the song started (the sim's clock). */
  now() {
    const mc = musicClock();
    return (mc ? mc.now : this.start + this.fallback) - this.start;
  }

  get notes() { return this.sim.notes; }
  get coins() { return this.sim.coins; }
  current() { return this.sim.current(); }

  show(j: Judge) {
    this.last = { j, t: 0 };
    if (j === 'miss') {
      sfx('bad');
      return;
    }
    this.bowT = 0.3;
    const gain = j === 'perfect' ? 3 : 1;
    for (let k = 0; k < gain; k++) this.pops.push({ x: 90 + (k - 1) * 8, y: 60, t: -k * 0.08 });
    sfx(j === 'perfect' ? 'good' : 'candy');
  }

  onDown() {
    if (this.done || this.sim.over) return;
    const missed = this.sim.advance(this.now());
    if (missed) this.show('miss');
    // Taps far from any bow are ignored: no penalty for nervous fingers.
    const j = this.sim.tap(this.now());
    if (j) this.show(j);
  }

  update(dt: number) {
    if (!musicClock()) this.fallback += dt;
    if (this.last) this.last.t += dt;
    this.bowT = Math.max(0, this.bowT - dt);
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < 0.7);
    if (this.done) {
      this.doneT += dt;
      return;
    }
    if (this.sim.advance(this.now())) this.show('miss');
    if (this.sim.over && this.now() > this.sim.end) this.finish();
  }

  finish() {
    this.done = true;
    this.doneT = 0;
    run.coins += this.coins;
    profile.coins += this.coins;
    saveProfile();
    verify.betashar(run.wave, this.sim.log);
    this.buttons[0].hidden = false;
    playMusic('bipyl', 43);
    applause(3);
    sfx('fanfare');
  }

  drawBride() {
    const bow = this.bowT > 0 ? Math.round(Math.sin((this.bowT / 0.3) * Math.PI) * 6) : 0;
    const x = BRIDE_X;
    const y = BRIDE_Y + bow;
    // Saukele: the tall bridal headdress.
    for (let r = 0; r < 26; r++) {
      const w = 4 + Math.floor(r * 0.55);
      rect(x + 24 - w / 2, y - 22 + r, w, 1, r % 6 === 0 ? C.gold : C.cream);
    }
    rect(x + 22, y - 26, 4, 4, C.red);
    img(guestSprite('kelin', 0), x, y, 3);
    // The veil covers the face until the end, then lifts away.
    const lift = this.done ? Math.min(40, this.doneT * 40) : 0;
    const alpha = this.done ? Math.max(0, 1 - this.doneT / 1.2) : 0.92;
    if (alpha > 0) {
      rect(x + 9, y + 6 - lift, 30, 22, `rgba(244,233,211,${alpha})`);
      band(x + 9, y + 24 - lift, 30, C.gold, `rgba(122,30,43,${alpha})`);
    }
  }

  draw() {
    rect(0, 0, 180, 320, C.maroon);
    for (let y = 0; y < 320; y += 6) for (let x = (y / 6) % 2 ? 0 : 3; x < 180; x += 6) rect(x, y, 1, 1, C.red);
    band(0, 0, 180);
    band(0, 315, 180);
    vband(0, 5, 310);
    vband(175, 5, 310);
    textO(t('betashar'), 90, 9, C.gold, 2, 'c');

    const i = this.current();
    const idx = i < 0 ? RELATIVES.length - 1 : i;
    const [kind, who] = RELATIVES[idx];
    if (!this.done) {
      text(t('bowOnBeat'), 90, 27, C.tan, 1, 'c');
      // The relative being greeted.
      img(guestSprite(kind, idx % 2), 74, 40, 2);
      textS(`${t('salemTo')} ${nm(who)}!`, 90, 76, C.cream, 1, 'c');
      text(`${Math.min(idx + 1, RELATIVES.length)}/${RELATIVES.length}`, 90, 86, C.gold, 1, 'c');
    }

    this.drawBride();

    if (!this.done && i >= 0) {
      // Rings close in on the gold circle; the next one is already visible.
      const now = this.now();
      ring(RING_CX, RING_CY, 34, C.gold, 56);
      for (let k = i; k < Math.min(i + 2, this.notes.length); k++) {
        const left = this.notes[k].at - now;
        const span = GAP_BEATS * QUARTER * 1.6;
        if (left > span || left < -GOOD) continue;
        const r = 34 + (left / span) * 60;
        ring(RING_CX, RING_CY, r, k === i ? C.cream : C.tan, 40);
      }
    }

    // Judgement text.
    if (this.last && this.last.t < 0.6) {
      const map: Record<Judge, [string, string]> = { perfect: [t('perfect'), C.gold], good: [t('good'), C.cream], miss: [t('miss'), C.red] };
      const [s, c] = map[this.last.j];
      textO(s, 90, 108 - this.last.t * 20, c, measure(s, 2) <= 160 ? 2 : 1, 'c');
    }
    for (const p of this.pops) if (p.t >= 0) img(COIN, p.x + p.t * 60, p.y + p.t * 330);

    rect(8, 300, 164, 12, C.brown);
    img(COIN, 12, 302);
    textS(t('tengeN', this.coins), 22, 303, C.gold);
    const hits = this.notes.filter((n) => n.judged && n.judged !== 'miss').length;
    textS(`${t('bows')} ${hits}/${this.notes.length}`, 168, 303, C.cream, 1, 'r');

    if (this.done && this.doneT > 1) {
      panel(20, 214, 140, 76);
      textO(t('zharaysyn'), 90, 226, C.gold, 1, 'c');
      text(`${t('bows')} ${hits}/${this.notes.length}  +${t('tengeN', this.coins)}`, 90, 240, C.cream, 1, 'c');
    }
    this.drawButtons();
  }
}
