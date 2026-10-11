// Leaderboard storage: one sorted set per board, player names in a hash. Written only by api/run.
import { kvConfigured, redis } from './kv.js';

const META = 'toi:meta';
const DAILY_TTL = 8 * 86400; // daily boards expire after a week

/** 'all' (all-time) or 'daily-YYYY-MM-DD'; anything else is rejected. */
export function boardKey(board: unknown): string | null {
  if (board == null || board === 'all') return 'toi:board';
  if (typeof board === 'string' && /^daily-\d{4}-\d{2}-\d{2}$/.test(board)) return `toi:${board}`;
  return null;
}

export interface Player { id: string; name: string; wallet: string | null }

export async function writeScore(board: string, p: Player, score: number, stars: number) {
  const key = boardKey(board);
  if (!key || !kvConfigured()) return;
  // GT: only raise a player's best, never lower it.
  const cmds: (string | number)[][] = [['ZADD', key, 'GT', 'CH', score, p.id]];
  if (key !== 'toi:board') cmds.push(['EXPIRE', key, DAILY_TTL]);
  const [add] = await redis(cmds);
  const [cur] = await redis([['ZSCORE', key, p.id]]);
  if (add.result || Number(cur.result) === score) {
    await redis([['HSET', META, p.id, JSON.stringify({ name: p.name, stars, wallet: p.wallet })]]);
  }
}

export async function readBoard(board: string) {
  const key = boardKey(board)!;
  const [top] = await redis([['ZREVRANGE', key, 0, 19, 'WITHSCORES']]);
  const flat: string[] = top.result ?? [];
  const ids = flat.filter((_, i) => i % 2 === 0);
  if (!ids.length) return [];
  const [meta] = await redis([['HMGET', META, ...ids]]);
  return ids.map((id, i) => {
    const m = meta.result?.[i] ? JSON.parse(meta.result[i]) : {};
    return { id, name: m.name ?? 'TOISHY', stars: m.stars ?? 0, wallet: m.wallet ?? null, score: Number(flat[i * 2 + 1]) };
  });
}
