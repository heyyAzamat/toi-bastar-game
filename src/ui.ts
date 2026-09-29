// Scene base class, buttons, router.
import { C, rect, box, textS, measure, FONT_H, band } from './gfx';
import { sfx } from './audio';

export interface Btn {
  x: number; y: number; w: number; h: number;
  label: string;
  onClick: () => void;
  primary?: boolean;
  hidden?: boolean;
  disabled?: boolean;
}

export const btn = (x: number, y: number, w: number, h: number, label: string, onClick: () => void, primary = false): Btn =>
  ({ x, y, w, h, label, onClick, primary });

const inside = (b: Btn, x: number, y: number) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;

export function drawBtn(b: Btn, pressed: boolean) {
  const off = pressed ? 1 : 0;
  if (!pressed) rect(b.x + 1, b.y + 2, b.w, b.h, C.brown);
  const fill = b.disabled ? C.brown : b.primary ? C.red : C.maroon;
  rect(b.x + off, b.y + off, b.w, b.h, fill);
  box(b.x + off, b.y + off, b.w, b.h, b.disabled ? C.tan : C.gold);
  if (!b.disabled) rect(b.x + 1 + off, b.y + 1 + off, b.w - 2, 1, b.primary ? C.gold : C.red);
  const scale = b.h >= 18 && measure(b.label, 2) <= b.w - 6 ? 2 : 1;
  textS(b.label, b.x + b.w / 2 + off, b.y + Math.floor((b.h - FONT_H * scale) / 2) + off, b.disabled ? C.tan : C.cream, scale, 'c');
}

export abstract class Scene {
  buttons: Btn[] = [];
  pressed: Btn | null = null;
  enter(_data?: any) {}
  exit() {}
  update(_dt: number) {}
  abstract draw(): void;
  onDown(_x: number, _y: number) {}
  onMove(_x: number, _y: number) {}
  onUp(_x: number, _y: number) {}

  down(x: number, y: number) {
    this.pressed = this.buttons.find((b) => !b.hidden && inside(b, x, y)) ?? null;
    if (!this.pressed) this.onDown(x, y);
  }
  move(x: number, y: number) { this.onMove(x, y); }
  up(x: number, y: number) {
    const b = this.pressed;
    this.pressed = null;
    if (b) {
      if (inside(b, x, y) && !b.disabled) {
        sfx('click');
        b.onClick();
      }
      return;
    }
    this.onUp(x, y);
  }
  drawButtons() {
    for (const b of this.buttons) if (!b.hidden) drawBtn(b, b === this.pressed);
  }
}

const scenes: Record<string, Scene> = {};
export let current: Scene;

export function register(name: string, s: Scene) { scenes[name] = s; }

function switchTo(name: string, data?: any) {
  current?.exit();
  current = scenes[name];
  current.pressed = null;
  current.enter(data);
}

// Scene changes close an ornamental curtain, swap scenes, then open it again.
const CURTAIN = 0.18;
const trans = { phase: 0 as 0 | 1 | 2, t: 0, next: null as [string, any] | null };

export function go(name: string, data?: any) {
  if (!current) return switchTo(name, data);
  trans.next = [name, data];
  if (trans.phase === 2) trans.t = CURTAIN - trans.t; // reverse a curtain that is still opening
  else if (trans.phase === 0) trans.t = 0;
  trans.phase = 1;
}

export const transitioning = () => trans.phase !== 0;

export function updateTransition(dt: number) {
  if (!trans.phase) return;
  trans.t += dt;
  if (trans.t < CURTAIN) return;
  if (trans.phase === 1) {
    const [name, data] = trans.next!;
    trans.next = null;
    switchTo(name, data);
    trans.phase = 2;
    trans.t = 0;
  } else trans.phase = 0;
}

export function drawTransition() {
  if (!trans.phase) return;
  const p = Math.min(1, trans.t / CURTAIN);
  const cover = trans.phase === 1 ? p : 1 - p;
  const h = Math.ceil(cover * 162);
  rect(0, 0, 180, h, C.maroon);
  rect(0, 320 - h, 180, h, C.maroon);
  if (h > 5) {
    band(0, h - 5, 180);
    band(0, 320 - h, 180);
  }
}
