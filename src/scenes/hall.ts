// The gameplay scene: seat arriving guests before the asaba (toastmaster) arrives.
// The rules, the clock and the score live in HallSim (src/sim/hall.ts); this scene draws them.
import { C, rect, box, text, textS, textO, band, bar, panel, img, wrap, canvas, setCtx, ctx, measure, Confetti } from '../gfx';
import { Scene, btn, go, type Btn } from '../ui';
import { sfx, playMusic, setIntensity, applause } from '../audio';
import {
  HAND, RING, BOLT, HOUSE, STOOL, SMILE, TICK, CROSS, FAMILY, ARROW_UP, ARROW_DOWN, ARROW_LEFT, ARROW_RIGHT, COIN, KESE, DOMBRA, NOTE, guestSprite,
} from '../sprites';
import { isElder, isKuda, hallSeed, modMul, type Guest, type WaveDef } from '../sim/rules';
import { HallSim, STEP, TOOLS, DOMBRA_TIME, type Tool, type Gift, type SimEvent } from '../sim/hall';
import { renderBackground, TABLE_X, TABLE_W } from '../hall';
import { run, title as titleFor, input } from '../run';
import { verify, startToi } from '../verify';
import { t, nm } from '../i18n';
import { profile, saveProfile } from '../storage';

const reason = (v: string) => t('r_' + v);
const spr = (g: Guest) => guestSprite(g.kind, g.look);

const Q_Y = 259;
const qSlotX = (i: number) => 6 + i * 40;
const DOOR_X = 82;
const DOOR_Y = 234;

interface Floater { s: string; x: number; y: number; c: string; t: number }
/** Soft particles: table steam, landing dust, angry smoke, tea steam. */
interface Puff { x: number; y: number; vx: number; vy: number; t: number; life: number; c: string; s: number; a: number }
interface Note { x: number; y: number; t: number; vx: number }
interface Spark { x: number; y: number; vx: number; vy: number; t: number; c: string }
interface Drag { g: Guest; from: number; x: number; y: number; sx: number; sy: number; moved: boolean; was: boolean }
/** A guest crossing the hall on foot: offended ones leaving, kids running off. */
interface Walker { sprite: HTMLCanvasElement; x0: number; y0: number; x1: number; y1: number; t: number; dur: number; hm: boolean; hop: number }

type Phase = 'intro' | 'play' | 'rules' | 'pause' | 'asaba' | 'fail' | 'done' | 'tutdone';

/** Host helpers: one charge each per hall, in the panel on the left. */
const TOOL_X = 4;
const toolY = (i: number) => 140 + i * 23;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class HallScene extends Scene {
  sim!: HallSim;
  w!: WaveDef;
  bg!: HTMLCanvasElement;
  acc = 0; // real time not yet turned into sim ticks
  qx = new Map<number, number>();
  hops = new Map<number, number>();
  phase: Phase = 'intro';
  clock = 0;
  drag: Drag | null = null;
  hover = -1;
  selected: Guest | null = null;
  floaters: Floater[] = [];
  sparks: Spark[] = [];
  walkers: Walker[] = [];
  shake = 0;
  banner: { s: string; t: number; c: string } | null = null;
  azheQueue: string[] = [];
  azheLine: { s: string; t: number } | null = null;
  phaseT = 0;
  shot: HTMLCanvasElement | null = null;
  tutLine = '';
  startBtn!: Btn;
  rulesBtn!: Btn;
  closeBtn!: Btn;
  pauseBtn!: Btn;
  pauseBtns: Btn[] = [];
  comboPop = 0;
  toolDown: Tool | null = null;
  toolHover: Tool | null = null; // mouse over a helper: show its tooltip
  // Juice.
  puffs: Puff[] = [];
  notes: Note[] = [];
  steamT = 0;
  smokeT = 0;
  noteT = 0;
  kShown = 0;
  sShown = 0;
  flash = 0;
  sway = 0;
  lastSec = 999;
  countPop: { n: number; t: number } | null = null;
  confetti = new Confetti();

  // The simulation's state, read by the drawing code.
  get L() { return this.sim.L; }
  get guests() { return this.sim.guests; }
  get occ() { return this.sim.occ; }
  get queue() { return this.sim.queue; }
  get outside() { return this.sim.outside; }
  get kurmet() { return this.sim.kurmet; }
  get maxK() { return this.sim.maxK; }
  get scandal() { return this.sim.scandal; }
  get combo() { return this.sim.combo; }
  get charges() { return this.sim.charges; }
  get dombraT() { return this.sim.dombraT; }
  get advice() { return this.sim.advice; }
  get gifts() { return this.sim.gifts; }
  get tutorial() { return run.mode === 'tutorial'; }

  enter() {
    const tut = this.tutorial;
    const seed = hallSeed(run.seed, run.wave);
    this.w = run.hall();
    this.sim = new HallSim(this.w, seed, tut);
    this.bg = renderBackground(this.w, this.sim.L, seed);
    this.tutLine = tut ? t('tut1') : '';
    this.acc = 0;
    this.qx.clear();
    this.hops.clear();
    this.drag = null;
    this.selected = null;
    this.floaters = [];
    this.sparks = [];
    this.walkers = [];
    this.banner = null;
    this.azheLine = null;
    this.shot = null;
    this.phase = 'intro';
    this.comboPop = 0;
    this.toolDown = null;
    this.puffs = [];
    this.notes = [];
    this.kShown = 0;
    this.sShown = 0;
    this.flash = 0;
    this.sway = 0;
    this.lastSec = 999;
    this.countPop = null;
    this.confetti = new Confetti();

    // The azhe explains every rule this player hasn't seen yet, one line at a time.
    if (tut) {
      this.azheQueue = [t('tut0')];
    } else {
      const fresh = this.w.rules.filter((r) => !profile.seenRules.includes(r));
      this.azheQueue = fresh.map((r) => t('rule' + r));
      if (!profile.seenRules.length) this.azheQueue.push(t('howTo'));
      if (!profile.seenTools) this.azheQueue.push(t('toolsHow'));
      // Today's twist, every time: it changes from toi to toi.
      if (this.w.mod) this.azheQueue.push(t('modSay_' + this.w.mod));
      profile.seenTools = true;
      profile.seenRules.push(...fresh);
      saveProfile();
    }

    this.startBtn = btn(30, 232, 120, 18, t('toiBastar'), () => this.begin(), true);
    this.closeBtn = btn(40, 232, 100, 18, t('ok'), () => { this.phase = 'play'; this.syncButtons(); }, true);
    this.rulesBtn = btn(161, 15, 15, 14, '?', () => { this.phase = 'rules'; this.drag = null; this.syncButtons(); });
    this.pauseBtn = btn(144, 15, 15, 14, '', () => { this.phase = 'pause'; this.drag = null; this.syncButtons(); });
    this.pauseBtns = [
      btn(30, 196, 120, 18, t('resume'), () => { this.phase = 'play'; this.syncButtons(); }, true),
      btn(30, 218, 58, 16, t('retry'), () => go('hall')),
      btn(92, 218, 58, 16, t('menu'), () => go('start')),
    ];
    this.buttons = [this.startBtn, this.closeBtn, this.rulesBtn, this.pauseBtn, ...this.pauseBtns];
    this.syncButtons();
    playMusic('menu');
  }

  syncButtons() {
    this.startBtn.hidden = this.phase !== 'intro' || this.azheQueue.length > 0;
    this.closeBtn.hidden = this.phase !== 'rules';
    this.rulesBtn.hidden = this.phase !== 'play';
    this.pauseBtn.hidden = this.phase !== 'play';
    for (const b of this.pauseBtns) b.hidden = this.phase !== 'pause';
  }

  begin() {
    this.phase = 'play';
    this.syncButtons();
    // Each toi starts the song from the top.
    playMusic('toi', 0);
    setIntensity(0);
    this.showBanner(t('toiBastar'), C.gold);
  }

  byId(id: number) { return this.sim.byId(id); }
  wouldBreak(g: Guest, i: number) { return this.sim.wouldBreak(g, i); }

  // --- feedback ---------------------------------------------------------

  float(s: string, x: number, y: number, c: string) {
    this.floaters.push({ s, x, y, c, t: 0 });
  }

  burst(x: number, y: number, n = 10, colors: string[] = [C.gold, C.cream]) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 20 + Math.random() * 40;
      this.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20, t: 0, c: colors[i % colors.length] });
    }
  }

  showBanner(s: string, c: string) {
    this.banner = { s, t: 0, c };
  }

  puff(x: number, y: number, n: number, c: string[], o: Partial<Puff> = {}) {
    for (let i = 0; i < n; i++) {
      this.puffs.push({ x, y, vx: rnd(-6, 6), vy: rnd(-10, -4), t: 0, life: 0.8, c: c[i % c.length], s: 1, a: 1, ...o });
    }
  }

  /** Dust kicked off the cushion when a guest lands on it. */
  dust(seat: number) {
    const s = this.L.seats[seat];
    for (let i = 0; i < 8; i++) {
      const dir = i % 2 ? 1 : -1;
      this.puffs.push({ x: s.x + 8 + dir * 5, y: s.y + 14, vx: dir * rnd(10, 22), vy: rnd(-8, -2), t: 0, life: 0.45, c: i % 3 ? C.cream : C.tan, s: i % 2 + 1, a: 0.9 });
    }
  }

  mistake(x: number, y: number, why: string) {
    this.float(t('oibai'), x, y - 6, C.red);
    this.float(reason(why), 90, y + 4, C.cream);
    sfx('oibai');
  }

  walk(g: Guest, x0: number, y0: number, hm: boolean, dur = 1.1) {
    this.walkers.push({ sprite: spr(g), x0, y0, x1: DOOR_X, y1: DOOR_Y, t: 0, dur, hm, hop: hm ? 0 : 1 });
  }

  /** Turn what the simulation did into sounds, words and particles. */
  drain() {
    const evs = this.sim.events.splice(0);
    for (const ev of evs) this.react(ev);
  }

  react(ev: SimEvent) {
    const seats = this.L.seats;
    switch (ev.e) {
      case 'arrive':
        profile.album[ev.g.kind] = (profile.album[ev.g.kind] ?? 0) + 1;
        break;
      case 'enqueue':
        this.qx.set(ev.g.id, ev.front ? -40 : 190);
        break;
      case 'akim':
        this.showBanner(t('akimCame'), C.red);
        this.azheLine = { s: t('rule8'), t: 0 };
        this.selected = ev.g;
        sfx('alarm');
        break;
      case 'cousin':
        this.selected = ev.g;
        this.showBanner(t('cousinCame'), C.gold);
        this.azheLine = { s: t('noSeats'), t: 0 };
        sfx('alarm');
        break;
      case 'seated': {
        const s = seats[ev.seat];
        const cx = s.x + 8;
        this.hops.set(ev.g.id, 0.35);
        this.dust(ev.seat);
        this.float(t('zharaysyn'), cx, s.y - 6, C.gold);
        this.float('+' + ev.gain, cx, s.y + 2, C.cream);
        this.burst(cx, s.y + 8, 12, [C.gold, C.cream, C.green]);
        sfx('good');
        break;
      }
      case 'mistake': {
        const s = seats[ev.seat];
        this.mistake(s.x + 8, s.y, ev.why);
        break;
      }
      case 'moved': {
        this.hops.set(ev.g.id, 0.35);
        this.dust(ev.to);
        if (ev.swapped) {
          this.hops.set(this.occ[ev.from], 0.35);
          this.dust(ev.from);
        }
        const s = seats[ev.to];
        if (ev.worse) break; // the mistake event follows
        if (ev.better) {
          this.float(t('zharaysyn'), s.x + 8, s.y - 6, C.gold);
          sfx('good');
        } else sfx('pick');
        break;
      }
      case 'kuda': {
        const y = seats[ev.seat].y;
        this.float(t('kudalar'), 90, y - 12, C.gold);
        this.burst(90, y + 8, 20);
        break;
      }
      case 'combo':
        this.comboPop = 0.4;
        if (!ev.bonus) break;
        // The bonus rises out of the combo counter, clear of the seat floaters.
        this.float('+' + ev.bonus, TOOL_X + 11, 108, C.teal);
        sfx('combo');
        if (ev.n === 5 || ev.n === 8 || ev.n === 12) {
          this.showBanner(t(ev.n === 5 ? 'tamasha' : 'keremet'), C.gold);
          this.confetti.spawn(40);
          applause(1.5);
        }
        break;
      case 'scandal':
        this.shake = 0.3;
        this.flash = 0.35;
        break;
      case 'leave': {
        const x = this.qx.get(ev.g.id) ?? qSlotX(0);
        this.float(t('offended'), x + 16, Q_Y - 4, C.red);
        this.walk(ev.g, x + 8, DOOR_Y, true);
        sfx('leave');
        if (this.drag?.g === ev.g) this.drag = null;
        if (this.selected === ev.g) this.selected = null;
        break;
      }
      case 'runOff': {
        const s = seats[ev.seat];
        this.walk(ev.g, s.x, s.y, false, 0.8);
        this.float(t('ranOff'), s.x + 8, s.y - 6, C.cream);
        sfx('leave');
        if (this.drag?.g === ev.g) this.drag = null;
        break;
      }
      case 'seatTaken':
        this.float(t('seatTaken'), 90, seats[ev.seat].y, C.cream);
        sfx('bad');
        break;
      case 'tutNo':
        // The tutorial never punishes: the azhe just explains and the guest goes back.
        this.azheLine = { s: t('tutNo') + ' ' + reason(ev.why), t: 0 };
        sfx('bad');
        break;
      case 'tutNext':
        this.azheLine = null;
        this.tutLine = t('tut' + ev.next);
        this.selected = null;
        break;
      case 'tutDone':
        this.azheLine = null;
        this.phase = 'tutdone';
        this.phaseT = 0;
        this.tutLine = t('tutDone');
        this.showBanner(t('zharaysyn'), C.gold);
        this.burst(90, 140, 40, [C.gold, C.red, C.teal, C.green]);
        applause(2);
        break;
      case 'tool':
        if (ev.t === 'tea') {
          for (const g of this.queue) {
            const x = (this.qx.get(g.id) ?? 0) + 16;
            this.puff(x, Q_Y + 4, 6, [C.cream], { vy: -14, life: 1.2, a: 0.7, s: 2 });
            this.hops.set(g.id, 0.35);
          }
          this.float(t('u_tea'), 90, 236, C.teal);
        } else if (ev.t === 'advice') {
          this.selected = this.advice?.g ?? this.selected;
          this.azheLine = { s: t('u_advice'), t: 1.5 };
        } else this.showBanner(t('u_dombra'), C.teal);
        sfx(ev.t);
        break;
      case 'toolFail':
        if (ev.why === 'noOne') this.float(t('noOneWaiting'), 90, 230, C.cream);
        if (ev.why === 'noSeat') this.azheLine = { s: t('noGoodSeat'), t: 0 };
        sfx('bad');
        break;
      case 'gift':
        sfx('candy');
        break;
      case 'giftCaught': {
        const [gx, gy] = this.giftPos(ev.gift);
        run.coins++;
        profile.coins++;
        this.float(t('shashuTap'), gx, gy - 8, C.gold);
        this.float('+1 ' + t('tenge'), gx, gy, C.cream);
        this.burst(gx, gy, 14, [C.gold, C.cream, C.red, C.teal]);
        sfx('coin');
        break;
      }
      case 'fail':
        this.phase = 'fail';
        this.phaseT = 0;
        this.drag = null;
        this.syncButtons();
        this.showBanner(t('title0'), C.red);
        playMusic('none');
        sfx('fail');
        break;
      case 'asaba':
        this.phase = 'asaba';
        this.phaseT = 0;
        this.drag = null;
        this.syncButtons();
        this.confetti.spawn(70);
        if (ev.timeBonus) this.float(t('fast', ev.timeBonus), 90, 150, C.gold);
        this.shot = this.renderShot();
        this.showBanner(t('asabaCame'), C.gold);
        profile.album.asaba = (profile.album.asaba ?? 0) + 1;
        playMusic('menu');
        sfx('fanfare');
        applause(3);
        break;
    }
  }

  // --- host helpers ------------------------------------------------------

  useTool(k: Tool) {
    this.sim.useTool(k, this.selected);
    this.drain();
  }

  toolAt(x: number, y: number): Tool | null {
    if (this.tutorial || x < TOOL_X || x >= TOOL_X + 22) return null;
    return TOOLS.find((_, i) => y >= toolY(i) && y < toolY(i) + 20) ?? null;
  }

  giftPos(g: Gift): [number, number] {
    return [g.x + Math.sin(g.t * 3 + g.seed) * 4, g.y - g.t * 7];
  }

  catchGift(x: number, y: number) {
    const gift = this.gifts.find((g) => {
      const [gx, gy] = this.giftPos(g);
      return Math.hypot(gx - x, gy - y) < 11;
    });
    if (!gift) return false;
    this.sim.catchGift(gift.id);
    this.drain();
    return true;
  }

  /** A pointing hand sliding from the waiting guest to the seat they belong in. */
  drawFinger() {
    const g = this.queue[0];
    if (!g || this.drag || this.phase !== 'play' || g.id > 2) return;
    const s = this.L.seats[this.sim.tutTargets[g.id]];
    const p = Math.min(1, (this.clock % 1.6) / 1.1);
    const e = p * p * (3 - 2 * p);
    const x0 = (this.qx.get(g.id) ?? qSlotX(0)) + 16;
    const y0 = Q_Y + 18;
    const x = x0 + (s.x + 8 - x0) * e;
    const y = y0 + (s.y + 10 - y0) * e;
    img(HAND, x - 2, y - 1);
    if (p >= 1) box(s.x - 2, s.y - 2, 20, 20, Math.floor(this.clock * 6) % 2 ? C.gold : C.cream);
  }

  // --- loop -----------------------------------------------------------------

  update(dt: number) {
    this.clock += dt;
    this.updateFx(dt);
    if (this.phase === 'play') this.updatePlay(dt);
    else if (this.phase === 'tutdone') {
      this.phaseT += dt;
      if (this.phaseT > 3) {
        this.phase = 'done';
        profile.tutorialDone = true;
        saveProfile();
        // Through startToi, so the first real toi is server-verified like every other one.
        void startToi('campaign');
      }
    } else if (this.phase === 'asaba' || this.phase === 'fail') {
      if (this.phase === 'asaba' && this.phaseT % 0.7 < dt) this.confetti.spawn(14);
      this.phaseT += dt;
      if (this.phaseT > (this.phase === 'asaba' ? 3 : 2)) this.finish();
    }
  }

  updateFx(dt: number) {
    const live = this.phase !== 'pause' && this.phase !== 'rules';
    this.kShown += (this.kurmet - this.kShown) * Math.min(1, dt * 5);
    this.sShown += (this.scandal - this.sShown) * Math.min(1, dt * 7);
    this.flash = Math.max(0, this.flash - dt);
    this.comboPop = Math.max(0, this.comboPop - dt);
    this.sway -= this.sway * Math.min(1, dt * 8);
    if (this.countPop && (this.countPop.t += dt) > 0.9) this.countPop = null;
    this.confetti.update(dt);
    for (const p of this.puffs) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - Math.min(1, dt * 3); }
    this.puffs = this.puffs.filter((p) => p.t < p.life);
    for (const n of this.notes) { n.t += dt; n.y -= 18 * dt; n.x += n.vx * dt + Math.sin(n.t * 5) * 0.4; }
    this.notes = this.notes.filter((n) => n.t < 2);
    if (live) {
      // Steam off the beshbarmak and the tea bowls.
      if ((this.steamT -= dt) <= 0) {
        this.steamT = 0.22;
        const row = Math.floor(Math.random() * this.L.rows);
        const cy = this.L.tableTop + row * this.L.spacing + this.L.spacing / 2;
        this.puffs.push({ x: TABLE_X + TABLE_W / 2 + rnd(-6, 6), y: cy - 3, vx: rnd(-2, 2), vy: rnd(-9, -6), t: 0, life: 1.5, c: C.cream, s: 1, a: 0.55 });
      }
      // Guests sitting in the wrong place fume.
      if ((this.smokeT -= dt) <= 0) {
        this.smokeT = 0.35;
        for (const st of this.L.seats) {
          const id = this.occ[st.i];
          if (id < 0 || !this.byId(id).viol.length || Math.random() < 0.4) continue;
          this.puffs.push({ x: st.x + 8 + rnd(-3, 3), y: st.y + 2, vx: rnd(-3, 3), vy: rnd(-16, -10), t: 0, life: 0.7, c: Math.random() < 0.5 ? C.red : C.brown, s: 2, a: 0.8 });
        }
      }
      if (this.dombraT > 0 && (this.noteT -= dt) <= 0) {
        this.noteT = 0.18;
        const left = Math.random() < 0.5;
        this.notes.push({ x: left ? rnd(30, 50) : rnd(130, 150), y: rnd(120, 240), t: 0, vx: left ? -4 : 4 });
      }
    }
    for (const f of this.floaters) { f.t += dt; f.y -= 14 * dt; }
    this.floaters = this.floaters.filter((f) => f.t < 1.3);
    for (const p of this.sparks) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; }
    this.sparks = this.sparks.filter((p) => p.t < 0.8);
    for (const w of this.walkers) w.t += dt;
    this.walkers = this.walkers.filter((w) => w.t < w.dur + 0.3);
    for (const [id, h] of this.hops) {
      if (h - dt <= 0) this.hops.delete(id);
      else this.hops.set(id, h - dt);
    }
    for (const g of this.guests) if (g.happyT > 0) g.happyT -= dt;
    this.shake = Math.max(0, this.shake - dt);
    if (this.banner && (this.banner.t += dt) > 1.8) this.banner = null;
    if (this.azheLine && (this.azheLine.t += dt) > 3.5) this.azheLine = null;
  }

  updatePlay(dt: number) {
    // Fixed 60 Hz ticks, so the server's replay of the action log lands on exactly the same state.
    this.acc += dt;
    while (this.acc >= STEP && this.sim.state === 'play') {
      this.sim.tick();
      this.acc -= STEP;
      this.drain();
    }
    if (this.sim.state !== 'play') this.acc = 0;

    this.queue.forEach((g, i) => {
      const x = this.qx.get(g.id) ?? qSlotX(i);
      this.qx.set(g.id, x + (qSlotX(i) - x) * Math.min(1, dt * 10));
    });
    if (this.tutorial || this.phase !== 'play') return;
    const left = this.sim.left;
    setIntensity(left < 10 ? 2 : left < 20 ? 1 : 0);
    const sec = Math.ceil(left);
    if (sec <= 10 && sec > 0 && sec !== this.lastSec && !this.dombraT) {
      this.lastSec = sec;
      this.countPop = { n: sec, t: 0 };
      sfx('tick');
    }
  }

  finish() {
    if (this.phase === 'done') return;
    saveProfile();
    this.phase = 'done';
    const r = this.sim.result();
    verify.hall(run.wave, this.sim.log, r.score);
    const title = titleFor(r.stars);
    go('result', {
      wave: run.wave + 1, hall: this.w.idx, stars: r.stars, title, perfect: r.perfect, total: r.total, score: r.score,
      left: r.left, combo: r.combo, kurmet: r.kurmet, scandal: r.scandal, parts: r.parts, mod: this.w.mod ?? null,
      memento: r.stars ? this.makeMemento(title, r.stars) : null,
    });
  }

  // --- input ----------------------------------------------------------------

  seatAt(x: number, y: number) {
    let best = -1;
    let bd = 12;
    for (const s of this.L.seats) {
      const d = Math.hypot(s.x + 8 - x, s.y + 9 - y);
      if (d < bd) { bd = d; best = s.i; }
    }
    return best;
  }

  onDown(x: number, y: number) {
    if (this.phase === 'intro' && this.azheQueue.length) {
      this.azheQueue.shift();
      this.syncButtons();
      sfx('click');
      return;
    }
    if (this.phase !== 'play') return;
    if (this.catchGift(x, y)) return;
    const tool = this.toolAt(x, y);
    if (tool) { this.toolDown = tool; return; }
    let g: Guest | undefined;
    let from = -1;
    if (y >= Q_Y - 2 && y < Q_Y + 36) {
      g = this.queue.find((q) => {
        const qx = this.qx.get(q.id) ?? 0;
        return x >= qx - 2 && x < qx + 36;
      });
    } else {
      const s = this.L.seats.find((s) => this.occ[s.i] >= 0 && x >= s.x && x < s.x + 16 && y >= s.y && y < s.y + 16);
      if (s) { g = this.byId(this.occ[s.i]); from = s.i; }
    }
    if (!g) {
      // Tap-to-seat: a guest is selected, now tap a free cushion.
      const sel = this.selected;
      const to = this.seatAt(x, y);
      if (sel && to >= 0 && this.occ[to] < 0 && (sel.state === 'queue' || sel.state === 'seated')) {
        this.place(sel, to);
        this.selected = null;
      }
      return;
    }
    this.drag = { g, from, x, y, sx: x, sy: y, moved: false, was: this.selected === g };
    this.selected = g;
    sfx('pick');
  }

  onMove(x: number, y: number) {
    this.toolHover = input.touch ? null : this.toolAt(x, y);
    const d = this.drag;
    if (!d) return;
    this.sway = Math.max(-0.45, Math.min(0.45, this.sway + (x - d.x) * 0.05));
    d.x = x;
    d.y = y;
    if (Math.hypot(x - d.sx, y - d.sy) > 3) d.moved = true;
    this.hover = d.moved ? this.seatAt(x, y - input.liftY) : -1;
  }

  onUp(x: number, y: number) {
    const tool = this.toolDown;
    this.toolDown = null;
    if (tool) {
      if (this.toolAt(x, y) === tool && this.phase === 'play') this.useTool(tool);
      return;
    }
    const d = this.drag;
    this.drag = null;
    this.hover = -1;
    if (!d || this.phase !== 'play') return;
    if (!d.moved) {
      // Tapping the selected guest again puts them down.
      if (d.was) this.selected = null;
      return;
    }
    const to = this.seatAt(x, y - input.liftY);
    if (to >= 0) this.place(d.g, to);
  }

  /** Seat a queued guest or move a seated one; shared by drag and tap. */
  place(g: Guest, to: number) {
    this.sim.place(g, to);
    this.drain();
  }

  // --- drawing ----------------------------------------------------------

  drawSeated(g: Guest, x: number, y: number) {
    img(spr(g), x, y);
    const R = this.w.rules;
    if (g.pair && R.includes(3)) img(RING, x + 11, y + 1);
    if (g.feud && R.includes(4)) img(BOLT, x, y);
    if (g.family && R.includes(7)) this.dot(x + 12, y + 1, FAMILY[g.family - 1]);
  }

  dot(x: number, y: number, c: string) {
    rect(x, y, 4, 4, C.brown);
    rect(x + 1, y, 2, 4, c);
    rect(x, y + 1, 4, 2, c);
  }

  /** Mood bubbles over seated guests: green smile when happy, red "Hm!" when a rule is broken. */
  drawMoods() {
    const blink = Math.floor(this.clock * 2) % 2 === 0;
    for (const s of this.L.seats) {
      const id = this.occ[s.i];
      if (id < 0 || (this.drag?.g.id === id && this.drag.moved)) continue;
      const g = this.byId(id);
      if (g.viol.length) {
        const w = measure(t('hm')) + 4;
        const bx = s.side === 'bride' ? s.x + 10 : s.x - w + 6;
        rect(bx, s.y - 7, w, 9, blink ? C.red : C.maroon);
        box(bx, s.y - 7, w, 9, C.cream);
        text(t('hm'), bx + 2, s.y - 6, C.cream);
      } else if (g.happyT > 0) {
        img(SMILE, s.side === 'bride' ? s.x + 12 : s.x - 4, s.y - 8);
      }
    }
  }

  drawTable() {
    ctx.drawImage(this.bg, 0, 0);
    for (const s of this.L.seats) if (s.zone === 'stool') img(STOOL, s.x + 2, s.y + 8);
    const blink = Math.floor(this.clock * 3) % 2 === 0;
    const focus = this.drag?.g ?? this.selected;
    for (const s of this.L.seats) {
      const id = this.occ[s.i];
      if (id < 0) continue;
      const g = this.byId(id);
      if (this.drag?.g === g && this.drag.moved) continue;
      const hop = this.hops.get(id) ?? 0;
      let lift = hop ? Math.round(Math.sin((hop / 0.35) * Math.PI) * 5) : 0;
      let bob = Math.floor((this.clock * 2 + id * 0.37) % 4) === 0 ? -1 : 0;
      let dx = 0;
      // Upset guests fidget in bursts; during a kui everyone sways; the asaba gets a wave down the table.
      if (g.viol.length && (this.clock + id * 0.3) % 1.6 < 0.3) dx = Math.floor(this.clock * 24) % 2 ? 1 : -1;
      if (this.dombraT > 0) dx = Math.round(Math.sin(this.clock * 5 + s.row * 0.6));
      if (this.phase === 'asaba' && !g.viol.length) lift = Math.max(lift, Math.round(Math.max(0, Math.sin(this.phaseT * 7 - s.row * 0.7)) * 4));
      if (this.combo >= 3 && !g.viol.length && this.phase === 'play') bob = Math.floor((this.clock * 4 + id * 0.37) % 2) === 0 ? -1 : 0;
      this.drawSeated(g, s.x + dx, s.y + bob - lift);
      if (focus && focus !== g && blink) {
        if (focus.rival === g.id && this.w.rules.includes(4)) box(s.x - 1, s.y - 1, 18, 18, C.red);
        if (focus.pair && focus.pair === g.pair && this.w.rules.includes(3)) box(s.x - 1, s.y - 1, 18, 18, C.gold);
        if (focus.family && focus.family === g.family && this.w.rules.includes(7)) box(s.x - 1, s.y - 1, 18, 18, FAMILY[g.family - 1]);
      }
    }
  }

  /** Green tick / red cross on every free seat for the guest in hand (or tapped in the queue). */
  drawHints() {
    const g = this.drag?.g ?? (this.selected?.state === 'queue' ? this.selected : null);
    if (!g || this.phase !== 'play') return;
    const pulse = Math.floor(this.clock * 4) % 2;
    for (const s of this.L.seats) {
      if (this.occ[s.i] >= 0) continue;
      const ok = this.wouldBreak(g, s.i).length === 0;
      if (ok) {
        box(s.x - 1 - pulse, s.y + 5 - pulse, 16 + pulse * 2, 11 + pulse * 2, C.green);
        img(TICK, s.x + 5, s.y + 8);
      } else img(CROSS, s.x + 5, s.y + 8);
    }
  }

  drawAdvice() {
    const a = this.advice;
    if (!a || this.phase !== 'play') return;
    const s = this.L.seats[a.seat];
    const p = Math.floor(this.clock * 6) % 2;
    box(s.x - 3 - p, s.y - 3 - p, 22 + p * 2, 22 + p * 2, C.gold);
    box(s.x - 2 - p, s.y - 2 - p, 20 + p * 2, 20 + p * 2, C.cream);
    img(HAND, s.x + 4, s.y - 12 - Math.round(Math.abs(Math.sin(this.clock * 6)) * 3));
  }

  /** Name and effect of the helper under the mouse (or held finger), to the right of its button. */
  drawToolTip() {
    const k = this.toolDown ?? this.toolHover;
    if (!k || this.phase !== 'play') return;
    const i = TOOLS.indexOf(k);
    const lines = wrap(t('d_' + k), 104);
    const foot = wrap(this.charges[k] ? t('oneUse') : t('toolUsed'), 104);
    const h = 19 + (lines.length + foot.length) * 8;
    const x = TOOL_X + 27;
    const y = Math.min(toolY(i) - 2, 248 - h);
    rect(x + 1, y + 1, 112, h, C.brown);
    rect(x, y, 112, h, C.maroon);
    box(x, y, 112, h, C.gold);
    // Arrow pointing back at the button.
    rect(x - 2, toolY(i) + 7, 2, 5, C.gold);
    rect(x - 4, toolY(i) + 8, 2, 3, C.gold);
    textS(t('n_' + k), x + 4, y + 4, C.gold);
    lines.forEach((l, j) => text(l, x + 4, y + 14 + j * 8, C.cream));
    foot.forEach((l, j) => text(l, x + 4, y + 16 + (lines.length + j) * 8, C.tan));
  }

  /** Left column: the combo counter and the three host helpers. */
  drawHostPanel() {
    if (run.mode === 'tutorial') return;
    rect(1, 114, 30, 99, C.brown);
    box(0, 113, 32, 101, C.gold);
    text(t('comboLbl'), 16, 116, C.tan, 1, 'c');
    const label = 'X' + this.combo;
    const big = measure(label, 2) <= 26;
    const pop = this.comboPop > 0.25 ? -2 : 0;
    const cc = this.combo >= 5 ? (Math.floor(this.clock * 8) % 2 ? C.gold : C.cream) : this.combo >= 2 ? C.gold : C.tan;
    textO(label, 16, 125 + pop + (big ? 0 : 3), cc, big ? 2 : 1, 'c');
    TOOLS.forEach((k, i) => {
      const x = TOOL_X;
      const y = toolY(i);
      const n = this.charges[k];
      const down = this.toolDown === k ? 1 : 0;
      const active = (k === 'dombra' && this.dombraT > 0) || (k === 'advice' && this.advice);
      if (!down) rect(x + 1, y + 1, 22, 20, C.brown);
      rect(x + down, y + down, 22, 20, n ? C.maroon : C.brown);
      box(x + down, y + down, 22, 20, active ? (Math.floor(this.clock * 8) % 2 ? C.teal : C.cream) : n ? C.gold : C.tan);
      const icon = k === 'tea' ? KESE : k === 'dombra' ? DOMBRA : guestSprite('azhe', 1);
      if (!n && !active) ctx.globalAlpha = 0.35;
      const wob = n && this.phase === 'play' && Math.floor(this.clock * 2 + i) % 6 === 0 ? -1 : 0;
      img(icon, x + down + Math.floor((22 - icon.width) / 2), y + down + Math.floor((20 - icon.height) / 2) + wob);
      ctx.globalAlpha = 1;
      if (n) {
        rect(x + 16 + down, y + 14 + down, 5, 5, C.gold);
        rect(x + 17 + down, y + 15 + down, 3, 3, C.cream);
      }
    });
    if (this.dombraT > 0) {
      const w = Math.round((this.dombraT / DOMBRA_TIME) * 22);
      rect(TOOL_X, toolY(2) + 21, w, 2, C.teal);
    }
  }

  drawPausePanel() {
    panel(8, 42, 164, 200);
    textO(t('pause'), 90, 50, C.gold, 2, 'c');
    textS(t('helpers'), 90, 70, C.cream, 1, 'c');
    let y = 84;
    TOOLS.forEach((k) => {
      const icon = k === 'tea' ? KESE : k === 'dombra' ? DOMBRA : guestSprite('azhe', 1);
      rect(16, y - 1, 22, 20, C.brown);
      img(icon, 16 + Math.floor((22 - icon.width) / 2), y - 1 + Math.floor((20 - icon.height) / 2));
      textS(t('n_' + k), 44, y, this.charges[k] ? C.gold : C.tan);
      wrap(t('d_' + k), 120).slice(0, 2).forEach((l, j) => text(l, 44, y + 9 + j * 8, C.cream));
      y += 32;
    });
    text(t('oncePerHall'), 90, y - 2, C.tan, 1, 'c');
  }

  drawWalkers() {
    for (const w of this.walkers) {
      const p = Math.min(1, w.t / w.dur);
      const x = w.x0 + (w.x1 - w.x0) * p;
      const y = w.y0 + (w.y1 - w.y0) * p - Math.abs(Math.sin(w.t * (w.hop ? 18 : 10))) * (w.hop ? 3 : 1);
      ctx.globalAlpha = p >= 1 ? Math.max(0, 1 - (w.t - w.dur) / 0.3) : 1;
      img(w.sprite, x, y);
      if (w.hm) {
        rect(x + 10, y - 6, measure(t('hm')) + 4, 9, C.red);
        text(t('hm'), x + 12, y - 5, C.cream);
      }
      ctx.globalAlpha = 1;
    }
  }

  renderShot(): HTMLCanvasElement {
    const [cv, c] = canvas(180, 320);
    const prev = setCtx(c);
    this.drawTable();
    setCtx(prev);
    return cv;
  }

  makeMemento(title: string, stars: number): string {
    const top = Math.max(34, this.L.tableTop - 26);
    const ch = this.L.tableTop + this.L.tableH + 6 - top;
    const w = 100;
    const h = ch + 42;
    const [cv, c] = canvas(w, h);
    const prev = setCtx(c);
    rect(0, 0, w, h, C.maroon);
    band(0, 0, w);
    band(0, h - 5, w);
    textS(t('estelygi'), w / 2, 7, C.gold, 1, 'c');
    c.drawImage(this.shot!, 46, top, 88, ch, 6, 16, 88, ch);
    box(0, 15, w, ch + 2, C.gold);
    textS(title, w / 2, 20 + ch, stars === 3 ? C.gold : C.cream, 1, 'c');
    text(new Date().toISOString().slice(0, 10), w / 2, 29 + ch, C.gold, 1, 'c');
    setCtx(prev);
    const [big, bc] = canvas(w * 4, h * 4);
    bc.drawImage(cv, 0, 0, w * 4, h * 4);
    return big.toDataURL('image/png');
  }

  /** Queue portrait: side arrow top-left, role badge top-right, destination arrow bottom-left. */
  portrait(g: Guest, x: number, y: number) {
    const R = this.w.rules;
    const frame = g.side === 'groom' ? C.teal : g.side === 'bride' ? C.red : C.gold;
    rect(x - 1, y - 1, 34, 34, frame);
    rect(x, y, 32, 32, g.kind === 'akim' || g.kind === 'bauyr' ? C.gold : C.tan);
    rect(x, y + 24, 32, 8, C.brown);
    img(spr(g), x, y, 2);
    if (R.includes(2) && g.side === 'groom') img(ARROW_LEFT, x + 1, y + 1);
    if (R.includes(2) && g.side === 'bride') img(ARROW_RIGHT, x + 1, y + 1);
    if (g.pair && R.includes(3)) img(RING, x + 26, y + 1);
    if (g.feud && R.includes(4)) {
      img(BOLT, x + 21, y + 1);
      textS(String(g.feud), x + 27, y + 1, C.cream);
    }
    if (g.family && R.includes(7)) this.dot(x + 27, y + 1, FAMILY[g.family - 1]);
    if (g.kind === 'bauyr') img(HOUSE, x + 26, y + 1);
    if (isElder(g) || isKuda(g) || g.kind === 'akim') img(ARROW_UP, x + 1, y + 25);
    if (g.kind === 'child' && R.includes(5)) img(ARROW_DOWN, x + 1, y + 25);
  }

  drawHud() {
    rect(0, 0, 180, 34, C.brown);
    band(0, 0, 180);
    const name = run.mode === 'daily' ? t('daily') : run.mode === 'tutorial' ? t('tutorial') : t('toiN', run.wave + 1);
    textS(`${name}: ${t('hall_' + this.w.hall)}`, 4, 6, C.cream);
    const left = Math.max(0, Math.ceil(this.sim.left));
    const warn = left <= 15 && this.phase === 'play';
    const tc = this.dombraT > 0 ? C.teal : warn ? (Math.floor(this.clock * 4) % 2 ? C.red : C.cream) : C.gold;
    if (run.mode !== 'tutorial') textS(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, 176, 6, tc, 1, 'r');
    const bx = Math.max(measure(t('kurmet')), measure(t('scandal'))) + 8;
    const bw = 140 - bx;
    text(t('kurmet'), 4, 15, C.gold);
    bar(bx, 17, bw, 3, this.kShown / this.maxK, C.gold);
    // A glint runs along the respect bar while it is still filling.
    if (this.kurmet - this.kShown > 0.5) {
      const tip = bx + Math.min(bw, Math.round((bw * this.kShown) / this.maxK));
      rect(tip - 1, 16, 2, 5, C.cream);
    }
    text(t('scandal'), 4, 24, C.red);
    bar(bx, 26, bw, 3, this.sShown / 100, this.shake > 0 && Math.floor(this.clock * 20) % 2 ? C.cream : C.red);
    if (this.sShown > 70 && Math.floor(this.clock * 3) % 2) box(bx - 2, 24, bw + 4, 7, C.red);
    rect(0, 33, 180, 1, C.gold);

  }

  drawQueue() {
    rect(0, 252, 180, 68, C.maroon);
    band(0, 252, 180);
    band(0, 315, 180);
    for (let i = 0; i < 4; i++) {
      rect(qSlotX(i), Q_Y, 32, 32, C.brown);
      box(qSlotX(i) - 1, Q_Y - 1, 34, 34, C.brown);
    }
    this.queue.forEach((g, i) => {
      if (this.drag?.g === g && this.drag.moved) return;
      const frac = g.patience / g.maxP;
      const frozen = this.dombraT > 0;
      const jit = frac < 0.3 && !frozen ? Math.round(Math.sin(this.clock * 40)) : 0;
      const qx = this.qx.get(g.id) ?? qSlotX(i);
      // Walking in: a little hop until they reach their slot.
      const walking = Math.abs(qx - qSlotX(i)) > 2;
      const hopY = walking ? -Math.round(Math.abs(Math.sin(this.clock * 16 + g.id)) * 3) : 0;
      const tea = this.hops.get(g.id) ?? 0;
      const lift = tea ? Math.round(Math.sin((tea / 0.35) * Math.PI) * 3) : 0;
      const x = Math.round(qx) + jit + (frozen ? Math.round(Math.sin(this.clock * 5 + i)) : 0);
      const y = Q_Y + hopY - lift;
      this.portrait(g, x, y);
      if (this.selected === g) {
        const p = Math.floor(this.clock * 4) % 2;
        box(x - 2 - p, y - 2 - p, 36 + p * 2, 36 + p * 2, C.cream);
      }
      if (frac < 0.3 && !frozen) {
        // A bead of sweat sliding down the portrait.
        const dy = Math.floor((this.clock * 14) % 10);
        rect(x + 22, y + 6 + dy, 2, 3, C.teal);
        rect(x + 22, y + 6 + dy, 1, 1, C.cream);
      }
      const bc = frozen ? C.teal : frac > 0.5 ? C.green : frac > 0.25 ? C.gold : frac < 0.15 && Math.floor(this.clock * 8) % 2 ? C.cream : C.red;
      bar(x, Q_Y + 35, 32, 2, frac, bc);
    });
    if (this.outside.length) textS('+' + this.outside.length, 176, Q_Y + 12, C.gold, 1, 'r');

    const g = this.drag?.g ?? (this.selected && this.selected.state !== 'left' ? this.selected : this.queue[0]);
    if (!g) {
      if (this.phase === 'play') text(t('coming'), 90, 302, C.tan, 1, 'c');
      return;
    }
    // Line 1: name + role (coloured by side). Line 2: where they go, or what's wrong.
    const sideC = g.side === 'groom' ? C.teal : g.side === 'bride' ? C.red : C.gold;
    textS(nm(g.name), 4, 299, C.cream);
    textS(t('k_' + g.kind), 176, 299, sideC, 1, 'r');
    let hint = this.hint(g);
    let hc: string = C.gold;
    if (g.state === 'seated' && g.viol.length) {
      hint = reason(g.viol[0]);
      hc = C.red;
    }
    textS(hint, 4, 307, hc);
  }

  hint(g: Guest): string {
    const R = this.w.rules;
    const side = t(g.side === 'groom' ? 'sideGroom' : g.side === 'bride' ? 'sideBride' : 'sideAny');
    if (g.kind === 'akim') return t('h_akim');
    if (isElder(g)) return t('h_elder');
    if (isKuda(g) && R.includes(3)) return t('h_kuda', g.pair);
    if (g.kind === 'child' && R.includes(5)) return t('h_child');
    if (g.feud && R.includes(4)) return t('h_feud', g.feud);
    if (g.family && R.includes(7)) return t('h_nagashy');
    if (g.kind === 'bauyr') return t('h_bauyr');
    return `${side}: ${t('h_guest')}`;
  }

  drawRulesPanel(title: string) {
    panel(8, 42, 164, 214);
    textO(title, 90, 50, C.gold, 2, 'c');
    textS(`${t('hall_' + this.w.hall)} - ${t('seats', this.w.seats)}`, 90, 67, C.cream, 1, 'c');
    // The hall's twist takes the bottom line of the panel.
    const mod = this.w.mod;
    const lim = mod ? 214 : 226;
    // Full sentences when they fit; the one-line short forms for the big halls.
    let rules = this.w.rules.map((r) => wrap(t('rule' + r), 142));
    if (81 + rules.flat().length * 8 + rules.length > lim) rules = this.w.rules.map((r) => wrap(t('rs' + r), 142));
    const count = rules.flat().length;
    const lh = 81 + count * 9 + rules.length * 3 > lim ? 8 : 9;
    const gap = 81 + count * lh + rules.length * 3 > lim ? 1 : 3;
    let y = 81;
    rules.forEach((lines, i) => {
      textS(String(this.w.rules[i]), 16, y, C.gold);
      for (const line of lines) {
        text(line, 24, y, C.cream);
        y += lh;
      }
      y += gap;
    });
    if (mod) {
      rect(14, 215, 152, 1, C.gold);
      const mul = modMul(this.w);
      textS(t('mod_' + mod) + (mul > 1 ? `  X${mul.toFixed(2)}` : ''), 90, 219, C.teal, 1, 'c');
    }
  }

  /** The azhe pops up with a one-line speech bubble. */
  drawAzhe(s: string, y0: number, tapHint: boolean) {
    const lines = wrap(s, 124);
    const bh = lines.length * 9 + 6 + (tapHint ? 8 : 0);
    const by = y0 - bh;
    const bob = Math.floor(this.clock * 3) % 2;
    img(guestSprite('azhe', 1), 4, y0 - 30 - bob, 2);
    rect(41, by + 1, 136, bh, C.brown);
    rect(40, by, 136, bh, C.cream);
    box(40, by, 136, bh, C.brown);
    // Tail pointing at the azhe.
    rect(37, y0 - 14, 3, 3, C.cream);
    rect(34, y0 - 12, 3, 2, C.cream);
    lines.forEach((l, i) => text(l, 44, by + 4 + i * 9, C.brown));
    if (tapHint && Math.floor(this.clock * 2) % 2) text(t('tapNext') + ' >', 172, by + bh - 9, C.tan, 1, 'r');
  }

  draw() {
    ctx.save();
    if (this.shake > 0) ctx.translate(Math.round(Math.random() * 2 - 1), Math.round(Math.random() * 2 - 1));
    this.drawTable();
    this.drawHints();
    this.drawAdvice();

    if (this.drag?.moved && this.hover >= 0) {
      const s = this.L.seats[this.hover];
      const bad = this.drag.from < 0 && this.occ[s.i] >= 0;
      box(s.x - 2, s.y - 2, 20, 20, bad ? C.red : C.cream);
      box(s.x - 1, s.y - 1, 18, 18, bad ? C.red : C.gold);
    }

    if (this.phase === 'asaba') {
      const p = Math.min(1, this.phaseT / 2.2);
      const y = 240 + (Math.max(36, this.L.tableTop - 34) - 240) * p;
      const step = Math.floor(this.phaseT * 8) % 2;
      img(guestSprite('asaba'), 82, y - step);
      if (p >= 1 && Math.floor(this.phaseT * 6) % 3 === 0) this.burst(90, y, 3, [C.gold, C.red, C.teal, C.green]);
    }
    this.drawWalkers();
    this.drawMoods();
    ctx.restore();

    this.drawHud();
    this.drawQueue();
    this.drawHostPanel();

    for (const p of this.puffs) {
      ctx.globalAlpha = p.a * (1 - p.t / p.life);
      const sz = p.s + (p.life > 1 && p.t > p.life / 2 ? 1 : 0);
      rect(p.x, p.y, sz, sz, p.c);
    }
    ctx.globalAlpha = 1;
    for (const n of this.notes) {
      ctx.globalAlpha = Math.min(1, (2 - n.t) * 2);
      img(NOTE, n.x, n.y);
    }
    ctx.globalAlpha = 1;
    for (const g of this.gifts) {
      const [gx, gy] = this.giftPos(g);
      if (g.t > 3.5 && Math.floor(g.t * 10) % 2) continue;
      const ring = Math.floor(this.clock * 6) % 2 ? C.cream : C.gold;
      box(gx - 6, gy - 6, 13, 13, ring);
      img(COIN, gx - 3, gy - 3);
    }
    for (const p of this.sparks) rect(p.x, p.y, p.t < 0.4 ? 2 : 1, p.t < 0.4 ? 2 : 1, p.c);
    this.confetti.draw();
    for (const f of this.floaters) {
      ctx.globalAlpha = Math.min(1, (1.3 - f.t) * 3);
      const hw = measure(f.s) / 2 + 2;
      textO(f.s, Math.max(hw, Math.min(180 - hw, f.x)), f.y, f.c, 1, 'c');
    }
    ctx.globalAlpha = 1;

    const d = this.drag;
    if (d?.moved) {
      const x = Math.round(d.x - 8);
      const y = Math.round(d.y - input.liftY - 9);
      ctx.globalAlpha = 0.5;
      rect(x + 3, y + 21, 10, 2, C.brown);
      ctx.globalAlpha = 1;
      // The guest dangles from the finger and swings with the motion.
      ctx.save();
      ctx.translate(x + 8, y);
      ctx.rotate(-this.sway);
      this.drawSeated(d.g, -8, Math.round(Math.sin(this.clock * 9)));
      ctx.restore();
    }

    if (this.countPop && this.phase === 'play') {
      const c = this.countPop;
      ctx.globalAlpha = 0.6 * (1 - c.t / 0.9);
      textO(String(c.n), 90, c.t < 0.1 ? 100 : 104, c.n <= 3 ? C.red : C.cream, c.t < 0.1 ? 7 : 6, 'c');
      ctx.globalAlpha = 1;
    }
    if (this.flash > 0) {
      ctx.globalAlpha = this.flash / 0.35;
      for (const [x, y, w, h] of [[0, 34, 180, 3], [0, 249, 180, 3], [0, 34, 3, 218], [177, 34, 3, 218]]) rect(x, y, w, h, C.red);
      ctx.globalAlpha = 1;
    }

    if (this.banner) {
      // Slides in from the left, overshoots a touch, and leaves to the right.
      const b = this.banner;
      const p = Math.min(1, b.t / 0.3);
      const e = 1 + 2.2 * Math.pow(p - 1, 3) + 1.2 * Math.pow(p - 1, 2);
      const dx = Math.round((1 - e) * -180 + Math.max(0, (b.t - 1.5) / 0.3) * 180);
      const y = 130;
      const big = measure(b.s, 2) <= 170;
      rect(dx, y - 7, 180, 26, C.brown);
      band(dx, y - 7, 180);
      band(dx, y + 14, 180);
      textO(b.s, 90 + dx, big ? y : y + 3, b.c, big ? 2 : 1, 'c');
    }
    if (run.mode === 'tutorial' && (this.phase === 'play' || this.phase === 'tutdone')) {
      this.drawFinger();
      this.drawAzhe(this.azheLine?.s ?? this.tutLine, 246, false);
    } else if (this.azheLine && this.phase === 'play') this.drawAzhe(this.azheLine.s, 246, false);

    if (this.phase === 'intro') {
      this.drawRulesPanel(run.mode === 'daily' ? t('daily') : run.mode === 'tutorial' ? t('tutorial') : t('toiN', run.wave + 1));
      if (this.azheQueue.length) {
        rect(0, 0, 180, 320, 'rgba(59,36,24,0.55)');
        this.drawAzhe(this.azheQueue[0], 250, true);
      }
    }
    if (this.phase === 'rules') this.drawRulesPanel(t('rules'));
    if (this.phase === 'pause') {
      rect(0, 34, 180, 286, 'rgba(59,36,24,0.55)');
      this.drawPausePanel();
    }
    this.drawToolTip();
    this.drawButtons();
    if (!this.pauseBtn.hidden) {
      const off = this.pressed === this.pauseBtn ? 1 : 0;
      rect(149 + off, 18 + off, 2, 8, C.cream);
      rect(153 + off, 18 + off, 2, 8, C.cream);
    }
  }
}
