// Guest sprites (16x16) and small icons, built from text templates.
import { C, canvas } from './gfx';

const PAL: Record<string, string> = {
  k: C.brown, w: C.cream, g: C.gold, r: C.red, m: C.maroon, t: C.teal, s: C.tan, n: C.green,
};

export type Kind = 'aksakal' | 'azhe' | 'kuda' | 'kudagi' | 'zhigit' | 'kelin' | 'child' | 'akim' | 'asaba';

const ADULT = [
  '................',
  '................',
  '................',
  '....kkkkkkkk....',
  '....kssssssk....',
  '....kssssssk....',
  '....kskssksk....',
  '....kssssssk....',
  '....kssmmssk....',
  '.....kssssk.....',
  '...kcccccccck...',
  '..kccccddcccck..',
  '..kcsccddccsck..',
  '..kccccddcccck..',
  '..kccccddcccck..',
  '...kkkkkkkkkk...',
];

const CHILD = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '....kkkkkkkk....',
  '....kssssssk....',
  '....kskssksk....',
  '....kssssssk....',
  '....kssmmssk....',
  '.....kssssk.....',
  '....kccddcck....',
  '...kcscddcsck...',
  '...kcccddccck...',
  '...kcccddccck...',
  '....kkkkkkkk....',
];

// Overlays: row index -> 16-char row, '.' keeps the base pixel.
type Overlay = Record<number, string>;

const KALPAK: Overlay = {
  0: '......wwww......', 1: '.....wwwwww.....', 2: '....wwwwwwww....', 3: '...kkkkkkkkkk...',
  7: '.....w....w.....', 8: '.....wwmmww.....', 9: '.....wwwwww.....', 10: '......wwww......', 11: '.......ww.......',
};
const KIMESHEK: Overlay = {
  2: '.....wwwwww.....', 3: '....wwwwwwww....', 4: '...wwwwwwwwww...',
  5: '...w........w...', 6: '...w........w...', 7: '...w........w...', 8: '...w........w...',
  9: '...ww......ww...', 10: '...wwwwwwwwww...',
};
const BORIK: Overlay = {
  1: '......gggg......', 2: '.....mmmmmm.....', 3: '...kkkkkkkkkk...', 4: '...kkkkkkkkkk...',
};
const KUDAGI_SCARF: Overlay = {
  1: '......gggg......', 2: '.....mmmmmm.....', 3: '....mmmmmmmm....', 4: '...mmmmmmmmmm...',
  5: '...m........m...', 6: '...m........m...', 7: '...m........m...', 8: '...mm......mm...', 9: '....m......m....',
};
const HAIR: Overlay = { 2: '....kkkkkkkk....', 3: '...kkkkkkkkkk...', 4: '....kkkkkkkk....' };
const BRAIDS: Overlay = {
  1: '.....gggggg.....', 2: '....kkkkkkkk....', 3: '...kkkkkkkkkk...', 4: '...kk......kk...',
  5: '...k........k...', 6: '...k........k...', 7: '...k........k...', 8: '...k........k...', 9: '...k........k...',
};
const AKIM: Overlay = { 2: '....kkkkkkkk....', 3: '...kkkkkkkkkk...', 6: '....kwkwwkwk....', 12: '.......rr.......', 13: '.......rr.......' };
const ASABA: Overlay = { ...HAIR, 9: '............kk..', 10: '............kk..', 11: '............k...' };
const BOY: Overlay = { 4: '......gggg......', 5: '....kkkkkkkk....' };
const GIRL: Overlay = { 4: '.....kkkkkk.....', 5: '....kkkkkkkk....', 6: '..kk........kk..', 7: '..k..........k..' };

function build(base: string[], over: Overlay, cloth: string, trim: string): HTMLCanvasElement {
  const [cv, c] = canvas(16, 16);
  for (let y = 0; y < 16; y++) {
    const o = over[y];
    for (let x = 0; x < 16; x++) {
      let ch = o && o[x] !== '.' ? o[x] : base[y][x];
      if (ch === 'c') ch = cloth;
      else if (ch === 'd') ch = trim;
      if (ch === '.' || !PAL[ch]) continue;
      c.fillStyle = PAL[ch];
      c.fillRect(x, y, 1, 1);
    }
  }
  return cv;
}

const cache = new Map<string, HTMLCanvasElement>();

/** variant picks clothing colors so crowds don't look cloned. */
export function guestSprite(kind: Kind, variant = 0): HTMLCanvasElement {
  const key = kind + variant;
  let s = cache.get(key);
  if (s) return s;
  const v = variant % 2;
  switch (kind) {
    case 'aksakal': s = build(ADULT, KALPAK, v ? 'm' : 'k', 'g'); break;
    case 'azhe': s = build(ADULT, KIMESHEK, v ? 'n' : 'm', 'g'); break;
    case 'kuda': s = build(ADULT, BORIK, 'g', 'm'); break;
    case 'kudagi': s = build(ADULT, KUDAGI_SCARF, 'g', 'w'); break;
    case 'zhigit': s = build(ADULT, HAIR, v ? 'n' : 'w', v ? 'w' : 'k'); break;
    case 'kelin': s = build(ADULT, BRAIDS, v ? 'n' : 'w', 'g'); break;
    case 'child': s = v ? build(CHILD, GIRL, 'w', 'n') : build(CHILD, BOY, 'n', 'g'); break;
    case 'akim': s = build(ADULT, AKIM, 'k', 'w'); break;
    case 'asaba': s = build(ADULT, ASABA, 'm', 'g'); break;
  }
  cache.set(key, s!);
  return s!;
}

function icon(rows: string[], map: Record<string, string> = PAL): HTMLCanvasElement {
  const [cv, c] = canvas(rows[0].length, rows.length);
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    c.fillStyle = map[ch];
    c.fillRect(x, y, 1, 1);
  }));
  return cv;
}

export const RING = icon(['.kwk.', 'kgggk', 'gk.kg', 'gk.kg', 'kgggk']);
export const BOLT = icon(['..kgk', '.kggk', 'kgggk', 'kggk.', 'kgk..', 'kk...']);
export const STAR = icon([
  '....g....', '...ggg...', '...ggg...', 'ggggggggg', '.ggggggg.', '..ggggg..', '..ggggg..', '.ggg.ggg.', '.gg...gg.',
]);
export const STAR_OFF = icon([
  '....k....', '...kkk...', '...kkk...', 'kkkkkkkkk', '.kkkkkkk.', '..kkkkk..', '..kkkkk..', '.kkk.kkk.', '.kk...kk.',
]);
export const COIN = icon(['.kkkkk.', 'kgggggk', 'kgwgggk', 'kggkggk', 'kgggggk', 'kgggggk', '.kkkkk.']);
export const BIGCOIN = icon([
  '..kkkkk..', '.kgggggk.', 'kgwwgggGk', 'kgwggggGk', 'kgggkgggk', 'kggggggGk', 'kgggggGGk', '.kGGGGGk.', '..kkkkk..',
], { ...PAL, G: C.tan });

const CANDY_ROWS = ['w.......w', 'ww.ooo.ww', 'wwoowooww', 'ww.ooo.ww', 'w.......w'];
export const CANDIES = [C.red, C.teal, C.green, C.maroon].map((col) => icon(CANDY_ROWS, { ...PAL, o: col }));
export const WARN = icon(['krk', 'krk', 'krk', 'kkk', 'krk', 'kkk'], { k: C.cream, r: C.red });
