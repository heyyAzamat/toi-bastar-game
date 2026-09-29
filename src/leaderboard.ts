// Global leaderboards (/api/leaderboard): all-time, plus one board per daily toi. Local fallback when offline.
import { profile } from './storage';

export interface Entry {
  id: string;
  name: string;
  score: number;
  stars: number;
  wallet?: string | null;
}

/** 'all' or 'daily-YYYY-MM-DD'. */
export type Board = string;

const localKey = (board: Board) => (board === 'all' ? 'toi-bastar-board' : `toi-bastar-${board}`);

function localBoard(board: Board): Entry[] {
  try { return JSON.parse(localStorage.getItem(localKey(board)) || '[]'); } catch { return []; }
}

function saveLocal(board: Board, e: Entry) {
  const list = localBoard(board).filter((x) => x.id !== e.id || x.score > e.score);
  if (!list.some((x) => x.id === e.id)) list.push(e);
  list.sort((a, b) => b.score - a.score);
  try { localStorage.setItem(localKey(board), JSON.stringify(list.slice(0, 20))); } catch {}
}

export async function fetchBoard(board: Board = 'all'): Promise<{ entries: Entry[]; online: boolean }> {
  try {
    const r = await fetch(`/api/leaderboard?board=${encodeURIComponent(board)}`);
    if (r.ok) return { entries: (await r.json()).entries, online: true };
  } catch {}
  return { entries: localBoard(board), online: false };
}

export async function submitScore(score: number, stars: number, board: Board = 'all') {
  const e: Entry = { id: profile.id, name: profile.name, score, stars, wallet: profile.wallet };
  saveLocal(board, e);
  try {
    await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...e, board }),
    });
  } catch {}
}
