// Hall geometry and the cached background (floor, dastarkhan, food, cushions).
import { C, canvas, setCtx, rect, box, band, vband, text, textS, ctx } from './gfx';
import { rng, type WaveDef } from './waves';
import { t } from './i18n';

export interface Seat {
  i: number;
  row: number;
  side: 'groom' | 'bride' | 'none';
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
export const HALL_TOP = 34;
export const HALL_BOTTOM = 252;

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

function circleRing(cx: number, cy: number, r: number, thick: number, a: string, b: string) {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= r && d > r - thick) rect(x, y, 1, 1, (x + y) % 3 === 0 ? b : a);
    }
  }
}

function disc(cx: number, cy: number, r: number, c: string) {
  for (let y = -r; y <= r; y++) {
    const hw = Math.floor(Math.sqrt(r * r - y * y));
    rect(cx - hw, cy + y, hw * 2 + 1, 1, c);
  }
}

function floor(w: WaveDef) {
  const T = HALL_TOP, Hh = HALL_BOTTOM - HALL_TOP;
  if (w.hall === 'yurt') {
    rect(0, T, 180, Hh, C.green);
    for (let i = 0; i < 60; i++) rect((i * 53) % 180, T + ((i * 37) % Hh), 1, 1, C.brown);
    disc(90, 146, 104, C.tan);
    // Kerege (lattice wall).
    circleRing(90, 146, 104, 5, C.cream, C.brown);
    // Tekemet felt carpet under the table.
    rect(40, 48, 100, 196, C.maroon);
    box(42, 50, 96, 192, C.gold);
    band(44, 52, 92, C.gold, C.maroon);
    band(44, 235, 92, C.gold, C.maroon);
  } else if (w.hall === 'cafe') {
    rect(0, T, 180, Hh, C.tan);
    for (let y = T + 12; y < HALL_BOTTOM; y += 10) rect(0, y, 180, 1, C.brown);
    for (let x = 0; x < 180; x += 10) rect(x, T + 12, 1, Hh - 12, C.brown);
    rect(0, T, 180, 12, C.green);
    for (let x = 12; x < 180; x += 40) {
      rect(x, T + 2, 14, 8, C.teal);
      box(x, T + 2, 14, 8, C.cream);
      rect(x + 7, T + 2, 1, 8, C.cream);
    }
    rect(0, T + 11, 180, 1, C.gold);
    rect(44, 46, 92, 196, C.maroon);
    box(44, 46, 92, 196, C.gold);
    box(46, 48, 88, 192, C.gold);
  } else if (w.hall === 'saray') {
    // Palace: cream marble, gold inlay, teal-and-gold columns.
    rect(0, T, 180, Hh, C.cream);
    for (let y = T; y < HALL_BOTTOM; y += 12) for (let x = (y / 12) % 2 ? 0 : 12; x < 180; x += 24) rect(x, y, 12, 12, C.tan);
    for (let y = T; y < HALL_BOTTOM; y += 12) rect(0, y, 180, 1, C.gold);
    rect(40, T, 100, Hh, C.maroon);
    vband(40, T, Hh, C.gold, C.maroon);
    vband(135, T, Hh, C.gold, C.maroon);
    for (const x of [6, 164]) {
      for (let y = T + 14; y < HALL_BOTTOM - 10; y += 44) {
        rect(x, y, 10, 20, C.teal);
        rect(x + 2, y, 2, 20, C.cream);
        rect(x - 1, y - 2, 12, 3, C.gold);
        rect(x - 1, y + 19, 12, 3, C.gold);
      }
    }
  } else {
    rect(0, T, 180, Hh, C.maroon);
    for (let y = T; y < HALL_BOTTOM; y += 6) for (let x = (y / 6) % 2 ? 0 : 3; x < 180; x += 6) rect(x, y, 1, 1, C.red);
    // Red carpet runner and gold columns.
    rect(42, T, 96, Hh, C.tan);
    for (let y = T; y < HALL_BOTTOM; y += 4) rect(48, y, 84, 1, C.gold);
    vband(42, T, Hh, C.gold, C.maroon);
    vband(133, T, Hh, C.gold, C.maroon);
    for (const x of [6, 164]) {
      for (let y = T + 14; y < HALL_BOTTOM - 10; y += 44) {
        rect(x, y, 10, 20, C.cream);
        rect(x + 2, y, 2, 20, C.gold);
        rect(x - 1, y - 2, 12, 3, C.gold);
        rect(x - 1, y + 19, 12, 3, C.gold);
      }
    }
    for (const x of [24, 156]) {
      for (let y = T + 30; y < HALL_BOTTOM - 20; y += 60) {
        disc(x, y, 4, C.gold);
        rect(x - 1, y - 1, 2, 2, C.cream);
      }
    }
  }
}

function food(L: Layout, seed: number) {
  const r = rng(seed);
  const x0 = TABLE_X, w = TABLE_W;
  for (let row = 0; row < L.rows; row++) {
    const cy = L.tableTop + row * L.spacing + Math.floor(L.spacing / 2);
    // Kese (tea bowls) in front of each seat.
    for (const x of [x0 + 3, x0 + w - 7]) {
      rect(x, cy - 1, 4, 3, C.teal);
      rect(x, cy - 1, 4, 1, C.cream);
    }
    const kind = Math.floor(r() * 3);
    const mx = x0 + w / 2;
    if (kind === 0 && L.spacing >= 14) {
      // Beshbarmak platter.
      rect(mx - 6, cy - 3, 12, 6, C.cream);
      box(mx - 6, cy - 3, 12, 6, C.gold);
      for (let i = 0; i < 5; i++) rect(mx - 4 + Math.floor(r() * 8), cy - 2 + Math.floor(r() * 4), 2, 1, C.tan);
      rect(mx - 1, cy - 1, 1, 1, C.green);
    } else if (kind === 1) {
      // Baursak pile.
      for (let i = 0; i < 6; i++) rect(mx - 4 + Math.floor(r() * 7), cy - 2 + Math.floor(r() * 4), 2, 2, i % 2 ? C.gold : C.tan);
    } else {
      // Fruit and sweets.
      for (let i = 0; i < 4; i++) rect(mx - 4 + i * 2 + Math.floor(r() * 2), cy - 1 + Math.floor(r() * 3), 1, 1, [C.red, C.green, C.gold, C.maroon][i]);
    }
  }
}

export function cushionColors(s: Seat) {
  return {
    body: s.side === 'groom' ? C.teal : C.red,
    trim: s.zone === 'honor' ? C.gold : s.zone === 'child' ? C.green : C.cream,
  };
}

export function renderBackground(w: WaveDef, L: Layout, seed: number): HTMLCanvasElement {
  const [cv, c] = canvas(180, 320);
  const prev = setCtx(c);
  floor(w);

  // Tor: embroidered tuskiiz behind the top end.
  const tt = L.tableTop;
  rect(TABLE_X - 22, tt - 21, TABLE_W + 44, 16, C.maroon);
  band(TABLE_X - 21, tt - 20, TABLE_W + 42, C.gold, C.maroon);
  box(TABLE_X - 22, tt - 21, TABLE_W + 44, 16, C.gold);
  textS(t('tor'), 90, tt - 14, C.cream, 1, 'c');

  // Side labels.
  textS(t('groom'), 23, tt - 16, C.teal, 1, 'c');
  textS(t('bride'), 157, tt - 16, C.red, 1, 'c');

  // Dastarkhan.
  rect(TABLE_X + 1, tt - 3, TABLE_W, L.tableH + 6, C.brown);
  rect(TABLE_X, tt - 4, TABLE_W, L.tableH + 6, C.cream);
  box(TABLE_X, tt - 4, TABLE_W, L.tableH + 6, C.gold);
  box(TABLE_X + 2, tt - 2, TABLE_W - 4, L.tableH + 2, C.tan);
  food(L, seed);

  // Cushions (korpe).
  for (const s of L.seats) {
    const { body, trim } = cushionColors(s);
    rect(s.x + 1, s.y + 7, 14, 9, C.brown);
    rect(s.x, s.y + 6, 14, 9, body);
    box(s.x, s.y + 6, 14, 9, trim);
  }

  // Door (esik).
  rect(74, HALL_BOTTOM - 11, 32, 11, C.brown);
  rect(76, HALL_BOTTOM - 9, 28, 9, C.tan);
  text(t('door'), 90, HALL_BOTTOM - 8, C.brown, 1, 'c');

  setCtx(prev);
  return cv;
}

export function drawBackground(bg: HTMLCanvasElement) {
  ctx.drawImage(bg, 0, 0);
}
