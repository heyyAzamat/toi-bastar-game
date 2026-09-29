// Global leaderboard client (/api/leaderboard) with a local fallback when offline.
import { profile } from './storage';

export interface Entry {
  id: string;
  name: string;
  score: number;
  stars: number;
  wallet?: string | null;
}

const LOCAL = 'toi-bastar-board';

function localBoard(): Entry[] {
  try { return JSON.parse(localStorage.getItem(LOCAL) || '[]'); } catch { return []; }
}

function saveLocal(e: Entry) {
  const board = localBoard().filter((x) => x.id !== e.id || x.score > e.score);
  if (!board.some((x) => x.id === e.id)) board.push(e);
  board.sort((a, b) => b.score - a.score);
  try { localStorage.setItem(LOCAL, JSON.stringify(board.slice(0, 20))); } catch {}
}

export async function fetchBoard(): Promise<{ entries: Entry[]; online: boolean }> {
  try {
    const r = await fetch('/api/leaderboard');
    if (r.ok) return { entries: (await r.json()).entries, online: true };
  } catch {}
  return { entries: localBoard(), online: false };
}

export async function submitScore(score: number, stars: number) {
  const e: Entry = { id: profile.id, name: profile.name, score, stars, wallet: profile.wallet };
  saveLocal(e);
  try {
    await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(e),
    });
  } catch {}
}
