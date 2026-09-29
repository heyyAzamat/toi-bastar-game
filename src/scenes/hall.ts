// The gameplay scene: seat arriving guests before the asaba (toastmaster) arrives.
import { C, rect, box, text, textS, textO, band, bar, panel, img, wrap, canvas, setCtx, ctx, measure } from '../gfx';
import { Scene, btn, go, type Btn } from '../ui';
import { sfx, playMusic, setIntensity } from '../audio';
import { RING, BOLT, WARN, guestSprite } from '../sprites';
import {
  WAVES, WAVE_TIME, RULE_TEXT, KIND_LABEL, makeGuests, isElder, isKuda, isHonored,
  type Guest, type WaveDef,
} from '../waves';
import { layout, renderBackground, type Layout } from '../hall';
import { run, TITLES, input } from '../run';

const REASON: Record<string, string> = {
  side: 'WRONG SIDE!', elder: 'ELDER TOO FAR FROM TOR!', tor: 'TOR ROW IS FOR ELDERS!',
  kuda: 'KUDA NEED A GOLD SEAT!', face: 'KUDA MUST FACE EACH OTHER!', feud: 'FEUD! THEY ARE FIGHTING!',
  child: 'CHILDREN SIT BY THE DOOR!', akim: 'AKIM BELONGS ON THE TOR!',
};

const Q_Y = 259;
const qSlotX = (i: number) => 6 + i * 40;

interface Floater { s: string; x: number; y: number; c: string; t: number }
interface Spark { x: number; y: number; vx: number; vy: number; t: number; c: string }
interface Drag { g: Guest; from: number; x: number; y: number; sx: number; sy: number; moved: boolean }

type Phase = 'intro' | 'play' | 'rules' | 'asaba' | 'fail';

export class HallScene extends Scene {
  w!: WaveDef;
  L!: Layout;
  bg!: HTMLCanvasElement;
  guests: Guest[] = [];
  occ: number[] = [];
  queue: Guest[] = [];
  outside: Guest[] = [];
  qx = new Map<number, number>();
  phase: Phase = 'intro';
  elapsed = 0;
  clock = 0;
  kurmet = 0;
  maxK = 1;
  scandal = 0;
  timeBonus = 0;
  unseated = 0;
  drag: Drag | null = null;
  hover = -1;
  selected: Guest | null = null;
  floaters: Floater[] = [];
  sparks: Spark[] = [];
  shake = 0;
  banner: { s: string; t: number; c: string } | null = null;
  phaseT = 0;
  shot: HTMLCanvasElement | null = null;
  pairBonus = new Set<number>();
  startBtn!: Btn;
  rulesBtn!: Btn;
  closeBtn!: Btn;

  enter() {
    this.w = WAVES[run.wave];
    this.L = layout(this.w);
    const seed = run.seed + run.wave * 7919;
    this.bg = renderBackground(this.w, this.L, seed);
    this.guests = makeGuests(this.w, seed);
    this.occ = this.L.seats.map(() => -1);
    this.queue = [];
    this.outside = [];
    this.qx.clear();
    this.elapsed = 0;
    this.kurmet = 0;
    this.scandal = 0;
    this.timeBonus = 0;
    this.unseated = 0;
    this.maxK = this.guests.length * 20 + new Set(this.guests.filter((g) => g.pair).map((g) => g.pair)).size * 10;
    this.drag = null;
    this.selected = null;
    this.floaters = [];
    this.sparks = [];
    this.banner = null;
    this.shot = null;
    this.pairBonus.clear();
    this.phase = 'intro';
    this.startBtn = btn(30, 232, 120, 18, 'TOI BASTAR!', () => this.begin(), true);
    this.closeBtn = btn(40, 232, 100, 18, 'ZHARAIDY', () => { this.phase = 'play'; this.syncButtons(); }, true);
    this.rulesBtn = btn(161, 15, 15, 14, '?', () => { this.phase = 'rules'; this.drag = null; this.syncButtons(); });
    this.buttons = [this.startBtn, this.closeBtn, this.rulesBtn];
    this.syncButtons();
    playMusic('menu');
  }

  syncButtons() {
    this.startBtn.hidden = this.phase !== 'intro';
    this.closeBtn.hidden = this.phase !== 'rules';
    this.rulesBtn.hidden = this.phase !== 'play';
  }

  begin() {
    this.phase = 'play';
    this.syncButtons();
    playMusic('game');
    setIntensity(0);
    this.showBanner('TOI BASTAR!', C.gold);
  }

  byId(id: number) { return this.guests[id]; }

  partner(g: Guest) {
    return g.pair ? this.guests.find((o) => o !== g && o.pair === g.pair) : undefined;
  }

  check(g: Guest, i: number): string[] {
    const s = this.L.seats[i];
    const R = this.w.rules;
    const v: string[] = [];
    if (R.includes(2) && g.side !== 'none' && g.side !== s.side) v.push('side');
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
      if (rv.state === 'seated') {
        const rs = this.L.seats[rv.seat];
        if (rs.side === s.side && Math.abs(rs.row - s.row) === 1) v.push('feud');
      }
    }
    if (R.includes(5) && g.kind === 'child' && s.zone !== 'child') v.push('child');
    return v;
  }

  refresh() {
    for (const g of this.guests) if (g.state === 'seated') g.viol = this.check(g, g.seat);
  }

  // --- feedback ---------------------------------------------------------

  float(s: string, x: number, y: number, c: string) {
    this.floaters.push({ s, x, y, c, t: 0 });
  }

  burst(x: number, y: number, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 20 + Math.random() * 40;
      this.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20, t: 0, c: i % 2 ? C.gold : C.cream });
    }
  }

  showBanner(s: string, c: string) {
    this.banner = { s, t: 0, c };
  }

  // --- rules in motion ----------------------------------------------------

  seatGuest(g: Guest, i: number) {
    this.queue.splice(this.queue.indexOf(g), 1);
    g.state = 'seated';
    g.seat = i;
    this.occ[i] = g.id;
    this.refresh();
    const s = this.L.seats[i];
    const cx = s.x + 8;
    if (!g.viol.length) {
      const gain = 10 + Math.round((10 * g.patience) / g.maxP);
      this.kurmet += gain;
      g.rewarded = true;
      this.float('ZHARAYSYN!', cx, s.y - 6, C.gold);
      this.float('+' + gain, cx, s.y + 2, C.cream);
      this.burst(cx, s.y + 8);
      sfx('good');
      this.kudaBonus(g);
    } else {
      this.scandal += 10 * g.viol.length;
      this.float('OIBAI!', cx, s.y - 6, C.red);
      this.float(REASON[g.viol[0]], 90, s.y + 4, C.cream);
      this.shake = 0.25;
      sfx('bad');
    }
  }

  kudaBonus(g: Guest) {
    const p = this.partner(g);
    if (!p || this.pairBonus.has(g.pair) || p.state !== 'seated' || g.viol.length || p.viol.length) return;
    this.pairBonus.add(g.pair);
    this.kurmet += 10;
    this.float('KUDALAR! +10', 90, this.L.seats[g.seat].y - 12, C.gold);
    this.burst(90, this.L.seats[g.seat].y + 8, 16);
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
    }
    g.seat = to;
    this.occ[to] = g.id;
    this.refresh();
    let worse = false;
    let better = false;
    for (const [h, old] of before) {
      const fixed = old.filter((x) => !h.viol.includes(x)).length;
      const added = h.viol.filter((x) => !old.includes(x)).length;
      this.scandal = Math.max(0, this.scandal - 5 * fixed) + 10 * added;
      if (added) worse = true;
      if (fixed) better = true;
      if (!h.viol.length && !h.rewarded) {
        h.rewarded = true;
        this.kurmet += 10;
      }
      if (!h.viol.length) this.kudaBonus(h);
    }
    const s = this.L.seats[to];
    if (worse) {
      this.float('OIBAI!', s.x + 8, s.y - 6, C.red);
      this.float(REASON[g.viol[0] ?? other?.viol[0] ?? 'side'], 90, s.y + 4, C.cream);
      sfx('bad');
    } else if (better) {
      this.float('ZHARAYSYN!', s.x + 8, s.y - 6, C.gold);
      sfx('good');
    } else sfx('pick');
  }

  leave(g: Guest) {
    const qi = this.queue.indexOf(g);
    this.queue.splice(qi, 1);
    g.state = 'left';
    this.scandal += 15;
    this.float('RENJIDI!', (this.qx.get(g.id) ?? qSlotX(qi)) + 16, Q_Y - 4, C.red);
    sfx('leave');
    if (this.drag?.g === g) this.drag = null;
    if (this.selected === g) this.selected = null;
  }

  // --- loop -----------------------------------------------------------------

  update(dt: number) {
    this.clock += dt;
    this.updateFx(dt);
    if (this.phase === 'play') this.updatePlay(dt);
    else if (this.phase === 'asaba' || this.phase === 'fail') {
      this.phaseT += dt;
      if (this.phaseT > (this.phase === 'asaba' ? 2.8 : 2)) this.finish();
    }
  }

  updateFx(dt: number) {
    for (const f of this.floaters) { f.t += dt; f.y -= 14 * dt; }
    this.floaters = this.floaters.filter((f) => f.t < 1.3);
    for (const p of this.sparks) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; }
    this.sparks = this.sparks.filter((p) => p.t < 0.7);
    this.shake = Math.max(0, this.shake - dt);
    if (this.banner && (this.banner.t += dt) > 1.8) this.banner = null;
  }

  updatePlay(dt: number) {
    this.elapsed += dt;
    for (const g of this.guests) {
      if (g.state !== 'pending' || g.arriveAt > this.elapsed) continue;
      if (g.kind === 'akim') {
        g.state = 'queue';
        this.queue.unshift(g);
        if (this.queue.length > 4) {
          const last = this.queue.pop()!;
          last.state = 'outside';
          this.outside.unshift(last);
        }
        this.showBanner('OIBAI! AKIM KELDI!', C.red);
        this.selected = g;
        sfx('alarm');
      } else {
        g.state = 'outside';
        this.outside.push(g);
      }
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
    setIntensity(left < 10 ? 2 : left < 20 ? 1 : 0);

    if (this.scandal >= 100) {
      this.scandal = 100;
      this.phase = 'fail';
      this.phaseT = 0;
      this.drag = null;
      this.syncButtons();
      this.showBanner('TOI BUZYLDY!', C.red);
      playMusic('none');
      sfx('fail');
      return;
    }
    const waiting = this.guests.some((g) => g.state === 'pending' || g.state === 'outside' || g.state === 'queue');
    if (left <= 0 || !waiting) this.startAsaba(Math.max(0, left));
  }

  startAsaba(left: number) {
    this.phase = 'asaba';
    this.phaseT = 0;
    this.drag = null;
    this.syncButtons();
    for (const g of this.guests) {
      if (g.state === 'pending' || g.state === 'outside' || g.state === 'queue') {
        g.state = 'left';
        this.unseated++;
        this.scandal = Math.min(100, this.scandal + 8);
      }
    }
    this.queue = [];
    this.outside = [];
    if (left > 1) {
      this.timeBonus = Math.floor(left);
      this.kurmet += this.timeBonus;
      this.float(`TEZ! +${this.timeBonus}`, 90, 150, C.gold);
    }
    this.refresh();
    this.shot = this.renderShot();
    this.showBanner('ASABA KELDI!', C.gold);
    playMusic('menu');
    sfx('fanfare');
  }

  finish() {
    this.refresh();
    const failed = this.phase === 'fail';
    const total = this.guests.length;
    const perfect = this.guests.filter((g) => g.state === 'seated' && !g.viol.length).length;
    const ratio = perfect / total;
    let stars = 0;
    if (!failed) stars = ratio >= 0.9 && this.scandal < 35 ? 3 : ratio >= 0.7 ? 2 : ratio >= 0.45 ? 1 : 0;
    const score = stars ? Math.max(0, Math.round(this.kurmet + perfect * 5 + stars * 100 - this.scandal / 2)) : 0;
    const title = TITLES[stars];
    go('result', {
      wave: this.w.n, stars, title, perfect, total, score,
      left: this.guests.filter((g) => g.state === 'left').length,
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
    const t = this.seatAt(x, y - input.liftY);
    if (t < 0) return;
    if (d.from < 0) {
      if (this.occ[t] >= 0) {
        this.float('ORYN BOS EMES!', 90, this.L.seats[t].y, C.cream);
        sfx('bad');
      } else this.seatGuest(d.g, t);
    } else this.moveGuest(d.g, t);
  }

  // --- drawing ----------------------------------------------------------

  drawSeated(g: Guest, x: number, y: number, blink: boolean) {
    img(g.sprite, x, y);
    if (g.pair && this.w.rules.includes(3)) img(RING, x + 11, y + 1);
    if (g.feud && this.w.rules.includes(4)) {
      img(BOLT, x, y);
    }
    if (g.state === 'seated' && g.viol.length && blink) img(WARN, x + 12, y - 4);
  }

  drawTable() {
    ctx.drawImage(this.bg, 0, 0);
    const blink = Math.floor(this.clock * 3) % 2 === 0;
    const focus = this.drag?.g ?? this.selected;
    for (const s of this.L.seats) {
      const id = this.occ[s.i];
      if (id < 0) continue;
      const g = this.byId(id);
      const lifted = this.drag?.g === g && this.drag.moved;
      if (lifted) continue;
      const bob = Math.floor((this.clock * 2 + id * 0.37) % 4) === 0 ? -1 : 0;
      this.drawSeated(g, s.x, s.y + bob, blink);
      if (focus && focus !== g && blink) {
        if (focus.rival === g.id && this.w.rules.includes(4)) box(s.x - 1, s.y - 1, 18, 18, C.red);
        if (focus.pair && focus.pair === g.pair && this.w.rules.includes(3)) box(s.x - 1, s.y - 1, 18, 18, C.gold);
      }
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
    textS('TOI ESTELYGI', w / 2, 8, C.gold, 1, 'c');
    c.drawImage(this.shot!, 46, top, 88, ch, 6, 16, 88, ch);
    box(0, 15, w, ch + 2, C.gold);
    textS(title, w / 2, 20 + ch, stars === 3 ? C.gold : C.cream, 1, 'c');
    text(new Date().toISOString().slice(0, 10) + ' - HALL ' + this.w.n, w / 2, 28 + ch, C.gold, 1, 'c');
    setCtx(prev);
    const [big, bc] = canvas(w * 4, h * 4);
    bc.drawImage(cv, 0, 0, w * 4, h * 4);
    return big.toDataURL('image/png');
  }

  portrait(g: Guest, x: number, y: number) {
    const frame = g.side === 'groom' ? C.teal : g.side === 'bride' ? C.red : C.gold;
    rect(x - 1, y - 1, 34, 34, frame);
    rect(x, y, 32, 32, g.kind === 'akim' ? C.gold : C.tan);
    rect(x, y + 24, 32, 8, C.brown);
    img(g.sprite, x, y, 2);
    if (g.pair && this.w.rules.includes(3)) img(RING, x + 26, y + 1);
    if (g.feud && this.w.rules.includes(4)) {
      img(BOLT, x + 1, y + 1);
      text(String(g.feud), x + 7, y + 1, C.cream);
    }
  }

  drawHud() {
    rect(0, 0, 180, 34, C.brown);
    band(0, 0, 180);
    textS(`TOI ${this.w.n}: ${this.w.name}`, 4, 8, C.cream);
    const left = Math.max(0, Math.ceil(WAVE_TIME - this.elapsed));
    const warn = left <= 15 && this.phase === 'play';
    const tc = warn ? (Math.floor(this.clock * 4) % 2 ? C.red : C.cream) : C.gold;
    textS(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`, 176, 7, tc, 1, 'r');
    text('KURMET', 4, 17, C.gold);
    bar(34, 17, 122, 4, this.kurmet / this.maxK, C.gold);
    text('SKANDAL', 4, 25, C.red);
    bar(34, 25, 122, 4, this.scandal / 100, C.red);
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
      bar(x, Q_Y + 35, 32, 2, frac, frac > 0.5 ? C.green : frac > 0.25 ? C.gold : C.red);
    });
    if (this.outside.length) textS('+' + this.outside.length, 176, Q_Y + 12, C.gold, 1, 'r');

    const g = this.drag?.g ?? (this.selected && this.selected.state !== 'left' ? this.selected : this.queue[0]);
    if (!g) {
      if (this.phase === 'play') text('ZHDEM... GUESTS ARE COMING', 90, 302, C.tan, 1, 'c');
      return;
    }
    const sideTxt = g.side === 'groom' ? 'KUIEU SIDE' : g.side === 'bride' ? 'KELIN SIDE' : 'ANY SIDE';
    const sideC = g.side === 'groom' ? C.teal : g.side === 'bride' ? C.red : C.gold;
    textS(g.name, 4, 300, C.cream);
    textS(sideTxt, 176, 300, sideC, 1, 'r');
    let hint = this.hint(g);
    let hc: string = C.gold;
    if (g.state === 'seated' && g.viol.length) {
      hint = REASON[g.viol[0]];
      hc = C.red;
    }
    textS(hint, 4, 308, hc);
  }

  hint(g: Guest): string {
    const R = this.w.rules;
    if (g.kind === 'akim') return 'VIP: TOR ROW, ANY SIDE!';
    if (isElder(g)) return KIND_LABEL[g.kind] + ': GOLD SEAT';
    if (isKuda(g) && R.includes(3)) return `KUDA #${g.pair}: GOLD, FACE PAIR`;
    if (g.kind === 'child' && R.includes(5)) return 'BALA: GREEN SEAT BY DOOR';
    if (g.feud && R.includes(4)) return `FEUD #${g.feud}: KEEP APART!`;
    return 'GUEST: NOT ON TOR ROW';
  }

  drawRulesPanel(title: string) {
    panel(8, 42, 164, 214);
    textO(title, 90, 52, C.gold, 2, 'c');
    textS(`${this.w.name} - ${this.w.seats} ORYN`, 90, 66, C.cream, 1, 'c');
    let y = 78;
    for (const r of this.w.rules) {
      textS(String(r), 16, y, C.gold);
      for (const line of wrap(RULE_TEXT[r], 140)) {
        text(line, 24, y, C.cream);
        y += 7;
      }
      y += 4;
    }
    if (this.w.surprise) {
      for (const line of wrap('BEWARE: A SURPRISE GUEST MAY ARRIVE!', 148)) {
        textS(line, 90, y, C.gold, 1, 'c');
        y += 7;
      }
      y += 4;
    }
    for (const line of wrap('DRAG GUESTS FROM THE QUEUE TO A SEAT. DRAG SEATED GUESTS TO SWAP.', 148)) {
      text(line, 90, y, C.tan, 1, 'c');
      y += 7;
    }
  }

  draw() {
    ctx.save();
    if (this.shake > 0) ctx.translate(Math.round(Math.random() * 2 - 1), Math.round(Math.random() * 2 - 1));
    this.drawTable();

    if (this.drag?.moved && this.hover >= 0) {
      const s = this.L.seats[this.hover];
      const bad = this.drag.from < 0 && this.occ[s.i] >= 0;
      box(s.x - 2, s.y - 2, 20, 20, bad ? C.red : C.cream);
      box(s.x - 1, s.y - 1, 18, 18, bad ? C.red : C.gold);
    }

    if (this.phase === 'asaba') {
      const t = Math.min(1, this.phaseT / 2.2);
      const y = 240 + (Math.max(36, this.L.tableTop - 34) - 240) * t;
      const step = Math.floor(this.phaseT * 8) % 2;
      img(guestSprite('asaba'), 82, y - step);
    }
    ctx.restore();

    this.drawHud();
    this.drawQueue();

    for (const p of this.sparks) rect(p.x, p.y, 1, 1, p.c);
    for (const f of this.floaters) {
      ctx.globalAlpha = Math.min(1, (1.3 - f.t) * 3);
      textO(f.s, Math.max(4 + f.s.length * 2, Math.min(176 - f.s.length * 2, f.x)), f.y, f.c, 1, 'c');
    }
    ctx.globalAlpha = 1;

    const d = this.drag;
    if (d?.moved) {
      const x = d.x - 8;
      const y = d.y - input.liftY - 9;
      rect(x + 2, y + 16, 12, 2, C.brown);
      this.drawSeated(d.g, x, y, false);
    }

    if (this.banner) {
      const b = this.banner;
      const y = 130 - Math.max(0, 0.2 - b.t) * 100;
      rect(0, y - 6, 180, 22, C.brown);
      band(0, y - 6, 180);
      band(0, y + 11, 180);
      textO(b.s, 90, y, b.c, measure(b.s, 2) <= 170 ? 2 : 1, 'c');
    }

    if (this.phase === 'intro') this.drawRulesPanel(`TOI ${this.w.n}`);
    if (this.phase === 'rules') this.drawRulesPanel('EREZHE');
    this.drawButtons();
  }
}
