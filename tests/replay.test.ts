// The server's replay of an action log must land on exactly the score the player saw.
import { describe, expect, it } from 'vitest';
import { WAVES, hallDef, hallSeed, rng } from '../src/sim/rules';
import { HallSim, replayHall, TOOLS, type Action } from '../src/sim/hall';
import { ShashuSim, replayShashu, BetasharSim, replayBetashar } from '../src/sim/mini';

/** A bot that plays like a person: acts every few ticks, mostly seats guests well, sometimes errs or dawdles. */
function play(w: ReturnType<typeof hallDef>, seed: number, skill: number) {
  const sim = new HallSim(w, seed);
  const r = rng(seed ^ 1234);
  let wait = 0;
  while (sim.state === 'play' && sim.ticks < 20000) {
    sim.tick();
    sim.events.length = 0;
    if (--wait > 0) continue;
    wait = 10 + Math.floor(r() * 50 / skill);
    const gift = sim.gifts[0];
    if (gift && r() < 0.6) sim.catchGift(gift.id);
    if (r() < 0.02) sim.useTool(TOOLS[Math.floor(r() * 3)], sim.queue[0]);
    const g = sim.queue[0];
    if (!g) continue;
    const free = sim.L.seats.filter((s) => sim.occ[s.i] < 0);
    const good = free.find((s) => !sim.wouldBreak(g, s.i).length);
    const pick = good && r() < skill ? good : free[Math.floor(r() * free.length)];
    if (pick) sim.place(g, pick.i);
    else {
      // Table full: move a seated guest onto the stool (or anywhere) to make room.
      const seated = sim.guests.find((o) => o.state === 'seated');
      if (seated) sim.place(seated, sim.L.seats.length - 1);
    }
    // Now and then a swap between two seated guests.
    if (r() < 0.05) {
      const a = sim.guests.filter((o) => o.state === 'seated');
      if (a.length > 1) sim.place(a[0], a[1].seat);
    }
    sim.events.length = 0;
  }
  return sim;
}

describe('hall replay', () => {
  for (const base of WAVES) {
    it(`${base.hall}: replaying the log gives the same result`, () => {
      for (let n = 0; n < 25; n++) {
        const seed = hallSeed(1000 + n * 31, base.idx);
        const w = hallDef(base.idx, seed);
        const sim = play(w, seed, [0.5, 0.8, 0.97][n % 3]);
        const log: Action[] = JSON.parse(JSON.stringify(sim.log)); // over the wire
        expect(replayHall(w, seed, log), `seed ${seed}`).toEqual(sim.result());
      }
    });
  }

  it('the bot sometimes wins, sometimes fails (the test covers both)', () => {
    const stars = new Set<number>();
    for (let n = 0; n < 30; n++) {
      const seed = hallSeed(77 + n, 2);
      stars.add(play(hallDef(2, seed), seed, [0.3, 0.97][n % 2]).result().stars);
    }
    expect(stars.has(0)).toBe(true);
    expect([...stars].some((s) => s > 0)).toBe(true);
  });

  it('a log cannot claim more than was played', () => {
    const seed = hallSeed(5, 1);
    const w = hallDef(1, seed);
    const honest = play(w, seed, 0.97).result();
    // An empty log: nobody seated, the toi falls apart.
    expect(replayHall(w, seed, []).score).toBe(0);
    // Garbage and invented gifts are ignored rather than crashing or paying out.
    const junk = [null, { k: -1, a: 'gift', id: 0 }, { k: 5, a: 'place', g: 999, to: 0 }, { k: 6, a: 'tool', t: 'magic' }, { k: 7, a: 'gift', id: 12345 }] as any;
    const r = replayHall(w, seed, junk);
    expect(r.coins).toBe(0);
    expect(r.score).toBeLessThanOrEqual(honest.score);
  });
});

describe('mini-game replay', () => {
  it('shashu: same taps, same catch', () => {
    for (let n = 0; n < 20; n++) {
      const sim = new ShashuSim(n * 97 + 1);
      const r = rng(n + 9);
      while (!sim.done) {
        sim.tick();
        const d = sim.drops[Math.floor(r() * sim.drops.length)];
        if (d && r() < 0.15) sim.tap(d.x + (r() - 0.5) * 10, d.y + (r() - 0.5) * 10);
        else if (r() < 0.02) sim.tap(r() * 180, r() * 320);
      }
      const taps = JSON.parse(JSON.stringify(sim.log));
      expect(replayShashu(n * 97 + 1, taps)).toEqual({ candies: sim.candies, coins: sim.coins });
    }
  });

  it('betashar: perfect, good and missed bows pay 3, 1 and 0', () => {
    const sim = new BetasharSim();
    const [a, b, c] = sim.notes;
    sim.tap(a.at + 0.05); // perfect
    sim.tap(b.at - 0.15); // good
    sim.tap(c.at + 0.5); // too late: missed, and ignored
    expect(sim.notes.slice(0, 3).map((x) => x.judged)).toEqual(['perfect', 'good', 'miss']);
    expect(sim.coins).toBe(4);
    expect(replayBetashar(sim.log)).toEqual({ coins: 4 });
  });

  it('betashar: tapping all the time earns no more than playing well', () => {
    const spam: number[] = [];
    for (let t = 0; t < 30; t += 0.02) spam.push(t);
    expect(replayBetashar(spam).coins).toBeLessThanOrEqual(12 * 3);
    // Out-of-order taps are dropped.
    const sim = new BetasharSim();
    expect(replayBetashar([sim.notes[1].at, sim.notes[0].at]).coins).toBe(3);
  });
});
