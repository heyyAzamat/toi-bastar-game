// Desktop/laptop atmosphere: a night-steppe toi around the portrait game, drawn at the same pixel scale.
// Phones (little room on the sides) keep the plain background.
import { C, setCtx, rect, band, vband, img, canvas } from './gfx';
import { guestSprite, type Kind } from './sprites';

const DANCERS: Kind[] = ['aksakal', 'kelin', 'zhigit', 'azhe', 'kuda', 'child', 'kudagi', 'nagashy', 'kelin', 'zhigit'];

let cv: HTMLCanvasElement;
let c: CanvasRenderingContext2D;
let W = 0;
let H = 0;
let gameX = 0; // game canvas position in backdrop pixels
let gameY = 0;
let active = false;
const stars: { x: number; y: number; p: number }[] = [];
const sparks: { x: number; y: number; vx: number; vy: number; t: number; c: string }[] = [];
let nextFirework = 2;
let sky: HTMLCanvasElement | null = null; // static layer: sky gradient, steppe, moon

export function initBackdrop(el: HTMLCanvasElement) {
  cv = el;
  c = cv.getContext('2d')!;
}

/** Called on every resize with the game's integer pixel scale (device pixels per game pixel). */
export function layoutBackdrop(scale: number, dpr: number) {
  const vw = innerWidth * dpr;
  const vh = innerHeight * dpr;
  W = Math.ceil(vw / scale);
  H = Math.ceil(vh / scale);
  gameX = Math.floor((W - 180) / 2);
  gameY = Math.floor((H - 320) / 2);
  // Worth decorating only when there is real room beside the game.
  active = gameX >= 48;
  cv.width = W;
  cv.height = H;
  cv.style.width = `${(W * scale) / dpr}px`;
  cv.style.height = `${(H * scale) / dpr}px`;
  cv.style.display = active ? 'block' : 'none';
  if (active) buildSky();
  stars.length = 0;
  for (let i = 0; i < Math.floor((W * H) / 900); i++) stars.push({ x: Math.random() * W, y: Math.random() * H * 0.55, p: Math.random() * 6 });
}

function yurt(x: number, ground: number, s: number, t: number) {
  // Felt dome + walls, lattice band, glowing door.
  const w = 60 * s;
  const wallH = 18 * s;
  for (let r = 0; r < 22 * s; r++) {
    const hw = Math.floor((w / 2) * Math.sqrt(1 - Math.pow(1 - r / (22 * s), 2)));
    rect(x - hw, ground - wallH - 22 * s + r, hw * 2, 1, C.cream);
  }
  rect(x - w / 2, ground - wallH, w, wallH, C.cream);
  for (let i = 0; i < w; i += 4) rect(x - w / 2 + i, ground - wallH + 3, 2, 2, C.tan);
  rect(x - w / 2, ground - wallH, w, 1, C.gold);
  band(x - w / 2, ground - wallH + 6, w, C.maroon, C.cream);
  rect(x - 6 * s, ground - 22 * s - wallH - 2, 12 * s, 3, C.tan);
  const glow = Math.floor(t * 3) % 2 ? C.gold : C.cream;
  rect(x - 5 * s, ground - 14 * s, 10 * s, 14 * s, C.brown);
  rect(x - 4 * s, ground - 13 * s, 8 * s, 13 * s, glow);
}

function campfire(x: number, y: number, t: number) {
  if (y > H - 8) return;
  // Logs, flickering flame, the black kazan on a tripod.
  rect(x - 9, y + 6, 18, 2, C.brown);
  rect(x - 7, y + 4, 14, 2, C.tan);
  const f = Math.floor(t * 10) % 3;
  rect(x - 4, y - 2 - f, 8, 6 + f, C.red);
  rect(x - 2, y - 4 + f, 4, 6, C.gold);
  rect(x - 1, y - 6 - f, 2, 3, C.cream);
  rect(x - 11, y - 18, 1, 24, C.brown);
  rect(x + 10, y - 18, 1, 24, C.brown);
  rect(x - 11, y - 18, 22, 1, C.brown);
  rect(x - 7, y - 14, 14, 8, C.brown);
  rect(x - 8, y - 14, 16, 2, C.brown);
  for (let i = 0; i < 3; i++) {
    const sy = y - 18 - ((t * 12 + i * 7) % 20);
    rect(x - 2 + Math.sin(t * 2 + i) * 3, sy, 1, 1, C.cream);
  }
}

function outdoorTable(x: number, y: number, t: number) {
  if (y > H - 12) return;
  rect(x - 30, y, 60, 10, C.cream);
  rect(x - 30, y, 60, 1, C.gold);
  rect(x - 30, y + 9, 60, 1, C.gold);
  for (let i = 0; i < 9; i++) rect(x - 26 + i * 6, y + 3 + (i % 2) * 3, 3, 2, [C.gold, C.tan, C.red, C.teal][i % 4]);
  const seated: Kind[] = ['aksakal', 'azhe', 'kuda', 'kelin', 'zhigit', 'child'];
  seated.forEach((k, i) => {
    const bob = Math.floor(t * 2 + i) % 5 === 0 ? 1 : 0;
    const sx = x - 30 + i * 11;
    img(guestSprite(k, i % 2), sx - 3, (i % 2 ? y + 8 : y - 14) - bob);
  });
}

function garland(x0: number, x1: number, y: number, sag: number, t: number) {
  const n = Math.max(2, Math.floor((x1 - x0) / 8));
  const cols = [C.gold, C.red, C.teal, C.green, C.cream];
  for (let i = 0; i <= n; i++) {
    const p = i / n;
    const x = x0 + (x1 - x0) * p;
    const yy = y + Math.sin(p * Math.PI) * sag;
    rect(x, yy, 1, 1, C.tan);
    if (i % 2 === 0) {
      const on = Math.floor(t * 2 + i) % 3 !== 0;
      rect(x - 1, yy + 1, 2, 2, on ? cols[(i / 2) % cols.length] : C.brown);
    }
  }
}

function firework(t: number, dt: number) {
  nextFirework -= dt;
  if (nextFirework <= 0) {
    nextFirework = 1.5 + Math.random() * 3;
    const side = Math.random() < 0.5 ? Math.random() * (gameX - 30) + 15 : gameX + 180 + 15 + Math.random() * (W - gameX - 210);
    const y = 20 + Math.random() * H * 0.3;
    const col = [C.gold, C.red, C.teal, C.cream, C.green][Math.floor(Math.random() * 5)];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const sp = 18 + Math.random() * 10;
      sparks.push({ x: side, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t: 0, c: col });
    }
  }
  for (const s of sparks) {
    s.t += dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vy += 14 * dt;
  }
  for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].t > 1.4) sparks.splice(i, 1);
  for (const s of sparks) if (Math.floor(s.t * 10 + s.x) % 5) rect(s.x, s.y, 1, 1, s.c);
  void t;
}

function buildSky() {
  const [s, sc] = canvas(W, H);
  const prev = setCtx(sc);
  const ground = Math.floor(H * 0.72);
  // Night sky: an ordered dither from deep brown to maroon at the horizon.
  rect(0, 0, W, H, C.brown);
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = Math.floor(H * 0.25); y < ground; y++) {
    const p = (y - H * 0.25) / (ground - H * 0.25);
    for (let x = 0; x < W; x++) if (bayer[(y % 4) * 4 + (x % 4)] + 0.5 < p * 16) rect(x, y, 1, 1, C.maroon);
  }
  // Moon.
  const mx = Math.floor(gameX * 0.4);
  for (let y = -7; y <= 7; y++) {
    const hw = Math.floor(Math.sqrt(49 - y * y));
    rect(mx - hw, 34 + y, hw * 2, 1, C.cream);
  }
  rect(mx - 2, 31, 3, 3, C.tan);
  rect(mx + 2, 36, 2, 2, C.tan);
  // Steppe.
  rect(0, ground, W, H - ground, C.green);
  for (let x = 0; x < W; x += 3) rect(x, ground + 2 + ((x * 7) % 9), 1, 1, C.brown);
  rect(0, ground, W, 1, C.tan);
  // Steppe flowers and grass tufts, fading with distance.
  const hash = (n: number) => {
    let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    return (h ^ (h >>> 16)) >>> 0;
  };
  for (let i = 0; i < W; i++) {
    const x = hash(i * 3) % W;
    const y = ground + 14 + (hash(i * 3 + 1) % Math.max(1, H - ground - 16));
    const k = hash(i * 3 + 2) % 7;
    rect(x, y, 1, k < 3 ? 2 : 1, k === 0 ? C.red : k === 1 ? C.gold : k === 2 ? C.cream : C.brown);
  }
  setCtx(prev);
  sky = s;
}

/** Where the game canvas sits, in backdrop pixels (main.ts positions it on this grid). */
export function setBackdropOrigin(x: number, y: number) {
  gameX = x;
  gameY = y;
}

export function drawBackdrop(t: number, dt: number) {
  if (!active) return;
  const prev = setCtx(c);
  const ground = Math.floor(H * 0.72);
  c.drawImage(sky!, 0, 0);
  for (const s of stars) if (Math.floor(t * 2 + s.p) % 7) rect(s.x, s.y, 1, 1, Math.floor(t + s.p) % 5 ? C.cream : C.gold);
  firework(t, dt);
  // Yurts on both sides, a toi in full swing.
  const leftSpace = gameX;
  const rightX = gameX + 180;
  yurt(Math.floor(leftSpace * 0.45), ground, leftSpace > 140 ? 2 : 1, t);
  yurt(Math.floor(rightX + (W - rightX) * 0.55), ground, W - rightX > 140 ? 2 : 1, t + 0.5);
  garland(0, gameX - 6, 8, 18, t);
  garland(rightX + 6, W, 8, 18, t);
  // Dancers hopping on the grass.
  const slots = Math.floor((leftSpace - 20) / 22);
  for (let i = 0; i < slots; i++) {
    const hop = Math.floor(t * 4 + i) % 2;
    img(guestSprite(DANCERS[i % DANCERS.length], i), 10 + i * 22, ground + 10 - hop * 2);
  }
  const rslots = Math.floor((W - rightX - 20) / 22);
  for (let i = 0; i < rslots; i++) {
    const hop = Math.floor(t * 4 + i + 1) % 2;
    img(guestSprite(DANCERS[(i + 3) % DANCERS.length], i + 1), rightX + 14 + i * 22, ground + 10 - hop * 2);
  }
  // Left: a kazan on the fire. Right: a dastarkhan on the grass with guests around it.
  campfire(Math.floor(leftSpace * 0.45), ground + 44, t);
  outdoorTable(Math.floor(rightX + (W - rightX) * 0.5), ground + 46, t);
  // Ornament frame around the game.
  rect(gameX - 8, gameY - 4, 196, 328, C.brown);
  vband(gameX - 6, gameY - 2, 324, C.gold, C.maroon);
  vband(gameX + 181, gameY - 2, 324, C.gold, C.maroon);
  setCtx(prev);
}
