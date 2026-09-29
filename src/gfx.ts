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

// 3x5 glyphs, rows concatenated.
const GLYPHS: Record<string, string> = {
  A: '.X.X.XXXXX.XX.X', B: 'XX.X.XXX.X.XXX.', C: '.XXX..X..X...XX', D: 'XX.X.XX.XX.XXX.',
  E: 'XXXX..XX.X..XXX', F: 'XXXX..XX.X..X..', G: '.XXX..X.XX.X.XX', H: 'X.XX.XXXXX.XX.X',
  I: 'XXX.X..X..X.XXX', J: '..X..X..XX.X.X.', K: 'X.XX.XXX.X.XX.X', L: 'X..X..X..X..XXX',
  M: 'X.XXXXXXXX.XX.X', N: 'XX.X.XX.XX.XX.X', O: '.X.X.XX.XX.X.X.', P: 'XX.X.XXX.X..X..',
  Q: '.X.X.XX.XXX..XX', R: 'XX.X.XXX.X.XX.X', S: '.XXX...X...XXX.', T: 'XXX.X..X..X..X.',
  U: 'X.XX.XX.XX.XXXX', V: 'X.XX.XX.XX.X.X.', W: 'X.XX.XXXXXXXX.X', X: 'X.XX.X.X.X.XX.X',
  Y: 'X.XX.X.X..X..X.', Z: 'XXX..X.X.X..XXX',
  '0': 'XXXX.XX.XX.XXXX', '1': '.X.XX..X..X.XXX', '2': 'XX...X.X.X..XXX', '3': 'XX...X.X...XXX.',
  '4': 'X.XX.XXXX..X..X', '5': 'XXXX..XX...XXX.', '6': '.XXX..XXXX.XXXX', '7': 'XXX..X.X..X..X.',
  '8': 'XXXX.XXXXX.XXXX', '9': 'XXXX.XXXX..XXX.',
  '!': '.X..X..X.....X.', '?': 'XX...X.X.....X.', '.': '.............X.', ',': '..........X.X..',
  ':': '....X.....X....', '-': '......XXX......', '+': '....X.XXX.X....', '/': '..X..X.X.X..X..',
  "'": '.X..X..........', '%': 'X.X..X.X.X..X.X', '(': '.X.X..X..X...X.', ')': '.X...X..X..X.X.',
  '*': '...X.X.X.X.X...', '=': '...XXX...XXX...', '<': '..X.X.X...X...X', '>': 'X...X...X.X.X..',
  '#': 'X.XXXXX.XXXXX.X', _: '............XXX',
};

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
  return s.length ? (s.length * 4 - 1) * scale : 0;
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
      for (let i = 0; i < 15; i++) {
        if (g[i] === 'X') ctx.fillRect(cx + (i % 3) * scale, cy + Math.floor(i / 3) * scale, scale, scale);
      }
    }
    cx += 4 * scale;
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
