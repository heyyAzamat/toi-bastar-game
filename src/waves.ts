// Wave definitions and guest generation. Every generated wave has at least one perfect seating.
import { guestSprite, type Kind } from './sprites';

export type Side = 'groom' | 'bride' | 'none';
export type HallKind = 'yurt' | 'cafe' | 'banquet';

export interface WaveDef {
  n: number;
  name: string;
  hall: HallKind;
  seats: number;
  rules: number[];
  honorRows: number; // rows from the tor that count as "near the tor"
  childRows: number; // rows at the door end reserved for children (rule 5)
  window: number; // seconds over which guests arrive
  surprise: boolean;
}

export const WAVES: WaveDef[] = [
  { n: 1, name: 'KIIZ UI', hall: 'yurt', seats: 8, rules: [1, 2], honorRows: 2, childRows: 0, window: 40, surprise: false },
  { n: 2, name: 'KAFE', hall: 'cafe', seats: 16, rules: [1, 2, 3, 4], honorRows: 3, childRows: 0, window: 52, surprise: false },
  { n: 3, name: 'TOIKHANA', hall: 'banquet', seats: 24, rules: [1, 2, 3, 4, 5], honorRows: 4, childRows: 4, window: 58, surprise: true },
];

export const WAVE_TIME = 75;

export const RULE_TEXT: Record<number, string> = {
  1: 'ELDERS (AKSAKAL, AZHE) SIT NEAR THE TOR: GOLD SEATS. NO YOUNG GUEST ON THE TOR ROW.',
  2: 'KUIEU SIDE (BLUE) SITS LEFT. KELIN SIDE (RED) SITS RIGHT.',
  3: 'KUDA (RING) TAKE GOLD SEATS, FACING THEIR PAIR ACROSS THE TABLE.',
  4: 'GUESTS WITH A BOLT ARE FEUDING: NOT NEXT TO EACH OTHER.',
  5: 'CHILDREN SIT AT THE DOOR END: GREEN SEATS.',
};

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

const NAMES: Record<string, string[]> = {
  aksakal: ['KENZHE ATA', 'ORAZ ATA', 'ZHAKSYLYK ATA', 'TOLEU ATA', 'BAKHYT ATA', 'SABIT ATA'],
  azhe: ['RAUSHAN AZHE', 'BIBIGUL AZHE', 'KULYAN AZHE', 'ZHAMAL AZHE', 'SAKEN AZHE'],
  kuda: ['KUDA BEKZAT', 'KUDA ERBOL', 'KUDA SAMAT', 'KUDA ZHANDOS'],
  kudagi: ['KUDAGI ROZA', 'KUDAGI ALMA', 'KUDAGI SHOLPAN', 'KUDAGI LAURA'],
  zhigit: ['NURLAN', 'SERIK', 'BOLAT', 'DAULET', 'ARMAN', 'ERLAN', 'ASAN', 'MARAT', 'RUSLAN', 'TIMUR', 'ASKAR', 'KAIRAT', 'ERZHAN'],
  kelin: ['AIGERIM', 'DANA', 'MADINA', 'GULNAR', 'ZHANAR', 'SAULE', 'AIZHAN', 'DINARA', 'ASEL', 'KAMILA', 'MERUERT'],
  child: ['ARU', 'ALIKHAN', 'DIAS', 'TOMIRIS', 'ANSAR', 'AYARU', 'NURAI', 'ALAN'],
  akim: ['AKIM MUKHTAR'],
};

export function makeGuests(w: WaveDef, seed: number): Guest[] {
  const r = rng(seed);
  const pick = (a: string[]) => a[Math.floor(r() * a.length)];
  const names: Record<string, string[]> = {};
  for (const k in NAMES) names[k] = shuffle([...NAMES[k]], r);
  let id = 0;
  const guests: Guest[] = [];
  const add = (kind: Kind, side: Side) => {
    const g: Guest = {
      id: id++, kind, side, name: names[kind].pop() ?? kind.toUpperCase(),
      sprite: guestSprite(kind, Math.floor(r() * 2)),
      maxP: 8 + r() * 4, patience: 0, arriveAt: 0, state: 'pending', seat: -1,
      rival: -1, feud: 0, pair: 0, viol: [], rewarded: false,
    };
    g.patience = g.maxP;
    guests.push(g);
    return g;
  };
  const adult = (side: Side) => add(r() < 0.5 ? 'zhigit' : 'kelin', side);
  const elder = (side: Side) => add(r() < 0.5 ? 'aksakal' : 'azhe', side);
  const perSide = w.seats / 2;
  const sides: Side[] = r() < 0.5 ? ['groom', 'bride'] : ['bride', 'groom'];

  if (w.n === 1) {
    for (const s of sides) {
      const e = 1 + Math.floor(r() * 2);
      for (let i = 0; i < e; i++) elder(s);
      for (let i = e; i < perSide; i++) adult(s);
    }
  } else if (w.n === 2) {
    for (const s of sides) {
      add('kuda', s);
      const e = 1 + Math.floor(r() * 2);
      for (let i = 0; i < e; i++) elder(s);
      for (let i = 1 + e; i < perSide; i++) adult(s);
    }
  } else {
    // sides[1] leaves one gold seat free: that's where the surprise akim belongs.
    sides.forEach((s, i) => {
      add('kuda', s);
      add('kudagi', s);
      const e = i === 0 ? 2 : 1;
      for (let j = 0; j < e; j++) elder(s);
      const kids = 2 + Math.floor(r() * 3);
      for (let j = 0; j < kids; j++) add('child', s);
      const used = 2 + e + kids + (i === 1 ? 1 : 0);
      for (let j = used; j < perSide; j++) adult(s);
    });
  }

  // Kuda pairs: the same kind from opposite sides face each other.
  let pairNo = 1;
  for (const kind of ['kuda', 'kudagi'] as Kind[]) {
    const a = guests.find((g) => g.kind === kind && g.side === 'groom');
    const b = guests.find((g) => g.kind === kind && g.side === 'bride');
    if (a && b) { a.pair = b.pair = pairNo++; }
  }

  // Feuds between same-side adults.
  if (w.rules.includes(4)) {
    const feuds = w.n === 2 ? 2 : 3;
    for (let f = 1; f <= feuds; f++) {
      const s = sides[f % 2];
      const free = shuffle(guests.filter((g) => g.side === s && (g.kind === 'zhigit' || g.kind === 'kelin') && g.rival < 0), r);
      if (free.length < 2) continue;
      free[0].rival = free[1].id;
      free[1].rival = free[0].id;
      free[0].feud = free[1].feud = f;
    }
  }

  // Arrival schedule.
  const order = shuffle([...guests], r);
  const n = order.length;
  order.forEach((g, i) => {
    g.arriveAt = 1 + (i * (w.window - 2)) / Math.max(1, n - 1) + (r() - 0.5) * 1.2;
  });
  if (w.surprise) {
    const a = add('akim', 'none');
    a.name = pick(NAMES.akim);
    a.maxP = a.patience = 12;
    a.arriveAt = w.window * 0.55;
  }
  return guests;
}

export const KIND_LABEL: Record<Kind, string> = {
  aksakal: 'AKSAKAL - ELDER', azhe: 'AZHE - ELDER', kuda: 'KUDA - IN-LAW', kudagi: 'KUDAGI - IN-LAW',
  zhigit: 'GUEST', kelin: 'GUEST', child: 'BALA - CHILD', akim: 'AKIM - VIP!', asaba: 'ASABA',
};
