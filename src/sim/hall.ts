// One hall played as a deterministic simulation: fixed 60 Hz ticks, seeded randomness, and a log of the
// player's actions stamped with the tick they happened before. The scene drives it and draws its events;
// api/run replays the same log on the server to get the same score.
import {
  makeGuests, tutorialGuests, layout, stoolSeat, check, rng, modMul, WAVE_TIME,
  type Guest, type Layout, type WaveDef,
} from './rules.js';

export const STEP = 1 / 60;
export type Tool = 'tea' | 'advice' | 'dombra';
export const TOOLS: Tool[] = ['tea', 'advice', 'dombra'];
export const DOMBRA_TIME = 7;
/** Hard stop for a replay: the clock, a full kui, and a margin. */
const MAX_TICKS = Math.ceil((WAVE_TIME + DOMBRA_TIME + 30) / STEP);

export type Action =
  | { k: number; a: 'place'; g: number; to: number } // seat a queued guest, or move a seated one
  | { k: number; a: 'tool'; t: Tool; g?: number } // g: the guest the azhe should advise about
  | { k: number; a: 'gift'; id: number }; // caught a shashu coin

export interface Gift { id: number; x: number; y: number; t: number; seed: number }

/** What happened, for the scene's sounds and particles. The server ignores these. */
export type SimEvent =
  | { e: 'arrive'; g: Guest }
  | { e: 'enqueue'; g: Guest; front: boolean }
  | { e: 'akim'; g: Guest }
  | { e: 'cousin'; g: Guest }
  | { e: 'seated'; g: Guest; seat: number; gain: number }
  | { e: 'mistake'; seat: number; why: string }
  | { e: 'moved'; g: Guest; to: number; from: number; swapped: boolean; better: boolean; worse: boolean }
  | { e: 'kuda'; seat: number }
  | { e: 'combo'; n: number; bonus: number }
  | { e: 'scandal' }
  | { e: 'leave'; g: Guest }
  | { e: 'runOff'; g: Guest; seat: number }
  | { e: 'seatTaken'; seat: number }
  | { e: 'tutNo'; why: string }
  | { e: 'tutNext'; next: number }
  | { e: 'tutDone' }
  | { e: 'tool'; t: Tool }
  | { e: 'toolFail'; t: Tool; why: 'used' | 'noOne' | 'noSeat' }
  | { e: 'gift'; gift: Gift }
  | { e: 'giftCaught'; gift: Gift }
  | { e: 'fail' }
  | { e: 'asaba'; timeBonus: number };

export interface HallResult {
  stars: number;
  perfect: number;
  total: number;
  left: number;
  kurmet: number;
  scandal: number;
  combo: number;
  score: number;
  coins: number; // shashu coins caught during the hall
  ticks: number;
  /** The score, line by line: (kurmet + perfect + stars - scandal) x modifier. */
  parts: { kurmet: number; perfect: number; stars: number; scandal: number; mul: number };
}

export class HallSim {
  L: Layout;
  guests: Guest[];
  occ: number[];
  queue: Guest[] = [];
  outside: Guest[] = [];
  ticks = 0;
  elapsed = 0;
  kurmet = 0;
  maxK: number;
  scandal = 0;
  timeBonus = 0;
  combo = 0;
  bestCombo = 0;
  pairBonus = new Set<number>();
  charges: Record<Tool, number> = { tea: 1, advice: 1, dombra: 1 };
  dombraT = 0;
  advice: { g: Guest; seat: number; t: number } | null = null;
  gifts: Gift[] = [];
  nextGift = 10;
  giftId = 0;
  coins = 0;
  tutTargets: number[] = [];
  state: 'play' | 'asaba' | 'fail' = 'play';
  log: Action[] = [];
  events: SimEvent[] = [];
  readonly time: number;
  private r: () => number;

  constructor(public w: WaveDef, seed: number, public tutorial = false) {
    this.L = layout(w);
    this.time = w.time ?? WAVE_TIME;
    this.r = rng(seed ^ 0x9e3779b9);
    if (tutorial) {
      const s = tutorialGuests();
      this.guests = s.guests;
      this.tutTargets = s.targets;
    } else this.guests = makeGuests(w, seed);
    this.occ = this.L.seats.map(() => -1);
    this.maxK = this.guests.length * 20 + new Set(this.guests.filter((g) => g.pair).map((g) => g.pair)).size * 10;
  }

  get left() { return this.time - this.elapsed; }
  byId(id: number) { return this.guests[id]; }
  partner(g: Guest) { return g.pair ? this.guests.find((o) => o !== g && o.pair === g.pair) : undefined; }
  check(g: Guest, i: number) { return check(this.w, this.L.seats, this.guests, g, i); }

  /** What `check` would say if `g` sat at seat `i` (the green/red seat hints). */
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

  private ev(e: SimEvent) { this.events.push(e); }

  private addScandal(n: number) {
    if (n <= 0) return;
    this.scandal += n;
    this.combo = 0;
    this.ev({ e: 'scandal' });
  }

  /** Perfect seating in a row: each one past the first pays a growing bonus. */
  private addCombo() {
    if (this.tutorial) return;
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const bonus = this.combo < 2 ? 0 : Math.min(20, 5 * (this.combo - 1));
    this.kurmet += bonus;
    this.ev({ e: 'combo', n: this.combo, bonus });
  }

  private kudaBonus(g: Guest) {
    const p = this.partner(g);
    if (!p || this.pairBonus.has(g.pair) || p.state !== 'seated' || g.viol.length || p.viol.length) return;
    this.pairBonus.add(g.pair);
    this.kurmet += 10;
    this.ev({ e: 'kuda', seat: g.seat });
  }

  // --- player actions (each one is logged for the server replay) ---------------

  private record(a: Action) {
    if (this.state !== 'play') return false;
    this.log.push(a);
    return true;
  }

  /** Seat a queued guest, or move a seated one (swapping with whoever sits there). */
  place(g: Guest, to: number) {
    if (!this.record({ k: this.ticks, a: 'place', g: g.id, to })) return;
    this.doPlace(g, to);
  }

  useTool(t: Tool, selected?: Guest | null) {
    const a: Action = { k: this.ticks, a: 'tool', t };
    if (t === 'advice' && selected) a.g = selected.id;
    if (!this.record(a)) return;
    this.doTool(t, selected ?? null);
  }

  catchGift(id: number) {
    if (!this.gifts.some((g) => g.id === id)) return;
    if (!this.record({ k: this.ticks, a: 'gift', id })) return;
    this.doGift(id);
  }

  /** Apply a logged action (the replay path). */
  apply(a: Action) {
    if (this.state !== 'play') return;
    this.log.push(a);
    if (a.a === 'place') {
      const g = this.guests[a.g];
      if (g) this.doPlace(g, a.to);
    } else if (a.a === 'tool') this.doTool(a.t, a.g != null ? this.guests[a.g] ?? null : null);
    else this.doGift(a.id);
  }

  private doPlace(g: Guest, to: number) {
    if (!Number.isInteger(to) || to < 0 || to >= this.L.seats.length) return;
    if (g.state === 'queue') {
      if (this.occ[to] >= 0) this.ev({ e: 'seatTaken', seat: to });
      else if (this.tutorial && this.wouldBreak(g, to).length) this.ev({ e: 'tutNo', why: this.wouldBreak(g, to)[0] });
      else this.seatGuest(g, to);
    } else if (g.state === 'seated') this.moveGuest(g, to);
  }

  private seatGuest(g: Guest, i: number) {
    this.queue.splice(this.queue.indexOf(g), 1);
    g.state = 'seated';
    g.seat = i;
    g.seatedAt = this.elapsed;
    this.occ[i] = g.id;
    this.refresh();
    if (this.advice?.g === g) this.advice = null;
    if (!g.viol.length) {
      const gain = 10 + Math.round((10 * g.patience) / g.maxP);
      this.kurmet += gain;
      g.rewarded = true;
      g.happyT = 1.8;
      this.ev({ e: 'seated', g, seat: i, gain });
      this.kudaBonus(g);
      this.addCombo();
      if (this.tutorial) this.tutNext(g);
    } else {
      this.addScandal(10 * g.viol.length);
      this.ev({ e: 'mistake', seat: i, why: g.viol[0] });
    }
  }

  private moveGuest(g: Guest, to: number) {
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
    this.ev({ e: 'moved', g, to, from, swapped: !!other, better, worse });
    if (worse) this.ev({ e: 'mistake', seat: to, why: g.viol[0] ?? other?.viol[0] ?? 'side' });
  }

  private doTool(k: Tool, selected: Guest | null) {
    if (!this.charges[k]) return this.ev({ e: 'toolFail', t: k, why: 'used' });
    if (k === 'tea') {
      if (!this.queue.length) return this.ev({ e: 'toolFail', t: k, why: 'noOne' });
      for (const g of this.queue) g.patience = g.maxP;
    } else if (k === 'advice') {
      const g = selected?.state === 'queue' ? selected : this.queue[0];
      if (!g) return this.ev({ e: 'toolFail', t: k, why: 'noOne' });
      const seat = this.L.seats.find((st) => this.occ[st.i] < 0 && !this.wouldBreak(g, st.i).length);
      if (!seat) return this.ev({ e: 'toolFail', t: k, why: 'noSeat' });
      this.advice = { g, seat: seat.i, t: 6 };
    } else this.dombraT = DOMBRA_TIME;
    this.charges[k]--;
    this.ev({ e: 'tool', t: k });
  }

  private doGift(id: number) {
    const i = this.gifts.findIndex((g) => g.id === id);
    if (i < 0) return;
    const [gift] = this.gifts.splice(i, 1);
    this.kurmet += 5;
    this.coins++;
    this.ev({ e: 'giftCaught', gift });
  }

  // --- the clock -------------------------------------------------------------------

  private toQueueFront(g: Guest) {
    g.state = 'queue';
    this.queue.unshift(g);
    this.ev({ e: 'enqueue', g, front: true });
    if (this.queue.length > 4) {
      const last = this.queue.pop()!;
      last.state = 'outside';
      this.outside.unshift(last);
    }
  }

  private leave(g: Guest) {
    this.queue.splice(this.queue.indexOf(g), 1);
    g.state = 'left';
    this.addScandal(15);
    this.ev({ e: 'leave', g });
  }

  private runOff(g: Guest) {
    const seat = g.seat;
    this.occ[seat] = -1;
    g.seat = -1;
    g.runDelay = 0;
    g.patience = g.maxP;
    this.toQueueFront(g);
    this.ev({ e: 'runOff', g, seat });
    this.refresh();
  }

  private spawnGift() {
    const happy = this.L.seats.filter((st) => this.occ[st.i] >= 0 && !this.byId(this.occ[st.i]).viol.length);
    if (!happy.length) return false;
    const st = happy[Math.floor(this.r() * happy.length)];
    const gift = { id: this.giftId++, x: st.x + 8, y: st.y - 2, t: 0, seed: this.r() * 6 };
    this.gifts.push(gift);
    this.ev({ e: 'gift', gift });
    return true;
  }

  private tutNext(g: Guest) {
    const next = this.guests[g.id + 1];
    if (next) {
      next.arriveAt = this.elapsed + 0.6;
      this.ev({ e: 'tutNext', next: g.id + 2 });
    } else {
      this.state = 'asaba';
      this.ev({ e: 'tutDone' });
    }
  }

  tick() {
    if (this.state !== 'play') return;
    this.ticks++;
    const dt = STEP;
    for (const g of this.gifts) g.t += dt;
    this.gifts = this.gifts.filter((g) => g.t < 5);
    if (this.advice && ((this.advice.t -= dt) <= 0 || this.advice.g.state !== 'queue' || this.occ[this.advice.seat] >= 0)) this.advice = null;

    // The dombyrashy plays a kui: the clock and everyone's patience stop while it lasts.
    const frozen = this.dombraT > 0;
    if (frozen) this.dombraT = Math.max(0, this.dombraT - dt);
    else this.elapsed += dt;
    for (const g of this.guests) {
      if (g.state !== 'pending' || g.arriveAt > this.elapsed) continue;
      this.ev({ e: 'arrive', g });
      if (g.kind === 'akim') {
        this.toQueueFront(g);
        this.ev({ e: 'akim', g });
      } else {
        g.state = 'outside';
        this.outside.push(g);
      }
    }

    // The cousin from the aul turns up the moment every regular seat is taken.
    const cousin = this.guests.find((g) => g.kind === 'bauyr' && g.state === 'pending');
    if (cousin && this.occ.every((o) => o >= 0)) {
      cousin.arriveAt = this.elapsed;
      this.L.seats.push(stoolSeat(this.L));
      this.occ.push(-1);
      this.toQueueFront(cousin);
      this.ev({ e: 'arrive', g: cousin });
      this.ev({ e: 'cousin', g: cousin });
    }

    while (this.queue.length < 4 && this.outside.length) {
      const g = this.outside.shift()!;
      g.state = 'queue';
      this.queue.push(g);
      this.ev({ e: 'enqueue', g, front: false });
    }
    if (this.tutorial || frozen) return; // no clock, no patience, no kids running off

    if (this.elapsed >= this.nextGift) {
      const gap = (8 + this.r() * 6) / (this.w.giftMul ?? 1);
      this.nextGift = this.elapsed + (this.spawnGift() ? gap : 2);
    }
    for (const g of [...this.queue]) {
      g.patience -= dt;
      if (g.patience <= 0) this.leave(g);
    }

    const left = this.left;
    // Kids get restless: each runs off once, but not in the last seconds.
    for (const g of this.guests) {
      if (g.state === 'seated' && g.runDelay && this.elapsed - g.seatedAt > g.runDelay && left > 10) this.runOff(g);
    }

    if (this.scandal >= 100) {
      this.scandal = 100;
      this.state = 'fail';
      this.ev({ e: 'fail' });
      return;
    }
    const waiting = this.guests.some((g) => (g.state === 'pending' && g.arriveAt !== Infinity) || g.state === 'outside' || g.state === 'queue');
    if (left <= 0 || !waiting) this.startAsaba(Math.max(0, left));
  }

  /** A cousin who never came (table never filled) doesn't count against the player. */
  present() {
    return this.guests.filter((g) => !(g.state === 'pending' && g.arriveAt === Infinity));
  }

  private startAsaba(left: number) {
    this.state = 'asaba';
    for (const g of this.present()) {
      if (g.state === 'pending' || g.state === 'outside' || g.state === 'queue') {
        g.state = 'left';
        this.scandal = Math.min(100, this.scandal + 8);
      }
    }
    this.queue = [];
    this.outside = [];
    this.gifts = [];
    this.advice = null;
    this.dombraT = 0;
    if (left > 1) {
      this.timeBonus = Math.floor(left);
      this.kurmet += this.timeBonus;
    }
    this.refresh();
    this.ev({ e: 'asaba', timeBonus: this.timeBonus });
  }

  result(): HallResult {
    this.refresh();
    const guests = this.present();
    const total = guests.length;
    const perfect = guests.filter((g) => g.state === 'seated' && !g.viol.length).length;
    const ratio = perfect / total;
    let stars = 0;
    if (this.state !== 'fail') stars = ratio >= 0.9 && this.scandal < 35 ? 3 : ratio >= 0.7 ? 2 : ratio >= 0.45 ? 1 : 0;
    const mul = modMul(this.w);
    const raw = this.kurmet + perfect * 5 + stars * 100 - this.scandal / 2;
    return {
      stars, perfect, total,
      left: guests.filter((g) => g.state === 'left').length,
      kurmet: Math.round(this.kurmet), scandal: Math.round(this.scandal), combo: this.bestCombo,
      score: stars ? Math.max(0, Math.round(raw * mul)) : 0,
      coins: this.coins,
      ticks: this.ticks,
      parts: { kurmet: Math.round(this.kurmet), perfect: perfect * 5, stars: stars * 100, scandal: -Math.round(this.scandal / 2), mul },
    };
  }
}

/** Server side: play a hall from its log and return what the player really scored. */
export function replayHall(w: WaveDef, seed: number, log: Action[]): HallResult {
  const sim = new HallSim(w, seed);
  for (const a of log) {
    if (!a || !Number.isInteger(a.k) || a.k < sim.ticks) continue; // out of order: ignored
    while (sim.ticks < a.k && sim.state === 'play' && sim.ticks < MAX_TICKS) sim.tick();
    sim.apply(a);
    sim.events.length = 0;
  }
  while (sim.state === 'play' && sim.ticks < MAX_TICKS) {
    sim.tick();
    sim.events.length = 0;
  }
  return sim.result();
}
