// Pixel drawing primitives: palette, 3x5 bitmap font, ornament borders.

export const C = {
  maroon: '#7A1E2B',
  red: '#C8323C',
  teal: '#2E9CA6',
  gold: '#E8B64C',
  cream: '#F4E9D3',
  tan: '#B5793A',
  brown: '#3B2418',
  green: '#5E8C3A',
} as const;

export const W = 180;
export const H = 320;

// 5x7 proportional pixel font (LCD-style caps). Rows separated by '|'; glyph width = row length.
const FONT_SRC: Record<string, string> = {
  A: '.XXX.|X...X|X...X|XXXXX|X...X|X...X|X...X', B: 'XXXX.|X...X|X...X|XXXX.|X...X|X...X|XXXX.',
  C: '.XXX.|X...X|X....|X....|X....|X...X|.XXX.', D: 'XXXX.|X...X|X...X|X...X|X...X|X...X|XXXX.',
  E: 'XXXX|X...|X...|XXX.|X...|X...|XXXX', F: 'XXXX|X...|X...|XXX.|X...|X...|X...',
  G: '.XXX.|X...X|X....|X.XXX|X...X|X...X|.XXXX', H: 'X...X|X...X|X...X|XXXXX|X...X|X...X|X...X',
  I: 'XXX|.X.|.X.|.X.|.X.|.X.|XXX', J: '...X|...X|...X|...X|...X|X..X|.XX.',
  K: 'X...X|X..X.|X.X..|XX...|X.X..|X..X.|X...X', L: 'X...|X...|X...|X...|X...|X...|XXXX',
  M: 'X...X|XX.XX|X.X.X|X.X.X|X...X|X...X|X...X', N: 'X...X|X...X|XX..X|X.X.X|X..XX|X...X|X...X',
  O: '.XXX.|X...X|X...X|X...X|X...X|X...X|.XXX.', P: 'XXXX.|X...X|X...X|XXXX.|X....|X....|X....',
  Q: '.XXX.|X...X|X...X|X...X|X.X.X|X..X.|.XX.X', R: 'XXXX.|X...X|X...X|XXXX.|X.X..|X..X.|X...X',
  S: '.XXXX|X....|X....|.XXX.|....X|....X|XXXX.', T: 'XXXXX|..X..|..X..|..X..|..X..|..X..|..X..',
  U: 'X...X|X...X|X...X|X...X|X...X|X...X|.XXX.', V: 'X...X|X...X|X...X|X...X|X...X|.X.X.|..X..',
  W: 'X...X|X...X|X...X|X.X.X|X.X.X|X.X.X|.X.X.', X: 'X...X|X...X|.X.X.|..X..|.X.X.|X...X|X...X',
  Y: 'X...X|X...X|.X.X.|..X..|..X..|..X..|..X..', Z: 'XXXXX|....X|...X.|..X..|.X...|X....|XXXXX',
  '0': '.XXX.|X...X|X..XX|X.X.X|XX..X|X...X|.XXX.', '1': '.X.|XX.|.X.|.X.|.X.|.X.|XXX',
  '2': '.XXX.|X...X|....X|...X.|..X..|.X...|XXXXX', '3': 'XXXXX|...X.|..X..|...X.|....X|X...X|.XXX.',
  '4': '...X.|..XX.|.X.X.|X..X.|XXXXX|...X.|...X.', '5': 'XXXXX|X....|XXXX.|....X|....X|X...X|.XXX.',
  '6': '..XX.|.X...|X....|XXXX.|X...X|X...X|.XXX.', '7': 'XXXXX|....X|...X.|..X..|.X...|.X...|.X...',
  '8': '.XXX.|X...X|X...X|.XXX.|X...X|X...X|.XXX.', '9': '.XXX.|X...X|X...X|.XXXX|....X|...X.|.XX..',
  '!': 'X|X|X|X|X|.|X', '?': '.XXX.|X...X|....X|...X.|..X..|.....|..X..', '.': '.|.|.|.|.|.|X',
  ',': '..|..|..|..|..|.X|X.', ':': '.|.|X|.|.|X|.', '-': '....|....|....|XXXX|....|....|....',
  '+': '.....|..X..|..X..|XXXXX|..X..|..X..|.....', '/': '....X|....X|...X.|..X..|.X...|X....|X....',
  "'": 'X|X|.|.|.|.|.', '%': 'XX...|XX..X|...X.|..X..|.X...|X..XX|...XX', '(': '.X|X.|X.|X.|X.|X.|.X',
  ')': 'X.|.X|.X|.X|.X|.X|X.', '*': '.....|..X..|X.X.X|.XXX.|X.X.X|..X..|.....', '=': '....|....|XXXX|....|XXXX|....|....',
  '<': '...X|..X.|.X..|X...|.X..|..X.|...X', '>': 'X...|.X..|..X.|...X|..X.|.X..|X...',
  '#': '.X.X.|.X.X.|XXXXX|.X.X.|XXXXX|.X.X.|.X.X.', _: '....|....|....|....|....|....|XXXX', ' ': '..|..|..|..|..|..|..',
};

// Cyrillic (Russian + Kazakh). Letters that look like Latin ones reuse those glyphs.
const CYR_SRC: Record<string, string> = {
  'Б': 'XXXXX|X....|X....|XXXX.|X...X|X...X|XXXX.', 'Г': 'XXXX|X...|X...|X...|X...|X...|X...',
  'Д': '..XX.|.X.X.|.X.X.|.X.X.|.X.X.|XXXXX|X...X', 'Ё': '.X.X|....|XXXX|X...|XXX.|X...|XXXX',
  'Ж': 'X.X.X|X.X.X|.XXX.|..X..|.XXX.|X.X.X|X.X.X', 'З': '.XXX.|X...X|....X|..XX.|....X|X...X|.XXX.',
  'И': 'X...X|X...X|X..XX|X.X.X|XX..X|X...X|X...X', 'Й': '.X.X.|..X..|X...X|X..XX|X.X.X|XX..X|X...X',
  'Л': '..XXX|.X..X|.X..X|.X..X|.X..X|.X..X|X...X', 'П': 'XXXXX|X...X|X...X|X...X|X...X|X...X|X...X',
  'У': 'X...X|X...X|X...X|.XXXX|....X|X...X|.XXX.', 'Ф': '..X..|.XXX.|X.X.X|X.X.X|X.X.X|.XXX.|..X..',
  'Ц': 'X..X.|X..X.|X..X.|X..X.|X..X.|XXXXX|....X', 'Ч': 'X...X|X...X|X...X|.XXXX|....X|....X|....X',
  'Ш': 'X.X.X|X.X.X|X.X.X|X.X.X|X.X.X|X.X.X|XXXXX', 'Щ': 'X.X.X.|X.X.X.|X.X.X.|X.X.X.|X.X.X.|XXXXXX|.....X',
  'Ъ': 'XX...|.X...|.X...|.XXX.|.X..X|.X..X|.XXX.', 'Ы': 'X...X|X...X|X...X|XXX.X|X..XX|X..XX|XXX.X',
  'Ь': 'X...|X...|X...|XXX.|X..X|X..X|XXX.', 'Э': '.XXX.|X...X|....X|..XXX|....X|X...X|.XXX.',
  'Ю': 'X..X.|X.X.X|X.X.X|XXX.X|X.X.X|X.X.X|X..X.', 'Я': '.XXXX|X...X|X...X|.XXXX|..X.X|.X..X|X...X',
  'Ә': '.XXX.|....X|....X|XXXXX|X...X|X...X|.XXX.', 'Ғ': '.XXXX|.X...|.X...|XXX..|.X...|.X...|.X...',
  'Қ': 'X..X.|X.X..|XX...|XX...|X.X..|X..X.|X..XX', 'Ң': 'X...X.|X...X.|X...X.|XXXXX.|X...X.|X...X.|X...XX',
  'Ө': '.XXX.|X...X|X...X|XXXXX|X...X|X...X|.XXX.', 'Ұ': 'X...X|X...X|.X.X.|..X..|XXXXX|..X..|..X..',
  'Һ': 'X...|X...|XXX.|X..X|X..X|X..X|X..X',
};
const CYR_ALIAS: Record<string, string> = {
  'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X', 'І': 'I', 'Ү': 'Y',
};
Object.assign(FONT_SRC, CYR_SRC);
for (const [c, l] of Object.entries(CYR_ALIAS)) FONT_SRC[c] = FONT_SRC[l];

export const FONT_H = 7;

const GLYPHS: Record<string, { w: number; rows: string[] }> = {};
for (const [ch, src] of Object.entries(FONT_SRC)) {
  const rows = src.split('|');
  GLYPHS[ch] = { w: rows[0].length, rows };
}

export let ctx: CanvasRenderingContext2D;

export function setCtx(c: CanvasRenderingContext2D): CanvasRenderingContext2D {
  const prev = ctx;
  ctx = c;
  ctx.imageSmoothingEnabled = false;
  return prev;
}

export function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  return [cv, c];
}

export function rect(x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function box(x: number, y: number, w: number, h: number, c: string) {
  rect(x, y, w, 1, c);
  rect(x, y + h - 1, w, 1, c);
  rect(x, y, 1, h, c);
  rect(x + w - 1, y, 1, h, c);
}

export function measure(s: string, scale = 1) {
  let w = 0;
  for (const ch of s.toUpperCase()) w += ((GLYPHS[ch]?.w ?? 3) + 1) * scale;
  return Math.max(0, w - scale);
}

export type Align = 'l' | 'c' | 'r';

export function text(s: string, x: number, y: number, c: string, scale = 1, align: Align = 'l') {
  s = s.toUpperCase();
  let cx = Math.round(align === 'c' ? x - measure(s, scale) / 2 : align === 'r' ? x - measure(s, scale) : x);
  const cy = Math.round(y);
  ctx.fillStyle = c;
  for (const ch of s) {
    const g = GLYPHS[ch];
    if (g) {
      for (let r = 0; r < FONT_H; r++) {
        const row = g.rows[r];
        for (let i = 0; i < g.w; i++) if (row[i] === 'X') ctx.fillRect(cx + i * scale, cy + r * scale, scale, scale);
      }
    }
    cx += ((g?.w ?? 3) + 1) * scale;
  }
}

/** Text with a 1px drop shadow. */
export function textS(s: string, x: number, y: number, c: string, scale = 1, align: Align = 'l', sh: string = C.brown) {
  text(s, x + scale, y + scale, sh, scale, align);
  text(s, x, y, c, scale, align);
}

/** Text with a full outline, for titles over busy backgrounds. */
export function textO(s: string, x: number, y: number, c: string, scale = 1, align: Align = 'l', o: string = C.brown) {
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    text(s, x + dx * scale, y + dy * scale, o, scale, align);
  }
  text(s, x, y, c, scale, align);
}

export function wrap(s: string, maxW: number, scale = 1): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const word of s.split(' ')) {
    const next = cur ? cur + ' ' + word : word;
    if (measure(next, scale) > maxW && cur) {
      lines.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

export function img(cv: CanvasImageSource, x: number, y: number, scale = 1, w?: number, h?: number) {
  const iw = w ?? (cv as HTMLCanvasElement).width;
  const ih = h ?? (cv as HTMLCanvasElement).height;
  ctx.drawImage(cv, Math.round(x), Math.round(y), iw * scale, ih * scale);
}

// Koshkar muiz (ram's horn) tile, 8x5.
const ORN = ['.gg..gg.', 'g..gg..g', 'g.g..g.g', '.g.gg.g.', '...gg...'];

export function band(x: number, y: number, w: number, fg: string = C.gold, bg: string = C.maroon) {
  rect(x, y, w, 5, bg);
  ctx.fillStyle = fg;
  for (let tx = 0; tx < w; tx += 8) {
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 8 && tx + c < w; c++) {
        if (ORN[r][c] === 'g') ctx.fillRect(x + tx + c, y + r, 1, 1);
      }
    }
  }
}

/** Vertical ornament band (the tile rotated). */
export function vband(x: number, y: number, h: number, fg: string = C.gold, bg: string = C.maroon) {
  rect(x, y, 5, h, bg);
  ctx.fillStyle = fg;
  for (let ty = 0; ty < h; ty += 8) {
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 8 && ty + c < h; c++) {
        if (ORN[r][c] === 'g') ctx.fillRect(x + r, y + ty + c, 1, 1);
      }
    }
  }
}

/** Panel with koshkar muiz bands on top and bottom. */
export function panel(x: number, y: number, w: number, h: number, bg: string = C.maroon) {
  rect(x + 1, y + 1, w, h, C.brown); // shadow
  rect(x, y, w, h, bg);
  box(x, y, w, h, C.gold);
  box(x + 2, y + 7, w - 4, h - 14, C.gold);
  band(x + 1, y + 1, w - 2, C.gold, C.maroon);
  band(x + 1, y + h - 6, w - 2, C.gold, C.maroon);
}

export function bar(x: number, y: number, w: number, h: number, frac: number, fg: string, bg: string = C.maroon) {
  rect(x - 1, y - 1, w + 2, h + 2, C.tan);
  rect(x, y, w, h, bg);
  const fw = Math.max(0, Math.min(w, Math.round(w * frac)));
  rect(x, y, fw, h, fg);
  if (fw > 1) rect(x, y, fw, 1, C.cream);
}
