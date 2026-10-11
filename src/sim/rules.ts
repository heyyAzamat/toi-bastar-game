// Pure game data and rules: halls, guest generation, seat geometry and the seating check.
// No DOM, no Math.random: the browser and the server (api/run) run exactly the same code.

export type Kind = 'aksakal' | 'azhe' | 'kuda' | 'kudagi' | 'zhigit' | 'kelin' | 'child' | 'akim' | 'asaba'
  | 'nagashy' | 'renzhigen' | 'bauyr';
export type Side = 'groom' | 'bride' | 'none';
export type HallKind = 'yurt' | 'cafe' | 'banquet' | 'saray';

/** Hall modifiers: one twist per hall (never in the first), picked from the run seed. */
export type ModId = 'hurry' | 'heat' | 'akim' | 'generous';
export interface Mod { id: ModId; mul: number }
export const MODS: Record<ModId, Mod> = {
  hurry: { id: 'hurry', mul: 1.15 }, // the asaba comes early: 55 s instead of 75
  heat: { id: 'heat', mul: 1.15 }, // a hot day: everyone's patience is a quarter shorter
  akim: { id: 'akim', mul: 1.1 }, // the akim drops in on a hall that doesn't expect him
  generous: { id: 'generous', mul: 1 }, // shashu coins float up twice as often
};

/**
 * Rules, in the order they are introduced:
 * 1 elders near the tor, 2 sides, 3 kuda face each other, 4 feud (offended relative),
 * 5 children by the door (and they run off), 6 cousin from the aul, 7 nagashy next to family, 8 akim on the tor.
 */
export interface WaveDef {
  idx: number;
  hall: HallKind;
  seats: number;
  rules: number[];
  honorRows: number; // rows from the tor that count as "near the tor"
  childRows: number; // rows at the door end reserved for children
  window: number; // seconds over which guests arrive
  feuds: number;
  families: number;
  cousin: boolean; // arrives once the table is full; a stool appears
  akim: boolean;
  patMul: number;
  rep: number; // toishy reputation needed to unlock the hall
  time?: number; // seconds until the asaba arrives (default WAVE_TIME)
  mod?: ModId | null;
  giftMul?: number; // how often shashu coins float up (2 = twice as often)
}

export const WAVE_TIME = 75;

export const WAVES: WaveDef[] = [
  { idx: 0, hall: 'yurt', seats: 8, rules: [1, 2], honorRows: 2, childRows: 0, window: 40, feuds: 0, families: 0, cousin: false, akim: false, patMul: 1, rep: 0 },
  { idx: 1, hall: 'cafe', seats: 16, rules: [1, 2, 3, 4], honorRows: 3, childRows: 0, window: 52, feuds: 2, families: 0, cousin: false, akim: false, patMul: 1, rep: 300 },
  { idx: 2, hall: 'banquet', seats: 24, rules: [1, 2, 3, 4, 5, 6], honorRows: 4, childRows: 4, window: 56, feuds: 2, families: 0, cousin: true, akim: false, patMul: 1, rep: 1000 },
  { idx: 3, hall: 'saray', seats: 24, rules: [1, 2, 3, 4, 5, 6, 7, 8], honorRows: 4, childRows: 4, window: 56, feuds: 2, families: 2, cousin: true, akim: true, patMul: 0.85, rep: 2200 },
];

/** The guided first round: 4 seats, no clock, the azhe shows every move. */
export const TUTORIAL: WaveDef = { idx: -1, hall: 'yurt', seats: 4, rules: [1, 2], honorRows: 1, childRows: 0, window: 0, feuds: 0, families: 0, cousin: false, akim: false, patMul: 1, rep: 0 };

/** Seed of one hall inside a run (retries of the same hall replay the same guests). */
export const hallSeed = (runSeed: number, wave: number) => (runSeed + wave * 7919) >>> 0;

/** The modifier a hall gets in a run: none in the yurt, otherwise one in four halls plays straight. */
export function pickMod(hallIdx: number, seed: number): ModId | null {
  if (hallIdx <= 0) return null;
  const r = rng(seed ^ 0x5bd1e995);
  const ids: (ModId | null)[] = [null, 'hurry', 'heat', 'generous', ...(WAVES[hallIdx].akim ? [] : ['akim' as const])];
  return ids[Math.floor(r() * ids.length)];
}

/** The hall definition with its modifier applied. */
export function withMod(w: WaveDef, mod: ModId | null): WaveDef {
  const out: WaveDef = { ...w, mod, time: w.time ?? WAVE_TIME, giftMul: 1 };
  if (mod === 'hurry') { out.time = 55; out.window = Math.min(w.window, 42); }
  if (mod === 'heat') out.patMul = w.patMul * 0.75;
  if (mod === 'generous') out.giftMul = 2;
  if (mod === 'akim' && !w.akim) { out.akim = true; out.rules = [...w.rules, 8]; }
  return out;
}

/** A hall as it is played in a run: WAVES entry + the run's modifier. */
export const hallDef = (hallIdx: number, seed: number) => withMod(WAVES[hallIdx], pickMod(hallIdx, seed));

export const modMul = (w: WaveDef) => (w.mod ? MODS[w.mod].mul : 1);

export interface Guest {
  id: number;
  kind: Kind;
  side: Side;
  name: string;
  look: number; // sprite variant
  maxP: number;
  patience: number;
  arriveAt: number;
  state: 'pending' | 'outside' | 'queue' | 'seated' | 'left';
  seat: number;
  rival: number; // guest id or -1
  feud: number; // feud number shown next to the bolt
  pair: number; // kuda pair number, 0 = none
  family: number; // nagashy family (colour dot), 0 = none
  runDelay: number; // children: seconds after being seated before they run off (0 = never)
  seatedAt: number;
  happyT: number; // shows the happy bubble while > 0
  viol: string[];
  rewarded: boolean;
}

export const isElder = (g: Guest) => g.kind === 'aksakal' || g.kind === 'azhe';
export const isKuda = (g: Guest) => g.kind === 'kuda' || g.kind === 'kudagi';
export const isHonored = (g: Guest) => isElder(g) || isKuda(g) || g.kind === 'akim';

export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function shuffle<T>(a: T[], r: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const guest = (id: number, kind: Kind, side: Side, name: string, look: number): Guest => ({
  id, kind, side, name, look, maxP: 0, patience: 0, arriveAt: 0, state: 'pending', seat: -1,
  rival: -1, feud: 0, pair: 0, family: 0, runDelay: 0, seatedAt: 0, happyT: 0, viol: [], rewarded: false,
});

/** Scripted tutorial guests with the seat each one should take (seat = row * 2 + side). */
export function tutorialGuests(): { guests: Guest[]; targets: number[] } {
  const mk = (id: number, kind: Kind, side: Side, name: string): Guest =>
    ({ ...guest(id, kind, side, name, 0), maxP: 999, patience: 999, arriveAt: id === 0 ? 0.6 : Infinity });
  return {
    guests: [mk(0, 'aksakal', 'groom', 'ОРАЗ АТА'), mk(1, 'kelin', 'bride', 'ДАНА'), mk(2, 'azhe', 'bride', 'РАУШАН ӘЖЕ'), mk(3, 'zhigit', 'groom', 'АРМАН')],
    targets: [0, 3, 1, 2],
  };
}

// Kazakh Cyrillic; nm() transliterates for English.
const NAMES: Record<string, string[]> = {
  aksakal: ['КЕНЖЕ АТА', 'ОРАЗ АТА', 'ЖАҚСЫЛЫҚ АТА', 'ТӨЛЕУ АТА', 'БАҚЫТ АТА', 'САБИТ АТА'],
  azhe: ['РАУШАН ӘЖЕ', 'БИБІГҮЛ ӘЖЕ', 'КҮЛЯН ӘЖЕ', 'ЖАМАЛ ӘЖЕ', 'ҮМІТ ӘЖЕ'],
  kuda: ['ҚҰДА БЕКЗАТ', 'ҚҰДА ЕРБОЛ', 'ҚҰДА САМАТ', 'ҚҰДА ЖАНДОС'],
  kudagi: ['ҚҰДАҒИ РОЗА', 'ҚҰДАҒИ АЛМА', 'ҚҰДАҒИ ШОЛПАН', 'ҚҰДАҒИ ЛАУРА'],
  zhigit: ['НҰРЛАН', 'СЕРІК', 'БОЛАТ', 'ДӘУЛЕТ', 'АРМАН', 'ЕРЛАН', 'АСАН', 'МАРАТ', 'РУСЛАН', 'ТИМУР', 'АСҚАР', 'ҚАЙРАТ', 'ЕРЖАН'],
  kelin: ['ӘЙГЕРІМ', 'ДАНА', 'МАДИНА', 'ГҮЛНАР', 'ЖАНАР', 'СӘУЛЕ', 'АЙЖАН', 'ДИНАРА', 'ӘСЕЛ', 'КАМИЛА', 'МЕРУЕРТ'],
  nagashy: ['НАҒАШЫ ТАЛҒАТ', 'НАҒАШЫ ЖАНАТ', 'НАҒАШЫ ҒАЛЫМ', 'НАҒАШЫ БАХЫТ', 'НАҒАШЫ ЕРНАР', 'НАҒАШЫ СЫРЫМ'],
  renzhigen: ['ТӘТЕ ЗӘУРЕ', 'АҒА БАУЫРЖАН', 'ЖЕЗДЕ ҚАНАТ', 'АПА ГҮЛСАРА'],
  child: ['АРУ', 'ӘЛИХАН', 'ДИАС', 'ТОМИРИС', 'АНСАР', 'АЯРУ', 'НҰРАЙ', 'АЛАН'],
  bauyr: ['АУЫЛДАН ЖАСҰЛАН', 'АУЫЛДАН ДӘУРЕН', 'АУЫЛДАН МЕЙІРЖАН'],
  akim: ['ӘКІМ МҰХТАР'],
};

/** Every generated hall has at least one perfect seating (checked in tests/sim.test.ts). */
export function makeGuests(w: WaveDef, seed: number): Guest[] {
  const r = rng(seed);
  const names: Record<string, string[]> = {};
  for (const k in NAMES) names[k] = shuffle([...NAMES[k]], r);
  let id = 0;
  const guests: Guest[] = [];
  const add = (kind: Kind, side: Side) => {
    // Elders have the shortest fuse; children the longest.
    const base = kind === 'aksakal' || kind === 'azhe' ? 6 + r() * 1.5 : kind === 'child' ? 9 + r() * 3 : 8.5 + r() * 3;
    const g = guest(id++, kind, side, names[kind].pop() ?? kind.toUpperCase(), Math.floor(r() * 2));
    g.maxP = g.patience = base * w.patMul;
    g.runDelay = kind === 'child' && w.rules.includes(5) ? 10 + r() * 14 : 0;
    guests.push(g);
    return g;
  };
  const adult = (side: Side) => add(r() < 0.5 ? 'zhigit' : 'kelin', side);
  const elder = (side: Side) => add(r() < 0.5 ? 'aksakal' : 'azhe', side);
  const perSide = w.seats / 2;
  const sides: Side[] = r() < 0.5 ? ['groom', 'bride'] : ['bride', 'groom'];

  sides.forEach((s, i) => {
    let used = 0;
    if (w.rules.includes(3)) {
      add('kuda', s);
      used++;
      if (w.seats >= 24) { add('kudagi', s); used++; }
    }
    // The akim takes a gold seat on sides[1], so that side brings one elder fewer
    // (in small halls there would be no honored seat left for a second elder).
    const elders = w.seats >= 24 ? (w.akim && i === 1 ? 1 : 2) : w.akim && i === 1 ? 1 : 1 + Math.floor(r() * 2);
    for (let j = 0; j < elders; j++) elder(s);
    used += elders + (w.akim && i === 1 ? 1 : 0);
    if (w.rules.includes(5)) {
      const kids = 2 + Math.floor(r() * 2);
      for (let j = 0; j < kids; j++) add('child', s);
      used += kids;
    }
    if (i < w.families) {
      for (let j = 0; j < 2; j++) add('nagashy', s).family = i + 1;
      used += 2;
    }
    if (i < w.feuds) {
      const rv = adult(s);
      const off = add('renzhigen', s);
      off.rival = rv.id;
      rv.rival = off.id;
      off.feud = rv.feud = i + 1;
      used += 2;
    }
    for (let j = used; j < perSide; j++) adult(s);
  });

  // Kuda pairs: the same kind from opposite sides face each other.
  let pairNo = 1;
  for (const kind of ['kuda', 'kudagi'] as Kind[]) {
    const a = guests.find((g) => g.kind === kind && g.side === 'groom');
    const b = guests.find((g) => g.kind === kind && g.side === 'bride');
    if (a && b) a.pair = b.pair = pairNo++;
  }

  // Arrival schedule.
  const order = shuffle([...guests], r);
  const n = order.length;
  order.forEach((g, i) => {
    g.arriveAt = 1 + (i * (w.window - 2)) / Math.max(1, n - 1) + (r() - 0.5) * 1.2;
  });
  // The offended relative always turns up after the one they're angry with.
  for (const off of guests.filter((g) => g.kind === 'renzhigen')) {
    const rv = guests[off.rival];
    if (off.arriveAt < rv.arriveAt) [off.arriveAt, rv.arriveAt] = [rv.arriveAt, off.arriveAt];
    if (off.arriveAt - rv.arriveAt < 6) off.arriveAt = Math.min(w.window, rv.arriveAt + 6);
  }
  if (w.akim) {
    const a = add('akim', 'none');
    a.maxP = a.patience = 12;
    a.arriveAt = w.window * 0.55;
  }
  if (w.cousin) {
    // Arrival is triggered by a full table, not by the clock.
    const c = add('bauyr', sides[Math.floor(r() * 2)]);
    c.maxP = c.patience = 14;
    c.arriveAt = Infinity;
  }
  return guests;
}

/** Same challenge for everyone on a given UTC day. */
export function dailyChallenge(date = new Date()): { key: string; seed: number; hall: number } {
  const key = date.toISOString().slice(0, 10);
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const day = Math.floor(date.getTime() / 86400000);
  return { key, seed: h >>> 0, hall: 1 + (day % 3) };
}

// --- Seat geometry (pixels of the 180x320 canvas; the server only needs rows, sides and zones) ---

export interface Seat {
  i: number;
  row: number;
  side: Side;
  x: number;
  y: number;
  zone: 'honor' | 'child' | 'plain' | 'stool';
}

export interface Layout {
  rows: number;
  spacing: number;
  tableTop: number;
  tableH: number;
  seats: Seat[];
}

export const TABLE_X = 70;
export const TABLE_W = 40;

export function layout(w: WaveDef): Layout {
  const rows = w.seats / 2;
  // Halls with a cousin keep space at the door end for the stool.
  const avail = w.cousin ? 170 : 188;
  const spacing = Math.min(24, Math.floor(avail / rows));
  const tableH = rows * spacing;
  const tableTop = 52 + Math.floor((avail - tableH) / 2);
  const seats: Seat[] = [];
  for (let r = 0; r < rows; r++) {
    for (let s = 0; s < 2; s++) {
      const zone = r < w.honorRows ? 'honor' : w.childRows && r >= rows - w.childRows ? 'child' : 'plain';
      seats.push({
        i: r * 2 + s, row: r, side: s === 0 ? 'groom' : 'bride',
        x: s === 0 ? TABLE_X - 18 : TABLE_X + TABLE_W + 2,
        y: tableTop + r * spacing + Math.floor((spacing - 16) / 2),
        zone,
      });
    }
  }
  return { rows, spacing, tableTop, tableH, seats };
}

/** The cousin's stool at the door end of the table: no side, not adjacent to anyone. */
export function stoolSeat(L: Layout): Seat {
  return { i: L.seats.length, row: L.rows, side: 'none', x: TABLE_X + TABLE_W / 2 - 8, y: L.tableTop + L.tableH + 1, zone: 'stool' };
}

// --- The seating rules ---------------------------------------------------------

export const adjacent = (seats: Seat[], a: number, b: number) => {
  const sa = seats[a];
  const sb = seats[b];
  return sa.side !== 'none' && sa.side === sb.side && Math.abs(sa.row - sb.row) === 1;
};

/** Which rules guest `g` breaks sitting at seat `i`, given where everyone else currently sits. */
export function check(w: WaveDef, seats: Seat[], guests: Guest[], g: Guest, i: number): string[] {
  const s = seats[i];
  const R = w.rules;
  const v: string[] = [];
  if (R.includes(2) && g.side !== 'none' && s.side !== 'none' && g.side !== s.side) v.push('side');
  if (R.includes(1)) {
    if (isElder(g) && s.row >= w.honorRows) v.push('elder');
    if (s.row === 0 && !isHonored(g)) v.push('tor');
  }
  if (g.kind === 'akim' && s.row !== 0) v.push('akim');
  if (R.includes(3) && isKuda(g)) {
    if (s.row >= w.honorRows) v.push('kuda');
    else {
      const p = g.pair ? guests.find((o) => o !== g && o.pair === g.pair) : undefined;
      if (p && p.state === 'seated') {
        const ps = seats[p.seat];
        if (ps.row !== s.row || ps.side === s.side) v.push('face');
      }
    }
  }
  if (R.includes(4) && g.rival >= 0) {
    const rv = guests[g.rival];
    if (rv.state === 'seated' && adjacent(seats, i, rv.seat)) v.push('feud');
  }
  if (R.includes(5) && g.kind === 'child' && s.zone !== 'child' && s.zone !== 'stool') v.push('child');
  if (R.includes(6) && g.kind === 'bauyr' && s.zone === 'stool') v.push('stool');
  if (R.includes(7) && g.family) {
    const kin = guests.filter((o) => o !== g && o.family === g.family && o.state === 'seated');
    if (kin.length && !kin.some((o) => adjacent(seats, i, o.seat))) v.push('family');
  }
  return v;
}
