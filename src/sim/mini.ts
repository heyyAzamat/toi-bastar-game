// The two mini-games between halls as deterministic simulations, so the server can recount their tenge.
import { rng } from './rules.js';
import { STEP } from './hall.js';

// --- Shashu: catch the sweets the azhe throws for 10 seconds ------------------------

export const SHASHU_TIME = 10;
export const CANDY_COLORS = 4;

export interface Drop { id: number; x: number; y: number; vy: number; kind: 'candy' | 'coin' | 'big'; c: number; sway: number }
export interface Tap { k: number; x: number; y: number }

export class ShashuSim {
  t = 0;
  ticks = 0;
  drops: Drop[] = [];
  candies = 0;
  coins = 0;
  done = false;
  log: Tap[] = [];
  private spawn = 0;
  private nextId = 0;
  private r: () => number;

  constructor(seed: number) {
    this.r = rng(seed ^ 0x51ed2701);
  }

  tick() {
    if (this.done) return;
    this.ticks++;
    this.t += STEP;
    if (this.t >= SHASHU_TIME) {
      this.done = true;
      this.drops = [];
      return;
    }
    this.spawn -= STEP;
    if (this.spawn <= 0) {
      const r = this.r;
      this.spawn = 0.12 + r() * 0.15;
      const k = r();
      this.drops.push({
        id: this.nextId++, x: 12 + r() * 156, y: 36, vy: 45 + r() * 55,
        kind: k < 0.06 ? 'big' : k < 0.4 ? 'coin' : 'candy', c: Math.floor(r() * CANDY_COLORS), sway: r() * 6,
      });
    }
    for (const d of this.drops) {
      d.y += d.vy * STEP;
      d.x += Math.sin(this.t * 3 + d.sway) * 12 * STEP;
    }
    this.drops = this.drops.filter((d) => d.y < 300);
  }

  /** A tap at (x, y): catches the nearest drop within a thumb's reach. */
  tap(x: number, y: number): Drop | null {
    if (this.done || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    this.log.push({ k: this.ticks, x, y });
    let best: Drop | null = null;
    let bd = 14;
    for (const d of this.drops) {
      const dist = Math.hypot(d.x - x, d.y - y);
      if (dist < bd) { bd = dist; best = d; }
    }
    if (!best) return null;
    this.drops.splice(this.drops.indexOf(best), 1);
    if (best.kind === 'candy') this.candies++;
    else this.coins += best.kind === 'big' ? 5 : 1;
    return best;
  }
}

export function replayShashu(seed: number, taps: Tap[]) {
  const sim = new ShashuSim(seed);
  for (const p of taps.slice(0, 1000)) {
    if (!p || !Number.isInteger(p.k) || p.k < sim.ticks) continue;
    while (sim.ticks < p.k && !sim.done) sim.tick();
    sim.tap(p.x, p.y);
  }
  return { candies: sim.candies, coins: sim.coins };
}

// --- Betashar: the bride bows on the beat -------------------------------------------

export const BETASHAR_BPM = 100;
export const QUARTER = 60 / BETASHAR_BPM;
export const BOWS = 12;
const LEAD_BEATS = 4; // one bar of drum before the first bow
const GAP_BEATS = 2; // a bow every half note
export const PERFECT = 0.09;
export const GOOD = 0.18;

export type Judge = 'perfect' | 'good' | 'miss';

/** Times are seconds since the song started. */
export class BetasharSim {
  notes = Array.from({ length: BOWS }, (_, i) => ({ at: (LEAD_BEATS + i * GAP_BEATS) * QUARTER, judged: null as Judge | null }));
  coins = 0;
  log: number[] = [];

  current() { return this.notes.findIndex((n) => !n.judged); }
  get over() { return this.current() < 0; }
  get end() { return this.notes[BOWS - 1].at + 0.8; }

  /** Bows whose moment has passed are missed. Returns the misses, for the sound. */
  advance(now: number): number {
    let missed = 0;
    for (let i = this.current(); i >= 0 && now - this.notes[i].at > GOOD; i = this.current()) {
      this.notes[i].judged = 'miss';
      missed++;
    }
    return missed;
  }

  /** Taps far from any bow are ignored: no penalty for nervous fingers. */
  tap(now: number): Judge | null {
    if (!Number.isFinite(now)) return null;
    this.log.push(now);
    this.advance(now);
    const i = this.current();
    if (i < 0) return null;
    const diff = Math.abs(now - this.notes[i].at);
    const j: Judge | null = diff <= PERFECT ? 'perfect' : diff <= GOOD ? 'good' : null;
    if (!j) return null;
    this.notes[i].judged = j;
    this.coins += j === 'perfect' ? 3 : 1;
    return j;
  }
}

export function replayBetashar(taps: number[]) {
  const sim = new BetasharSim();
  let last = -Infinity;
  for (const t of taps.slice(0, 200)) {
    if (typeof t !== 'number' || t < last) continue; // time only moves forward
    last = t;
    sim.tap(t);
  }
  return { coins: sim.coins };
}
