// Bazaar catalogue: cosmetics bought with tenge and how each one changes the game.
import { C, theme } from './gfx';
import { profile, saveProfile } from './storage';

export type Slot = 'table' | 'feast' | 'orn' | 'avatar';

export interface Item { id: string; price: number }

export const CATALOG: Record<Slot, Item[]> = {
  table: [{ id: 'cream', price: 0 }, { id: 'maroon', price: 30 }, { id: 'teal', price: 40 }, { id: 'gold', price: 60 }],
  feast: [{ id: 'plain', price: 0 }, { id: 'rich', price: 50 }, { id: 'kazy', price: 80 }],
  orn: [{ id: 'gold', price: 0 }, { id: 'cream', price: 30 }, { id: 'teal', price: 40 }, { id: 'green', price: 40 }],
  avatar: [
    { id: 'zhigit0', price: 0 }, { id: 'kelin0', price: 0 }, { id: 'zhigit1', price: 20 }, { id: 'kelin1', price: 20 },
    { id: 'nagashy0', price: 40 }, { id: 'kuda0', price: 60 }, { id: 'kudagi0', price: 60 }, { id: 'aksakal1', price: 80 },
  ],
};

/** Tablecloth colours: cloth, border, inner line. */
export const TABLECLOTHS: Record<string, [string, string, string]> = {
  cream: [C.cream, C.gold, C.tan],
  maroon: [C.maroon, C.gold, C.red],
  teal: [C.teal, C.cream, C.gold],
  gold: [C.gold, C.maroon, C.cream],
};

const ORNAMENTS: Record<string, string> = { gold: C.gold, cream: C.cream, teal: C.teal, green: C.green };

export const owns = (slot: Slot, id: string) => CATALOG[slot].find((i) => i.id === id)?.price === 0 || profile.owned.includes(`${slot}:${id}`);

/** Push equipped cosmetics into the renderer. */
export function applyCosmetics() {
  theme.orn = ORNAMENTS[profile.equip.orn] ?? C.gold;
}

export type BuyResult = 'equipped' | 'bought' | 'poor';

export function buyOrEquip(slot: Slot, item: Item): BuyResult {
  if (!owns(slot, item.id)) {
    if (profile.coins < item.price) return 'poor';
    profile.coins -= item.price;
    profile.owned.push(`${slot}:${item.id}`);
    profile.equip[slot] = item.id;
    saveProfile();
    applyCosmetics();
    return 'bought';
  }
  profile.equip[slot] = item.id;
  saveProfile();
  applyCosmetics();
  return 'equipped';
}
