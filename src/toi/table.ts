// The host's dastarkhan for "My Toi": 16 seats in the palace hall, the host at the tor.
import { C, canvas, setCtx, rect, box, band, text, textS, img, ctx, wrap } from '../gfx';
import { WAVES, type WaveDef } from '../waves';
import { layout, renderBackground, type Layout } from '../hall';
import { guestSprite, type Kind } from '../sprites';
import { t } from '../i18n';
import type { ToiInvite } from './link';
import { showDate } from './link';
import type { Wish } from './chain';

export const TOI_WAVE: WaveDef = { ...WAVES[3], seats: 16, honorRows: 1, childRows: 0, cousin: false };
export const AVATARS: Kind[] = ['zhigit', 'kelin', 'aksakal', 'azhe', 'nagashy', 'kuda', 'kudagi', 'child'];

export function avatarSprite(code: string) {
  const kind = code.replace(/\d$/, '') as Kind;
  return guestSprite(AVATARS.includes(kind) ? kind : 'zhigit', Number(code.slice(-1)) || 0);
}

function seedOf(id: string) {
  let h = 7;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

export class ToiTable {
  L: Layout;
  bg: HTMLCanvasElement;
  constructor(public inv: ToiInvite) {
    this.L = layout(TOI_WAVE);
    this.bg = renderBackground(TOI_WAVE, this.L, seedOf(inv.id));
  }

  seatAt(x: number, y: number) {
    let best = -1;
    let bd = 12;
    for (const s of this.L.seats) {
      const d = Math.hypot(s.x + 8 - x, s.y + 9 - y);
      if (d < bd) { bd = d; best = s.i; }
    }
    return best;
  }

  /** Background, the host at the tor, and every seated guest. */
  draw(seats: Map<number, Wish>, clock: number, mine?: { seat: number; avatar: string; hop: number }) {
    ctx.drawImage(this.bg, 0, 0);
    const hostY = this.L.tableTop - 20;
    img(guestSprite('kuda', 0), 82, hostY - (Math.floor(clock * 2) % 2));
    for (const s of this.L.seats) {
      const w = seats.get(s.i);
      if (w) img(avatarSprite(w.avatar), s.x, s.y - (Math.floor(clock * 2 + s.i * 0.37) % 4 === 0 ? 1 : 0));
    }
    if (mine && mine.seat >= 0) {
      const s = this.L.seats[mine.seat];
      const lift = mine.hop > 0 ? Math.round(Math.sin((mine.hop / 0.35) * Math.PI) * 5) : 0;
      if (Math.floor(clock * 4) % 2) box(s.x - 1, s.y - 1, 18, 18, C.gold);
      img(avatarSprite(mine.avatar), s.x, s.y - lift);
    }
  }

  /** Toi Estelygi: the table with everyone seated, the toi name and date. Returns PNG bytes (4x). */
  snapshot(seats: Map<number, Wish>): { png: Uint8Array; dataUrl: string } {
    const [shot, sc] = canvas(180, 320);
    let prev = setCtx(sc);
    this.draw(seats, 0);
    setCtx(prev);
    const top = this.L.tableTop - 40;
    const ch = this.L.tableTop + this.L.tableH + 6 - top;
    const w = 100;
    const title = wrap(this.inv.n, 92);
    const h = ch + 36 + title.length * 9;
    const [cv, c] = canvas(w, h);
    prev = setCtx(c);
    rect(0, 0, w, h, C.maroon);
    band(0, 0, w);
    band(0, h - 5, w);
    textS(t('estelygi'), w / 2, 7, C.gold, 1, 'c');
    c.drawImage(shot, 46, top, 88, ch, 6, 16, 88, ch);
    box(0, 15, w, ch + 2, C.gold);
    title.forEach((l, i) => textS(l, w / 2, 20 + ch + i * 9, C.cream, 1, 'c'));
    text(showDate(this.inv.d), w / 2, 21 + ch + title.length * 9, C.gold, 1, 'c');
    setCtx(prev);
    const [big, bc] = canvas(w * 4, h * 4);
    bc.drawImage(cv, 0, 0, w * 4, h * 4);
    const dataUrl = big.toDataURL('image/png');
    const bin = atob(dataUrl.split(',')[1]);
    return { png: Uint8Array.from(bin, (ch2) => ch2.charCodeAt(0)), dataUrl };
  }
}
