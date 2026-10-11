// Upstash Redis over REST (no SDK), with a per-instance memory fallback for local dev.
import { createHash } from 'node:crypto';

// Env: KV_REST_API_URL + KV_REST_API_TOKEN (Vercel Marketplace Upstash) or UPSTASH_REDIS_REST_URL + _TOKEN.

const URL_ = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

export const kvConfigured = () => !!(URL_ && TOKEN);
/** On Vercel, memory is per instance and forgets: anything stateful needs the real store. */
export const kvUsable = () => kvConfigured() || !process.env.VERCEL;

export async function redis(cmds: (string | number)[][]): Promise<{ result: any }[]> {
  const r = await fetch(`${URL_}/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  return r.json();
}

const memory = new Map<string, { v: string; exp: number }>();
const live = (k: string) => {
  const e = memory.get(k);
  if (e && e.exp > Date.now()) return e;
  memory.delete(k);
  return null;
};

export async function kvGet(key: string): Promise<string | null> {
  if (kvConfigured()) return (await redis([['GET', key]]))[0].result ?? null;
  return live(key)?.v ?? null;
}

export async function kvSet(key: string, value: string, ttl: number) {
  if (kvConfigured()) await redis([['SET', key, value, 'EX', ttl]]);
  else memory.set(key, { v: value, exp: Date.now() + ttl * 1000 });
}

/** Adds `amount` to a counter that expires `ttl` seconds after it was created; returns the new total. */
export async function bump(key: string, amount: number, ttl: number): Promise<number> {
  if (kvConfigured()) {
    const [inc] = await redis([['INCRBY', key, amount], ['EXPIRE', key, ttl, 'NX']]);
    return Number(inc.result);
  }
  const cur = live(key);
  const n = (cur ? Number(cur.v) : 0) + amount;
  memory.set(key, { v: String(n), exp: cur ? cur.exp : Date.now() + ttl * 1000 });
  return n;
}

/** One-time nonce: false if this key was already used (replay). */
export async function useOnce(key: string, ttl: number): Promise<boolean> {
  return (await bump(`once:${key}`, 1, ttl)) === 1;
}

// --- Tenge ledger: what api/run counted for a player, keyed by the hash of their private key ---

export const hashKey = (key: string) => createHash('sha256').update(key).digest('hex');
export const balanceKey = (owner: string) => `tenge:bal:${owner}`;
