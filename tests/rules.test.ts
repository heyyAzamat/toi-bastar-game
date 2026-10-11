// The eight seating rules, one at a time, and the promise that every generated hall can be seated perfectly.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  WAVES, MODS, check, hallDef, hallSeed, layout, makeGuests, stoolSeat, withMod,
  type Guest, type Kind, type ModId, type Seat, type Side, type WaveDef,
} from '../src/sim/rules';

// --- helpers -----------------------------------------------------------------------

/** A 16-seat hall (8 rows) with the given rules: honor rows 0-2, child rows 6-7. */
const hall = (rules: number[]): WaveDef => ({ ...WAVES[1], rules, childRows: 2 });

// Ids index the guest list (rivals point at them), so every test starts from 0.
let nextId = 0;
beforeEach(() => { nextId = 0; });
function g(kind: Kind, side: Side, extra: Partial<Guest> = {}): Guest {
  return {
    id: nextId++, kind, side, name: kind, look: 0, maxP: 10, patience: 10, arriveAt: 0, state: 'queue', seat: -1,
    rival: -1, feud: 0, pair: 0, family: 0, runDelay: 0, seatedAt: 0, happyT: 0, viol: [], rewarded: false, ...extra,
  };
}

/** Seat index of (row, side) in the two-column layout. */
const at = (row: number, side: 'groom' | 'bride') => row * 2 + (side === 'groom' ? 0 : 1);

function seat(guests: Guest[], who: Guest, i: number) {
  who.state = 'seated';
  who.seat = i;
  return guests;
}

function verdict(w: WaveDef, guests: Guest[], who: Guest, i: number, seats: Seat[] = layout(w).seats) {
  const v = check(w, seats, guests, who, i);
  return v;
}

// --- the rules ---------------------------------------------------------------------

describe('rule 1: elders near the tor, young guests off the tor row', () => {
  const w = hall([1]);
  it('an elder in an honor row is fine, further down is not', () => {
    const a = g('aksakal', 'groom');
    expect(verdict(w, [a], a, at(1, 'groom'))).toEqual([]);
    expect(verdict(w, [a], a, at(5, 'groom'))).toEqual(['elder']);
  });
  it('a young guest on the tor row is not', () => {
    const z = g('zhigit', 'groom');
    expect(verdict(w, [z], z, at(0, 'groom'))).toEqual(['tor']);
    expect(verdict(w, [z], z, at(4, 'groom'))).toEqual([]);
  });
});

describe('rule 2: groom left, bride right', () => {
  const w = hall([2]);
  it('flags the wrong side only', () => {
    const k = g('kelin', 'bride');
    expect(verdict(w, [k], k, at(4, 'bride'))).toEqual([]);
    expect(verdict(w, [k], k, at(4, 'groom'))).toEqual(['side']);
  });
  it('a guest with no side can sit on either', () => {
    const a = g('akim', 'none');
    expect(verdict(w, [a], a, at(0, 'groom'))).toEqual([]);
  });
});

describe('rule 3: kuda in honored seats, facing their pair', () => {
  const w = hall([3]);
  it('needs an honor row', () => {
    const k = g('kuda', 'groom', { pair: 1 });
    expect(verdict(w, [k], k, at(5, 'groom'))).toEqual(['kuda']);
  });
  it('faces the partner across the same row', () => {
    const a = g('kuda', 'groom', { pair: 1 });
    const b = g('kuda', 'bride', { pair: 1 });
    const gs = seat([a, b], a, at(1, 'groom'));
    expect(verdict(w, gs, b, at(1, 'bride'))).toEqual([]);
    expect(verdict(w, gs, b, at(2, 'bride'))).toEqual(['face']);
  });
});

describe('rule 4: feuding relatives never side by side', () => {
  const w = hall([4]);
  it('adjacent on the same side is a feud, across the table is not', () => {
    const a = g('zhigit', 'groom');
    const b = g('renzhigen', 'groom', { rival: a.id });
    a.rival = b.id;
    const gs = seat([a, b], a, at(4, 'groom'));
    expect(verdict(w, gs, b, at(5, 'groom'))).toEqual(['feud']);
    expect(verdict(w, gs, b, at(6, 'groom'))).toEqual([]);
    expect(verdict(w, gs, b, at(4, 'bride'))).toEqual([]);
  });
});

describe('rule 5: children by the door', () => {
  const w = hall([5]);
  it('child rows and the stool are fine, elsewhere is not', () => {
    const c = g('child', 'groom');
    const L = layout(w);
    const seats = [...L.seats, stoolSeat(L)];
    expect(verdict(w, [c], c, at(7, 'groom'), seats)).toEqual([]);
    expect(verdict(w, [c], c, at(3, 'groom'), seats)).toEqual(['child']);
    expect(verdict(w, [c], c, seats.length - 1, seats)).toEqual([]);
  });
});

describe('rule 6: the cousin from the aul does not get the stool', () => {
  const w = hall([6]);
  it('the stool is for someone else', () => {
    const c = g('bauyr', 'groom');
    const L = layout(w);
    const seats = [...L.seats, stoolSeat(L)];
    expect(verdict(w, [c], c, seats.length - 1, seats)).toEqual(['stool']);
    expect(verdict(w, [c], c, at(4, 'groom'), seats)).toEqual([]);
  });
});

describe('rule 7: nagashy next to their own family', () => {
  const w = hall([7]);
  it('the second one must sit next to the first', () => {
    const a = g('nagashy', 'groom', { family: 1 });
    const b = g('nagashy', 'groom', { family: 1 });
    const gs = seat([a, b], a, at(4, 'groom'));
    expect(verdict(w, gs, b, at(5, 'groom'))).toEqual([]);
    expect(verdict(w, gs, b, at(6, 'groom'))).toEqual(['family']);
  });
});

describe('rule 8: the akim on the tor row', () => {
  it('applies in every hall the akim visits', () => {
    const w = hall([1, 2]);
    const a = g('akim', 'none');
    expect(verdict(w, [a], a, at(0, 'bride'))).toEqual([]);
    expect(verdict(w, [a], a, at(1, 'bride'))).toEqual(['akim']);
  });
});

// --- every generated hall has a perfect seating --------------------------------------

/** Backtracking search for a seating where nobody breaks a rule (the cousin's stool included). */
export function perfectSeating(w: WaveDef, guests: Guest[]): number[] | null {
  const L = layout(w);
  const seats = w.cousin ? [...L.seats, stoolSeat(L)] : L.seats;
  const all = guests.map((x) => ({ ...x, state: 'pending' as Guest['state'], seat: -1 }));
  if (all.length > seats.length) return null;
  // Tightest guests first; partners right after each other so pair rules are checked as soon as both sit.
  const rank = (x: Guest) => (x.kind === 'akim' ? 0 : x.pair ? 1 : x.kind === 'aksakal' || x.kind === 'azhe' ? 2 : x.family ? 3 : x.kind === 'child' ? 4 : x.rival >= 0 ? 5 : 6);
  const order = [...all].sort((a, b) => rank(a) - rank(b) || a.pair - b.pair || a.family - b.family || a.id - b.id);
  const used = seats.map(() => false);
  const ok = () => all.every((x) => x.state !== 'seated' || !check(w, seats, all, x, x.seat).length);
  let steps = 0;
  const go = (k: number): boolean => {
    if (k === order.length) return true;
    if (++steps > 200_000) return false;
    const x = order[k];
    for (const s of seats) {
      if (used[s.i]) continue;
      x.state = 'seated';
      x.seat = s.i;
      used[s.i] = true;
      if (ok() && go(k + 1)) return true;
      used[s.i] = false;
      x.state = 'pending';
      x.seat = -1;
    }
    return false;
  };
  return go(0) ? all.map((x) => x.seat) : null;
}

describe('generator', () => {
  const mods: (ModId | null)[] = [null, ...(Object.keys(MODS) as ModId[])];
  for (const base of WAVES) {
    for (const mod of mods) {
      // The yurt never gets a twist; the saray already has its akim.
      if ((mod && base.idx === 0) || (mod === 'akim' && base.akim)) continue;
      it(`${base.hall}${mod ? ' + ' + mod : ''}: 60 seeds, each with a perfect seating`, () => {
        const w = withMod(base, mod);
        for (let seed = 1; seed <= 60; seed++) {
          const guests = makeGuests(w, seed * 7919 + base.idx);
          expect(guests.filter((x) => x.kind !== 'bauyr').length, `seed ${seed}`).toBe(w.seats);
          expect(perfectSeating(w, guests), `seed ${seed}`).not.toBeNull();
        }
      });
    }
  }

  it('is deterministic for a seed', () => {
    const w = hallDef(3, hallSeed(42, 1));
    expect(makeGuests(w, 42)).toEqual(makeGuests(w, 42));
  });
});
