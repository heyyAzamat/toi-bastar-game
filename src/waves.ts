// Halls, rules and guest generation. Every generated hall has at least one perfect seating.
import { guestSprite, type Kind } from './sprites';

export type Side = 'groom' | 'bride' | 'none';
export type HallKind = 'yurt' | 'cafe' | 'banquet' | 'saray';

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
}

export const WAVES: WaveDef[] = [
  { idx: 0, hall: 'yurt', seats: 8, rules: [1, 2], honorRows: 2, childRows: 0, window: 40, feuds: 0, families: 0, cousin: false, akim: false, patMul: 1, rep: 0 },
  { idx: 1, hall: 'cafe', seats: 16, rules: [1, 2, 3, 4], honorRows: 3, childRows: 0, window: 52, feuds: 2, families: 0, cousin: false, akim: false, patMul: 1, rep: 300 },
  { idx: 2, hall: 'banquet', seats: 24, rules: [1, 2, 3, 4, 5, 6], honorRows: 4, childRows: 4, window: 56, feuds: 2, families: 0, cousin: true, akim: false, patMul: 1, rep: 1000 },
  { idx: 3, hall: 'saray', seats: 24, rules: [1, 2, 3, 4, 5, 6, 7, 8], honorRows: 4, childRows: 4, window: 56, feuds: 2, families: 2, cousin: true, akim: true, patMul: 0.85, rep: 2200 },
];

/** The guided first round: 4 seats, no clock, the azhe shows every move. */
export const TUTORIAL: WaveDef = { idx: -1, hall: 'yurt', seats: 4, rules: [1, 2], honorRows: 1, childRows: 0, window: 0, feuds: 0, families: 0, cousin: false, akim: false, patMul: 1, rep: 0 };

/** Scripted tutorial guests with the seat each one should take (seat = row * 2 + side). */
export function tutorialGuests(): { guests: Guest[]; targets: number[] } {
  const mk = (id: number, kind: Kind, side: Side, name: string): Guest => ({
    id, kind, side, name, sprite: guestSprite(kind, 0), maxP: 999, patience: 999, arriveAt: id === 0 ? 0.6 : Infinity,
    state: 'pending', seat: -1, rival: -1, feud: 0, pair: 0, family: 0, runDelay: 0, seatedAt: 0, happyT: 0, viol: [], rewarded: false,
  });
  return {
    guests: [mk(0, 'aksakal', 'groom', 'ОРАЗ АТА'), mk(1, 'kelin', 'bride', 'ДАНА'), mk(2, 'azhe', 'bride', 'РАУШАН ӘЖЕ'), mk(3, 'zhigit', 'groom', 'АРМАН')],
    targets: [0, 3, 1, 2],
  };
}

export const WAVE_TIME = 75;

export interface Guest {
  id: number;
  kind: Kind;
  side: Side;
  name: string;
  sprite: HTMLCanvasElement;
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

export function makeGuests(w: WaveDef, seed: number): Guest[] {
  const r = rng(seed);
  const names: Record<string, string[]> = {};
  for (const k in NAMES) names[k] = shuffle([...NAMES[k]], r);
  let id = 0;
  const guests: Guest[] = [];
  const add = (kind: Kind, side: Side) => {
    // Elders have the shortest fuse; children the longest.
    const base = kind === 'aksakal' || kind === 'azhe' ? 6 + r() * 1.5 : kind === 'child' ? 9 + r() * 3 : 8.5 + r() * 3;
    const g: Guest = {
      id: id++, kind, side, name: names[kind].pop() ?? kind.toUpperCase(),
      sprite: guestSprite(kind, Math.floor(r() * 2)),
      maxP: base * w.patMul, patience: 0, arriveAt: 0, state: 'pending', seat: -1,
      rival: -1, feud: 0, pair: 0, family: 0,
      runDelay: kind === 'child' && w.rules.includes(5) ? 10 + r() * 14 : 0,
      seatedAt: 0, happyT: 0, viol: [], rewarded: false,
    };
    g.patience = g.maxP;
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
    // The akim takes a gold seat on sides[1], so that side brings one elder fewer.
    const elders = w.seats >= 24 ? (w.akim && i === 1 ? 1 : 2) : 1 + Math.floor(r() * 2);
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
