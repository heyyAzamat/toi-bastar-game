import type { ToiInvite } from './toi/link';

// Local profile, persisted in localStorage (reads/writes guarded: private mode can throw).

export interface Memento {
  date: string;
  title: string;
  stars: number;
  wave: number;
  png: string;
  signature?: string;
  mint?: string;
}

export interface Profile {
  id: string;
  name: string;
  coins: number; // Shashu tenge: the game token
  best: number;
  stars: number;
  games: number;
  wallet: string | null;
  walletKind: 'phantom' | 'solflare' | null;
  mementos: Memento[];
  muted: boolean;
  lang: string;
  rep: number; // toishy reputation: sum of all toi scores, unlocks halls
  album: Record<string, number>; // guest kind -> times met
  seenRules: number[]; // rules the azhe has already explained
  daily: { key: string; best: number } | null;
  hosted: ToiInvite[]; // "My Toi" invites this player created
}

const KEY = 'toi-bastar-profile';

function newId() {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function load(): Profile {
  const base: Profile = {
    id: newId(), name: 'TOISHY', coins: 0, best: 0, stars: 0, games: 0,
    wallet: null, walletKind: null, mementos: [], muted: false, lang: '', rep: 0, album: {}, seenRules: [], daily: null, hosted: [],
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = { ...base, ...JSON.parse(raw) };
      // Players from before reputation existed start from their best score.
      if (!p.rep && p.best) p.rep = p.best;
      return p;
    }
  } catch {}
  return base;
}

export const profile: Profile = load();

export function saveProfile() {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // Quota: drop the oldest snapshots and retry once.
    profile.mementos = profile.mementos.slice(-2);
    try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch {}
  }
}

export function addMemento(m: Memento) {
  profile.mementos.push(m);
  profile.mementos = profile.mementos.slice(-6);
  saveProfile();
}

export function download(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
