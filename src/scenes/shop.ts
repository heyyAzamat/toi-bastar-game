// Bazaar: spend Shashu/Betashar tenge on cosmetics.
import { C, rect, box, text, textS, textO, band, vband, img, wrap, canvas, setCtx } from '../gfx';
import { Scene, btn, go } from '../ui';
import { sfx, playMusic } from '../audio';
import { COIN } from '../sprites';
import { t } from '../i18n';
import { profile } from '../storage';
import { CATALOG, TABLECLOTHS, owns, buyOrEquip, type Slot } from '../shop';
import { avatarSprite } from '../toi/table';

const SLOTS: Slot[] = ['table', 'feast', 'orn', 'avatar'];
const ORN_COLOR: Record<string, string> = { gold: C.gold, cream: C.cream, teal: C.teal, green: C.green };

export class ShopScene extends Scene {
  slot: Slot = 'table';
  status = '';
  clock = 0;
  enter() {
    this.status = '';
    this.build();
    playMusic('bipyl');
  }
  build() {
    this.buttons = SLOTS.map((s, i) => {
      const b = btn(12 + (i % 2) * 79, 36 + Math.floor(i / 2) * 16, 77, 14, t('slot_' + s), () => { this.slot = s; this.status = ''; this.build(); });
      b.primary = this.slot === s;
      return b;
    });
    this.buttons.push(btn(20, 294, 140, 16, t('back'), () => go('start')));
  }
  rows() {
    return CATALOG[this.slot].map((item, i) => ({ item, y: 126 + i * 20 }));
  }
  onDown(x: number, y: number) {
    for (const { item, y: ry } of this.rows()) {
      if (y >= ry && y < ry + 19 && x > 10 && x < 170) {
        const r = buyOrEquip(this.slot, item);
        if (r === 'poor') {
          this.status = t('notEnough');
          sfx('bad');
        } else {
          this.status = '';
          sfx(r === 'bought' ? 'coin' : 'pick');
        }
      }
    }
  }
  update(dt: number) { this.clock += dt; }
  preview(id: string, x: number, y: number) {
    if (this.slot === 'table') {
      const [cloth, trim, inner] = TABLECLOTHS[id];
      rect(x, y, 22, 14, cloth);
      box(x, y, 22, 14, trim);
      box(x + 2, y + 2, 18, 10, inner);
    } else if (this.slot === 'feast') {
      rect(x, y, 22, 14, C.cream);
      box(x, y, 22, 14, C.gold);
      rect(x + 3, y + 5, 4, 3, C.teal);
      if (id !== 'plain') for (let i = 0; i < 4; i++) rect(x + 9 + (i % 2) * 2, y + 3 + i * 2, 2, 1, C.gold);
      if (id === 'kazy') for (let i = 0; i < 2; i++) { rect(x + 13 + i * 4, y + 8, 3, 3, C.brown); rect(x + 14 + i * 4, y + 9, 1, 1, C.cream); }
    } else if (this.slot === 'orn') {
      band(x, y + 4, 22, ORN_COLOR[id], C.maroon);
    } else img(avatarSprite(id), x + 3, y - 2);
  }
  draw() {
    rect(0, 0, 180, 320, C.maroon);
    for (let y = 0; y < 320; y += 6) for (let x = (y / 6) % 2 ? 0 : 3; x < 180; x += 6) rect(x, y, 1, 1, C.red);
    band(0, 0, 180);
    band(0, 315, 180);
    vband(0, 5, 310);
    vband(175, 5, 310);
    textO(t('bazaar'), 90, 9, C.gold, 2, 'c');
    img(COIN, 64, 26);
    textS(t('tengeN', profile.coins), 74, 27, C.gold);
    this.drawButtons();

    // Big preview of what is equipped in this slot.
    const eq = profile.equip[this.slot];
    rect(40, 70, 100, 52, C.brown);
    box(40, 70, 100, 52, C.gold);
    if (this.slot === 'avatar') {
      const hop = Math.floor(this.clock * 3) % 2;
      img(avatarSprite(eq), 74, 78 - hop, 2);
    } else {
      // Render the swatch small, then show it 3x.
      const [sw, sc] = canvas(22, 16);
      const prev = setCtx(sc);
      this.preview(eq, 0, 1);
      setCtx(prev);
      img(sw, 57, 72, 3);
    }

    for (const { item, y } of this.rows()) {
      const mine = owns(this.slot, item.id);
      const on = eq === item.id;
      rect(12, y, 156, 19, on ? C.red : C.brown);
      box(12, y, 156, 19, on ? C.gold : C.tan);
      this.preview(item.id, 16, y + 2);
      const name = this.slot === 'avatar' ? t('k_' + item.id.replace(/\d$/, '')) + (item.id.endsWith('1') ? ' II' : '') : t(`${this.slot}_${item.id}`);
      textS(name, 44, y + 6, C.cream);
      if (on) textS(t('equipped'), 164, y + 6, C.gold, 1, 'r');
      else if (mine) text(t('use'), 164, y + 6, C.cream, 1, 'r');
      else {
        const ok = profile.coins >= item.price;
        textS(String(item.price), 154, y + 6, ok ? C.gold : C.tan, 1, 'r');
        img(COIN, 156, y + 6);
      }
    }
    if (this.status) wrap(this.status, 160).forEach((l, i) => textO(l, 90, 270 + i * 9, C.red, 1, 'c'));
  }
}
