// Scene base class, buttons, router.
import { C, rect, box, textS, measure, FONT_H } from './gfx';
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

export function go(name: string, data?: any) {
  current?.exit();
  current = scenes[name];
  current.pressed = null;
  current.enter(data);
}
