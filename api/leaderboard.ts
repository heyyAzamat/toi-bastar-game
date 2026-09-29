// Global leaderboard: Vercel Function backed by Upstash Redis (REST API, no SDK).
// Env: KV_REST_API_URL + KV_REST_API_TOKEN (Vercel Marketplace Upstash) or UPSTASH_REDIS_REST_URL + _TOKEN.

const URL_ = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const BOARD = 'toi:board';
const META = 'toi:meta';

async function redis(cmds: (string | number)[][]): Promise<{ result: any }[]> {
  const r = await fetch(`${URL_}/pipeline`, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  return r.json();
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function GET() {
  if (!URL_ || !TOKEN) return json({ error: 'leaderboard not configured' }, 503);
  const [top] = await redis([['ZREVRANGE', BOARD, 0, 19, 'WITHSCORES']]);
  const flat: string[] = top.result ?? [];
  const ids = flat.filter((_, i) => i % 2 === 0);
  if (!ids.length) return json({ entries: [] });
  const [meta] = await redis([['HMGET', META, ...ids]]);
  const entries = ids.map((id, i) => {
    const m = meta.result?.[i] ? JSON.parse(meta.result[i]) : {};
    return { id, name: m.name ?? 'TOISHY', stars: m.stars ?? 0, wallet: m.wallet ?? null, score: Number(flat[i * 2 + 1]) };
  });
  return json({ entries });
}

export async function POST(req: Request) {
  if (!URL_ || !TOKEN) return json({ error: 'leaderboard not configured' }, 503);
  let b: any;
  try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  const ok =
    typeof b?.id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(b.id) &&
    typeof b.name === 'string' && /^[A-Z0-9А-ЯЁӘҒҚҢӨҰҮҺІ _.-]{1,12}$/.test(b.name) &&
    Number.isInteger(b.score) && b.score >= 0 && b.score <= 20000 &&
    Number.isInteger(b.stars) && b.stars >= 0 && b.stars <= 9 &&
    (b.wallet == null || (typeof b.wallet === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(b.wallet)));
  if (!ok) return json({ error: 'invalid entry' }, 400);
  // GT: only raise a player's best, never lower it.
  const [add] = await redis([['ZADD', BOARD, 'GT', 'CH', b.score, b.id]]);
  const [cur] = await redis([['ZSCORE', BOARD, b.id]]);
  if (add.result || Number(cur.result) === b.score) {
    await redis([['HSET', META, b.id, JSON.stringify({ name: b.name, stars: b.stars, wallet: b.wallet ?? null })]]);
  }
  return json({ ok: true });
}
