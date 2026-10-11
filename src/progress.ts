// Long-term goals: toishy ranks (reputation keeps counting after every hall is open) and achievements.
import { WAVES } from './sim/rules';
import { profile } from './storage';

export const RANKS = [0, 300, 1000, 2200, 4000, 7000, 11000, 16000];

export const rankOf = (rep = profile.rep) => RANKS.filter((r) => rep >= r).length - 1;
export const nextRank = (rep = profile.rep) => RANKS.find((r) => r > rep) ?? null;

/** Every guest kind the album shows. */
export const ALBUM_KINDS = ['aksakal', 'azhe', 'kuda', 'kudagi', 'zhigit', 'kelin', 'nagashy', 'child', 'renzhigen', 'bauyr', 'akim', 'asaba'] as const;

export interface Goal { id: string; have: number; need: number }

export function goals(): Goal[] {
  const p = profile;
  return [
    { id: 'album', have: ALBUM_KINDS.filter((k) => p.album[k]).length, need: ALBUM_KINDS.length },
    { id: 'halls', have: Math.min(p.rep, WAVES[3].rep), need: WAVES[3].rep },
    { id: 'stars', have: WAVES.filter((w) => (p.hallStars[w.idx] ?? 0) >= 3).length, need: WAVES.length },
    { id: 'combo', have: Math.min(p.bestCombo, 8), need: 8 },
    { id: 'flawless', have: Math.min(p.flawless, 1), need: 1 },
    { id: 'daily', have: Math.min(p.dailies, 7), need: 7 },
    { id: 'rank', have: Math.min(p.rep, RANKS.at(-1)!), need: RANKS.at(-1)! },
    { id: 'mint', have: p.mementos.some((m) => m.mint) ? 1 : 0, need: 1 },
  ];
}
