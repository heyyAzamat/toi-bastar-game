// The gameplay scene: seat arriving guests before the asaba (toastmaster) arrives.
import { C, rect, box, text, textS, textO, band, bar, panel, img, wrap, canvas, setCtx, ctx, measure } from '../gfx';
import { Scene, btn, go, type Btn } from '../ui';
import { sfx, playMusic, setIntensity, applause } from '../audio';
import {
  RING, BOLT, HOUSE, STOOL, SMILE, TICK, CROSS, FAMILY, ARROW_UP, ARROW_DOWN, ARROW_LEFT, ARROW_RIGHT, guestSprite,
} from '../sprites';
import { WAVE_TIME, makeGuests, isElder, isKuda, isHonored, type Guest, type WaveDef } from '../waves';
import { layout, renderBackground, stoolSeat, type Layout } from '../hall';
import { run, title as titleFor, input } from '../run';
import { t, nm } from '../i18n';
import { profile, saveProfile } from '../storage';

const reason = (v: string) => t('r_' + v);

const Q_Y = 259;
const qSlotX = (i: number) => 6 + i * 40;
const DOOR_X = 82;
const DOOR_Y = 234;

interface Floater { s: string; x: number; y: number; c: string; t: number }
interface Spark { x: number; y: number; vx: number; vy: number; t: number; c: string }
interface Drag { g: Guest; from: number; x: number; y: number; sx: number; sy: number; moved: boolean }
/** A guest crossing the hall on foot: offended ones leaving, kids running off. */
interface Walker { sprite: HTMLCanvasElement; x0: number; y0: number; x1: number; y1: number; t: number; dur: number; hm: boolean; hop: number }

type Phase = 'intro' | 'play' | 'rules' | 'asaba' | 'fail' | 'done';

export class HallScene extends Scene {
  w!: WaveDef;
  L!: Layout;
  bg!: HTMLCanvasElement;
  guests: Guest[] = [];
  occ: number[] = [];
  queue: Guest[] = [];
  outside: Guest[] = [];
  qx = new Map<number, number>();
  hops = new Map<number, number>();
  phase: Phase = 'intro';
  elapsed = 0;
  clock = 0;
  kurmet = 0;
  maxK = 1;
  scandal = 0;
  timeBonus = 0;
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
  pairBonus = new Set<number>();
  hints = new Map<number, boolean>(); // seat -> ok for the focused guest
  startBtn!: Btn;
  rulesBtn!: Btn;
  closeBtn!: Btn;

  enter() {
    this.w = run.hall();
    this.L = layout(this.w);
    const seed = run.seed + run.wave * 7919;
    this.bg = renderBackground(this.w, this.L, seed);
    this.guests = makeGuests(this.w, seed);
    this.occ = this.L.seats.map(() => -1);
    this.queue = [];
    this.outside = [];
    this.qx.clear();
    this.hops.clear();
    this.elapsed = 0;
    this.kurmet = 0;
    this.scandal = 0;
    this.timeBonus = 0;
    this.maxK = this.guests.length * 20 + new Set(this.guests.filter((g) => g.pair).map((g) => g.pair)).size * 10;
    this.drag = null;
    this.selected = null;
    this.floaters = [];
    this.sparks = [];
    this.walkers = [];
    this.banner = null;
    this.azheLine = null;
    this.shot = null;
    this.pairBonus.clear();
    this.phase = 'intro';

    // The azhe explains every rule this player hasn't seen yet, one line at a time.
    const fresh = this.w.rules.filter((r) => !profile.seenRules.includes(r));
    this.azheQueue = fresh.map((r) => t('rule' + r));
    if (!profile.seenRules.length) this.azheQueue.push(t('howTo'));
    profile.seenRules.push(...fresh);
    saveProfile();

    this.startBtn = btn(30, 232, 120, 18, t('toiBastar'), () => this.begin(), true);
    this.closeBtn = btn(40, 232, 100, 18, t('ok'), () => { this.phase = 'play'; this.syncButtons(); }, true);
    this.rulesBtn = btn(161, 15, 15, 14, '?', () => { this.phase = 'rules'; this.drag = null; this.syncButtons(); });
    this.buttons = [this.startBtn, this.closeBtn, this.rulesBtn];
    this.syncButtons();
    playMusic('menu');
  }

  syncButtons() {
    this.startBtn.hidden = this.phase !== 'intro' || this.azheQueue.length > 0;
    this.closeBtn.hidden = this.phase !== 'rules';
    this.rulesBtn.hidden = this.phase !== 'play';
  }

  begin() {
    this.phase = 'play';
    this.syncButtons();
    // Each toi starts the song from the top.
    playMusic('toi', 0);
    setIntensity(0);
    this.showBanner(t('toiBastar'), C.gold);
  }

  byId(id: number) { return this.guests[id]; }

  partner(g: Guest) {
    return g.pair ? this.guests.find((o) => o !== g && o.pair === g.pair) : undefined;
  }

  adjacent(a: number, b: number) {
    const sa = this.L.seats[a];
    const sb = this.L.seats[b];
    return sa.side !== 'none' && sa.side === sb.side && Math.abs(sa.row - sb.row) === 1;
  }

  check(g: Guest, i: number): string[] {
    const s = this.L.seats[i];
    const R = this.w.rules;
    const v: string[] = [];
    if (R.includes(2) && g.side !== 'none' && s.side !== 'none' && g.side !== s.side) v.push('side');
    if (R.includes(1)) {
      if (isElder(g) && s.row >= this.w.honorRows) v.push('elder');
      if (s.row === 0 && !isHonored(g)) v.push('tor');
    }
    if (g.kind === 'akim' && s.row !== 0) v.push('akim');
    if (R.includes(3) && isKuda(g)) {
      if (s.row >= this.w.honorRows) v.push('kuda');
      else {
        const p = this.partner(g);
        if (p && p.state === 'seated') {
          const ps = this.L.seats[p.seat];
          if (ps.row !== s.row || ps.side === s.side) v.push('face');
        }
      }
    }
    if (R.includes(4) && g.rival >= 0) {
      const rv = this.byId(g.rival);
      if (rv.state === 'seated' && this.adjacent(i, rv.seat)) v.push('feud');
    }
    if (R.includes(5) && g.kind === 'child' && s.zone !== 'child' && s.zone !== 'stool') v.push('child');
    if (R.includes(6) && g.kind === 'bauyr' && s.zone === 'stool') v.push('stool');
    if (R.includes(7) && g.family) {
      const kin = this.guests.filter((o) => o !== g && o.family === g.family && o.state === 'seated');
      if (kin.length && !kin.some((o) => this.adjacent(i, o.seat))) v.push('family');
    }
    return v;
  }

  /** What `check` would say if `g` sat at seat `i` (used for the green/red seat hints). */
  wouldBreak(g: Guest, i: number) {
    const [state, seat] = [g.state, g.seat];
    g.state = 'seated';
    g.seat = i;
    const v = this.check(g, i);
    g.state = state;
    g.seat = seat;
    return v;
  }

  refresh() {
    for (const g of this.guests) if (g.state === 'seated') g.viol = this.check(g, g.seat);
  }

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

  addScandal(n: number) {
    if (n <= 0) return;
    this.scandal += n;
    this.shake = 0.3;
  }

  mistake(x: number, y: number, why: string) {
    this.float(t('oibai'), x, y - 6, C.red);
    this.float(reason(why), 90, y + 4, C.cream);
    sfx('oibai');
  }

  walk(g: Guest, x0: number, y0: number, hm: boolean, dur = 1.1) {
    this.walkers.push({ sprite: g.sprite, x0, y0, x1: DOOR_X, y1: DOOR_Y, t: 0, dur, hm, hop: hm ? 0 : 1 });
  }

  meet(g: Guest) {
    profile.album[g.kind] = (profile.album[g.kind] ?? 0) + 1;
  }

  // --- rules in motion ----------------------------------------------------

  seatGuest(g: Guest, i: number) {
    this.queue.splice(this.queue.indexOf(g), 1);
    g.state = 'seated';
    g.seat = i;
    g.seatedAt = this.elapsed;
    this.occ[i] = g.id;
    this.hops.set(g.id, 0.35);
    this.refresh();
    const s = this.L.seats[i];
    const cx = s.x + 8;
    if (!g.viol.length) {
      const gain = 10 + Math.round((10 * g.patience) / g.maxP);
      this.kurmet += gain;
      g.rewarded = true;
      g.happyT = 1.8;
      this.float(t('zharaysyn'), cx, s.y - 6, C.gold);
      this.float('+' + gain, cx, s.y + 2, C.cream);
      this.burst(cx, s.y + 8, 12, [C.gold, C.cream, C.green]);
      sfx('good');
      this.kudaBonus(g);
    } else {
      this.addScandal(10 * g.viol.length);
      this.mistake(cx, s.y, g.viol[0]);
    }
  }

  kudaBonus(g: Guest) {
    const p = this.partner(g);
    if (!p || this.pairBonus.has(g.pair) || p.state !== 'seated' || g.viol.length || p.viol.length) return;
    this.pairBonus.add(g.pair);
    this.kurmet += 10;
    this.float(t('kudalar'), 90, this.L.seats[g.seat].y - 12, C.gold);
    this.burst(90, this.L.seats[g.seat].y + 8, 20);
  }

  moveGuest(g: Guest, to: number) {
    const from = g.seat;
    if (to === from) return;
    const otherId = this.occ[to];
    const other = otherId >= 0 ? this.byId(otherId) : null;
    const before = new Map<Guest, string[]>([[g, g.viol.slice()]]);
    if (other) before.set(other, other.viol.slice());
    this.occ[from] = -1;
    if (other) {
      other.seat = from;
      this.occ[from] = other.id;
      this.hops.set(other.id, 0.35);
    }
    g.seat = to;
    this.occ[to] = g.id;
    this.hops.set(g.id, 0.35);
    this.refresh();
    let worse = false;
    let better = false;
    for (const [h, old] of before) {
      const fixed = old.filter((x) => !h.viol.includes(x)).length;
      const added = h.viol.filter((x) => !old.includes(x)).length;
      this.scandal = Math.max(0, this.scandal - 5 * fixed);
      this.addScandal(10 * added);
      if (added) worse = true;
      if (fixed) better = true;
      if (!h.viol.length) {
        h.happyT = 1.8;
        if (!h.rewarded) {
          h.rewarded = true;
          this.kurmet += 10;
        }
        this.kudaBonus(h);
      }
    }
    const s = this.L.seats[to];
    if (worse) this.mistake(s.x + 8, s.y, g.viol[0] ?? other?.viol[0] ?? 'side');
    else if (better) {
      this.float(t('zharaysyn'), s.x + 8, s.y - 6, C.gold);
      sfx('good');
    } else sfx('pick');
  }

  leave(g: Guest) {
    const qi = this.queue.indexOf(g);
    const x = this.qx.get(g.id) ?? qSlotX(qi);
    this.queue.splice(qi, 1);
    g.state = 'left';
    this.addScandal(15);
    this.float(t('offended'), x + 16, Q_Y - 4, C.red);
    this.walk(g, x + 8, DOOR_Y, true);
    sfx('leave');
    if (this.drag?.g === g) this.drag = null;
    if (this.selected === g) this.selected = null;
  }

  toQueueFront(g: Guest) {
    g.state = 'queue';
    this.queue.unshift(g);
    this.qx.set(g.id, -40);
    if (this.queue.length > 4) {
      const last = this.queue.pop()!;
      last.state = 'outside';
      this.outside.unshift(last);
    }
  }

  runOff(g: Guest) {
    const s = this.L.seats[g.seat];
    this.occ[g.seat] = -1;
    g.seat = -1;
    g.runDelay = 0;
    g.patience = g.maxP;
    this.toQueueFront(g);
    this.walk(g, s.x, s.y, false, 0.8);
    this.float(t('ranOff'), s.x + 8, s.y - 6, C.cream);
    sfx('leave');
    this.refresh();
  }

  cousinArrives(g: Guest) {
    const stool = stoolSeat(this.L);
    this.L.seats.push(stool);
    this.occ.push(-1);
    this.toQueueFront(g);
    this.meet(g);
    this.selected = g;
    this.showBanner(t('cousinCame'), C.gold);
    this.azheLine = { s: t('noSeats'), t: 0 };
    sfx('alarm');
  }

  // --- loop -----------------------------------------------------------------

  update(dt: number) {
    this.clock += dt;
    this.updateFx(dt);
    if (this.phase === 'play') this.updatePlay(dt);
    else if (this.phase === 'asaba' || this.phase === 'fail') {
      this.phaseT += dt;
      if (this.phaseT > (this.phase === 'asaba' ? 3 : 2)) this.finish();
    }
  }

  updateFx(dt: number) {
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
    this.elapsed += dt;
    for (const g of this.guests) {
      if (g.state !== 'pending' || g.arriveAt > this.elapsed) continue;
      this.meet(g);
      if (g.kind === 'akim') {
        this.toQueueFront(g);
        this.showBanner(t('akimCame'), C.red);
        this.azheLine = { s: t('rule8'), t: 0 };
        this.selected = g;
        sfx('alarm');
      } else {
        g.state = 'outside';
        this.outside.push(g);
      }
    }

    // The cousin from the aul turns up the moment every regular seat is taken.
    const cousin = this.guests.find((g) => g.kind === 'bauyr' && g.state === 'pending');
    if (cousin && this.occ.every((o) => o >= 0)) {
      cousin.arriveAt = this.elapsed;
      this.cousinArrives(cousin);
    }

    while (this.queue.length < 4 && this.outside.length) {
      const g = this.outside.shift()!;
      g.state = 'queue';
      this.queue.push(g);
      this.qx.set(g.id, 190);
    }
    this.queue.forEach((g, i) => {
      const x = this.qx.get(g.id) ?? qSlotX(i);
      this.qx.set(g.id, x + (qSlotX(i) - x) * Math.min(1, dt * 10));
    });
    for (const g of [...this.queue]) {
      g.patience -= dt;
      if (g.patience <= 0) this.leave(g);
    }

    const left = WAVE_TIME - this.elapsed;
    // Kids get restless: each runs off once, but not in the last seconds.
    for (const g of this.guests) {
      if (g.state === 'seated' && g.runDelay && this.elapsed - g.seatedAt > g.runDelay && left > 10) this.runOff(g);
    }
    setIntensity(left < 10 ? 2 : left < 20 ? 1 : 0);

    if (this.scandal >= 100) {
      this.scandal = 100;
      this.phase = 'fail';
      this.phaseT = 0;
      this.drag = null;
      this.syncButtons();
      this.showBanner(t('title0'), C.red);
      playMusic('none');
      sfx('fail');
      return;
    }
    const waiting = this.guests.some((g) => (g.state === 'pending' && g.arriveAt !== Infinity) || g.state === 'outside' || g.state === 'queue');
    if (left <= 0 || !waiting) this.startAsaba(Math.max(0, left));
  }

  present() {
    // A cousin who never came (table never filled) doesn't count against the player.
    return this.guests.filter((g) => !(g.state === 'pending' && g.arriveAt === Infinity));
  }

  startAsaba(left: number) {
    this.phase = 'asaba';
    this.phaseT = 0;
    this.drag = null;
    this.syncButtons();
    for (const g of this.present()) {
      if (g.state === 'pending' || g.state === 'outside' || g.state === 'queue') {
        g.state = 'left';
        this.scandal = Math.min(100, this.scandal + 8);
      }
    }
    this.queue = [];
    this.outside = [];
    if (left > 1) {
      this.timeBonus = Math.floor(left);
      this.kurmet += this.timeBonus;
      this.float(t('fast', this.timeBonus), 90, 150, C.gold);
    }
    this.refresh();
    this.shot = this.renderShot();
    this.showBanner(t('asabaCame'), C.gold);
    profile.album.asaba = (profile.album.asaba ?? 0) + 1;
    playMusic('menu');
    sfx('fanfare');
    applause(3);
  }

  finish() {
    if (this.phase === 'done') return;
    this.refresh();
    saveProfile();
    const failed = this.phase === 'fail';
    this.phase = 'done';
    const guests = this.present();
    const total = guests.length;
    const perfect = guests.filter((g) => g.state === 'seated' && !g.viol.length).length;
    const ratio = perfect / total;
    let stars = 0;
    if (!failed) stars = ratio >= 0.9 && this.scandal < 35 ? 3 : ratio >= 0.7 ? 2 : ratio >= 0.45 ? 1 : 0;
    const score = stars ? Math.max(0, Math.round(this.kurmet + perfect * 5 + stars * 100 - this.scandal / 2)) : 0;
    const title = titleFor(stars);
    go('result', {
      wave: run.wave + 1, hall: this.w.idx, stars, title, perfect, total, score,
      left: guests.filter((g) => g.state === 'left').length,
      kurmet: Math.round(this.kurmet), scandal: Math.round(this.scandal),
      memento: stars ? this.makeMemento(title, stars) : null,
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
    if (!g) return;
    this.drag = { g, from, x, y, sx: x, sy: y, moved: false };
    this.selected = g;
    sfx('pick');
  }

  onMove(x: number, y: number) {
    const d = this.drag;
    if (!d) return;
    d.x = x;
    d.y = y;
    if (Math.hypot(x - d.sx, y - d.sy) > 3) d.moved = true;
    this.hover = d.moved ? this.seatAt(x, y - input.liftY) : -1;
  }

  onUp(x: number, y: number) {
    const d = this.drag;
    this.drag = null;
    this.hover = -1;
    if (!d || !d.moved || this.phase !== 'play') return;
    const to = this.seatAt(x, y - input.liftY);
    if (to < 0) return;
    if (d.from < 0) {
      if (this.occ[to] >= 0) {
        this.float(t('seatTaken'), 90, this.L.seats[to].y, C.cream);
        sfx('bad');
      } else this.seatGuest(d.g, to);
    } else this.moveGuest(d.g, to);
  }

  // --- drawing ----------------------------------------------------------

  drawSeated(g: Guest, x: number, y: number) {
    img(g.sprite, x, y);
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
      const lift = hop ? Math.round(Math.sin((hop / 0.35) * Math.PI) * 5) : 0;
      const bob = Math.floor((this.clock * 2 + id * 0.37) % 4) === 0 ? -1 : 0;
      this.drawSeated(g, s.x, s.y + bob - lift);
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
    img(g.sprite, x, y, 2);
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
    const name = run.mode === 'daily' ? t('daily') : t('toiN', run.wave + 1);
    textS(`${name}: ${t('hall_' + this.w.hall)}`, 4, 6, C.cream);
    const left = Math.max(0, Math.ceil(WAVE_TIME - this.elapsed));
    const warn = left <= 15 && this.phase === 'play';
    const tc = warn ? (Math.floor(this.clock * 4) % 2 ? C.red : C.cream) : C.gold;
    textS(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, 176, 6, tc, 1, 'r');
    const bx = Math.max(measure(t('kurmet')), measure(t('scandal'))) + 8;
    text(t('kurmet'), 4, 15, C.gold);
    bar(bx, 17, 156 - bx, 3, this.kurmet / this.maxK, C.gold);
    text(t('scandal'), 4, 24, C.red);
    bar(bx, 26, 156 - bx, 3, this.scandal / 100, this.shake > 0 && Math.floor(this.clock * 20) % 2 ? C.cream : C.red);
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
      const jit = frac < 0.3 ? Math.round(Math.sin(this.clock * 40)) : 0;
      const x = Math.round(this.qx.get(g.id) ?? qSlotX(i)) + jit;
      this.portrait(g, x, Q_Y);
      if (this.selected === g) box(x - 2, Q_Y - 2, 36, 36, C.cream);
      bar(x, Q_Y + 35, 32, 2, frac, frac > 0.5 ? C.green : frac > 0.25 ? C.gold : C.red);
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
    // Full sentences when they fit; the one-line short forms for the big halls.
    let rules = this.w.rules.map((r) => wrap(t('rule' + r), 142));
    if (81 + rules.flat().length * 8 + rules.length > 226) rules = this.w.rules.map((r) => wrap(t('rs' + r), 142));
    const count = rules.flat().length;
    const lh = 81 + count * 9 + rules.length * 3 > 226 ? 8 : 9;
    const gap = 81 + count * lh + rules.length * 3 > 226 ? 1 : 3;
    let y = 81;
    rules.forEach((lines, i) => {
      textS(String(this.w.rules[i]), 16, y, C.gold);
      for (const line of lines) {
        text(line, 24, y, C.cream);
        y += lh;
      }
      y += gap;
    });
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

    for (const p of this.sparks) rect(p.x, p.y, p.t < 0.4 ? 2 : 1, p.t < 0.4 ? 2 : 1, p.c);
    for (const f of this.floaters) {
      ctx.globalAlpha = Math.min(1, (1.3 - f.t) * 3);
      const hw = measure(f.s) / 2 + 2;
      textO(f.s, Math.max(hw, Math.min(180 - hw, f.x)), f.y, f.c, 1, 'c');
    }
    ctx.globalAlpha = 1;

    const d = this.drag;
    if (d?.moved) {
      const x = d.x - 8;
      const y = d.y - input.liftY - 9;
      rect(x + 2, y + 16, 12, 2, C.brown);
      this.drawSeated(d.g, x, y);
    }

    if (this.banner) {
      const b = this.banner;
      const y = 130 - Math.max(0, 0.2 - b.t) * 100;
      const big = measure(b.s, 2) <= 170;
      rect(0, y - 7, 180, 26, C.brown);
      band(0, y - 7, 180);
      band(0, y + 14, 180);
      textO(b.s, 90, big ? y : y + 3, b.c, big ? 2 : 1, 'c');
    }
    if (this.azheLine && this.phase === 'play') this.drawAzhe(this.azheLine.s, 246, false);

    if (this.phase === 'intro') {
      this.drawRulesPanel(run.mode === 'daily' ? t('daily') : t('toiN', run.wave + 1));
      if (this.azheQueue.length) {
        rect(0, 0, 180, 320, 'rgba(59,36,24,0.55)');
        this.drawAzhe(this.azheQueue[0], 250, true);
      }
    }
    if (this.phase === 'rules') this.drawRulesPanel(t('rules'));
    this.drawButtons();
  }
}
