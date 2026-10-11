import type { ToiInvite } from './toi/link';

// Local profile, persisted in localStorage (reads/writes guarded: private mode can throw).

export interface Memento {
  id?: string; // key of the PNG in IndexedDB
  date: string;
  title: string;
  stars: number;
  wave: number;
  png?: string; // only on mementos from before IndexedDB; moved out on load
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
  tutorialDone: boolean;
  seenTools: boolean; // the azhe has introduced tap-to-seat and the host helpers
  owned: string[]; // shop items, e.g. 'table:teal'
  key: string; // private: proves to api/run that verified tenge is this player's
  hallStars: number[]; // best stars per hall, by WAVES index
  bestCombo: number;
  flawless: number; // halls finished with every guest seated perfectly
  dailies: number; // daily tois played
  equip: { table: string; feast: string; orn: string; avatar: string };
}

const KEY = 'toi-bastar-profile';

function newId() {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function load(): Profile {
  const base: Profile = {
    id: newId(), name: 'TOISHY', coins: 0, best: 0, stars: 0, games: 0,
    wallet: null, walletKind: null, mementos: [], muted: false, lang: '', rep: 0, album: {}, seenRules: [], daily: null, hosted: [], tutorialDone: false, seenTools: false, owned: [],
    key: newId() + newId(), hallStars: [], bestCombo: 0, flawless: 0, dailies: 0,
    equip: { table: 'cream', feast: 'plain', orn: 'gold', avatar: 'zhigit0' },
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = { ...base, ...JSON.parse(raw) };
      // Players from before reputation existed start from their best score.
      if (!p.rep && p.best) p.rep = p.best;
      // Anyone who already played skips the tutorial.
      if (p.games && raw.indexOf('tutorialDone') < 0) p.tutorialDone = true;
      return p;
    }
  } catch {}
  return base;
}

export const profile: Profile = load();
// Persist fields added since the last visit (the tenge key must not change between loads).
saveProfile();

export function saveProfile() {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch (e) {
    // Snapshots live in IndexedDB now, so the profile is small; this should not happen.
    console.warn('profile not saved', e);
  }
}

// --- Memento snapshots: PNG data URLs in IndexedDB (localStorage has a ~5 MB quota) ---------------

const DB = 'toi-bastar';
const STORE = 'mementos';
const KEEP = 12;
const pngs = new Map<string, string>(); // id -> PNG data URL, loaded at boot

function db(): Promise<IDBDatabase> {
  return new Promise((ok, fail) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fail(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((ok, fail) => {
    const req = fn(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fail(req.error);
  });
}

/** The snapshot of a memento (null until loadMementos() has run, or if the browser dropped it). */
export const mementoPng = (m?: Memento | null) => (m ? m.png ?? (m.id ? pngs.get(m.id) : undefined) ?? null : null);

/** At boot: move old localStorage snapshots into IndexedDB and cache every snapshot in memory. */
export async function loadMementos() {
  try {
    let moved = false;
    for (const m of profile.mementos) {
      if (!m.png) continue;
      m.id ??= newId();
      await tx('readwrite', (s) => s.put(m.png!, m.id!));
      pngs.set(m.id, m.png);
      delete m.png;
      moved = true;
    }
    if (moved) saveProfile();
    for (const m of profile.mementos) {
      if (m.id && !pngs.has(m.id)) {
        const png = await tx<string | undefined>('readonly', (s) => s.get(m.id!));
        if (png) pngs.set(m.id, png);
      }
    }
  } catch (e) {
    // No IndexedDB (some private modes): snapshots stay in memory for this session only.
    console.warn('mementos: IndexedDB unavailable', e);
  }
}

export async function addMemento(m: Memento) {
  const png = m.png!;
  const id = (m.id ??= newId());
  delete m.png;
  pngs.set(id, png);
  profile.mementos.push(m);
  const drop = profile.mementos.slice(0, -KEEP);
  profile.mementos = profile.mementos.slice(-KEEP);
  saveProfile();
  try {
    await tx('readwrite', (s) => s.put(png, id));
    for (const o of drop) if (o.id) { pngs.delete(o.id); await tx('readwrite', (s) => s.delete(o.id!)); }
  } catch (e) {
    console.warn('memento not stored', e);
  }
}

export function download(dataUrl: string, filename: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
