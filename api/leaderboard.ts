// Global leaderboard (read only). Scores are written by api/run after it replays a toi; see docs/solana.md.
import { boardKey, readBoard } from './_lib/board.js';
import { kvConfigured } from './_lib/kv.js';
import { json, preflight } from './_lib/http.js';

export async function GET(req: Request) {
  if (!kvConfigured()) return json({ error: 'leaderboard not configured' }, 503);
  const board = new URL(req.url).searchParams.get('board') ?? 'all';
  if (!boardKey(board)) return json({ error: 'bad board' }, 400);
  return json({ entries: await readBoard(board) });
}

/** Scores used to be posted by the client; now only a replayed run can set one. */
export async function POST() {
  return json({ error: 'scores are submitted by /api/run' }, 410);
}

export const OPTIONS = preflight;
