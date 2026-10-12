// POST /api/run: server-verified tois. The server picks the seed, then replays every hall and mini-game from the
// player's action log with the same simulation the browser runs (src/sim), so the score and the tenge it
// records are its own numbers, not the client's.
//   op 'start'     { mode, halls, key, player: { id, name, wallet } } -> { runId, seed }
//   op 'hall'      { runId, key, wave, log }                         -> the replayed hall result
//   op 'interlude' { runId, key, wave, kind, taps }                  -> { coins, candies }
//   op 'finish'    { runId, key }                                    -> { total } and writes the leaderboard
//   op 'balance'   { key }                                           -> { balance }: tenge a claim may mint
// `key` is a random secret kept in the player's browser; tenge is credited to its hash.
import { randomBytes } from 'node:crypto';
import { WAVES, dailyChallenge, hallDef, hallSeed } from '../src/sim/rules.js';
import { replayHall, STEP } from '../src/sim/hall.js';
import { replayShashu, replayBetashar, SHASHU_TIME, BOWS, QUARTER } from '../src/sim/mini.js';
import { bump, kvGet, kvSet, kvUsable, hashKey, balanceKey } from './_lib/kv.js';
import { writeScore, type Player } from './_lib/board.js';
import { json, preflight } from './_lib/http.js';

const RUN_TTL = 6 * 3600;
const BALANCE_TTL = 5 * 365 * 86400;
const RUNS_PER_HOUR = 60;
const MAX_LOG = 3000;
/** Real seconds a Betashar takes at the least: the whole song up to the last bow. */
const BETASHAR_TIME = (4 + (BOWS - 1) * 2) * QUARTER;

type Mode = 'campaign' | 'daily' | 'quick';

interface RunRec {
  mode: Mode;
  halls: number[];
  seed: number;
  dailyKey: string;
  owner: string; // hash of the player's key
  player: Player;
  clock: number; // ms when the last step arrived (or the run started)
  scores: number[];
  stars: number[];
  candies: number[];
  inter: boolean[];
  finished: boolean;
}

const runKey = (id: string) => `run:${id}`;
const validKey = (k: unknown): k is string => typeof k === 'string' && /^[A-Za-z0-9-]{16,128}$/.test(k);
const interlude = (wave: number) => (wave % 2 === 0 ? 'shashu' : 'betashar');

/** Real time must cover the simulated time (with slack for clocks and network). Off in local dev. */
function tooFast(rec: RunRec, simSeconds: number) {
  const now = Date.now();
  const fast = !!process.env.VERCEL && (now - rec.clock) / 1000 < simSeconds * 0.9 - 3;
  rec.clock = now;
  return fast;
}

function validPlayer(p: any): p is Player {
  return p && typeof p.id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(p.id)
    && typeof p.name === 'string' && /^[A-Z0-9А-ЯЁӘҒҚҢӨҰҮҺІ _.-]{1,12}$/.test(p.name)
    && (p.wallet == null || (typeof p.wallet === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(p.wallet)));
}

async function start(b: any) {
  const { mode, halls, key, player } = b;
  if (!['campaign', 'daily', 'quick'].includes(mode) || !Array.isArray(halls) || !validPlayer(player)) return json({ error: 'invalid request' }, 400);
  const daily = dailyChallenge();
  const ok = mode === 'campaign' ? halls.length >= 1 && halls.length <= WAVES.length && halls.every((h, i) => h === i)
    : mode === 'quick' ? halls.length === 1 && Number.isInteger(halls[0]) && halls[0] >= 0 && halls[0] < WAVES.length
      : halls.length === 1 && halls[0] === daily.hall;
  if (!ok) return json({ error: 'bad halls' }, 400);
  const owner = hashKey(key);
  const hour = Math.floor(Date.now() / 3600_000);
  if ((await bump(`runs:${owner}:${hour}`, 1, 3600)) > RUNS_PER_HOUR) return json({ error: 'too many runs' }, 429);
  const runId = randomBytes(12).toString('hex');
  const seed = mode === 'daily' ? daily.seed : randomBytes(4).readUInt32LE(0) || 1;
  const rec: RunRec = {
    mode, halls, seed, dailyKey: daily.key, owner,
    player: { id: player.id, name: player.name, wallet: player.wallet ?? null },
    clock: Date.now(), scores: halls.map(() => 0), stars: halls.map(() => 0), candies: halls.map(() => 0),
    inter: halls.map(() => false), finished: false,
  };
  await kvSet(runKey(runId), JSON.stringify(rec), RUN_TTL);
  return json({ runId, seed });
}

async function credit(owner: string, coins: number) {
  if (coins > 0) await bump(balanceKey(owner), coins, BALANCE_TTL);
}

async function hall(rec: RunRec, b: any) {
  const { wave, log } = b;
  if (!Number.isInteger(wave) || wave < 0 || wave >= rec.halls.length || !Array.isArray(log) || log.length > MAX_LOG) {
    return json({ error: 'invalid request' }, 400);
  }
  // A hall opens only after the previous one was won and its interlude played (retries are fine).
  if (wave > 0 && !(rec.stars[wave - 1] > 0 && rec.inter[wave - 1])) return json({ error: 'out of order' }, 409);
  const seed = hallSeed(rec.seed, wave);
  const r = replayHall(hallDef(rec.halls[wave], seed), seed, log);
  if (tooFast(rec, r.ticks * STEP)) return json({ error: 'too fast' }, 409);
  await credit(rec.owner, r.coins);
  if (r.stars > 0) {
    rec.scores[wave] = r.score;
    rec.stars[wave] = r.stars;
  }
  return r;
}

async function interludeStep(rec: RunRec, b: any) {
  const { wave, kind, taps } = b;
  if (!Number.isInteger(wave) || wave < 0 || wave >= rec.halls.length - 1 || !Array.isArray(taps) || taps.length > 1000) {
    return json({ error: 'invalid request' }, 400);
  }
  if (!(rec.stars[wave] > 0) || rec.inter[wave] || kind !== interlude(wave)) return json({ error: 'out of order' }, 409);
  const r = kind === 'shashu' ? replayShashu(hallSeed(rec.seed, wave), taps) : { candies: 0, ...replayBetashar(taps) };
  if (tooFast(rec, kind === 'shashu' ? SHASHU_TIME : BETASHAR_TIME)) return json({ error: 'too fast' }, 409);
  await credit(rec.owner, r.coins);
  rec.candies[wave] = r.candies;
  rec.inter[wave] = true;
  return r;
}

async function finish(rec: RunRec) {
  if (rec.finished || !rec.stars.every((s) => s > 0)) return json({ error: 'not finished' }, 409);
  rec.finished = true;
  const total = rec.scores.reduce((a, b) => a + b, 0) + rec.candies.reduce((a, b) => a + b, 0) * 2;
  const stars = rec.stars.reduce((a, b) => a + b, 0);
  await writeScore(rec.mode === 'daily' ? `daily-${rec.dailyKey}` : 'all', rec.player, total, stars);
  return { total, stars };
}

export async function POST(req: Request) {
  if (!kvUsable()) return json({ error: 'verification not configured' }, 503);
  let b: any;
  try { b = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  if (!b || !validKey(b.key)) return json({ error: 'invalid request' }, 400);
  if (b.op === 'start') return start(b);
  if (b.op === 'balance') return json({ balance: Math.max(0, Number(await kvGet(balanceKey(hashKey(b.key)))) || 0) });

  if (typeof b.runId !== 'string' || !/^[0-9a-f]{24}$/.test(b.runId)) return json({ error: 'invalid request' }, 400);
  const raw = await kvGet(runKey(b.runId));
  if (!raw) return json({ error: 'unknown run' }, 404);
  const rec: RunRec = JSON.parse(raw);
  if (rec.owner !== hashKey(b.key)) return json({ error: 'not your run' }, 403);
  if (rec.finished) return json({ error: 'finished' }, 409);

  const out = b.op === 'hall' ? await hall(rec, b)
    : b.op === 'interlude' ? await interludeStep(rec, b)
      : b.op === 'finish' ? await finish(rec)
        : json({ error: 'bad op' }, 400);
  if (out instanceof Response && !out.ok) return out;
  await kvSet(runKey(b.runId), JSON.stringify(rec), RUN_TTL);
  return out instanceof Response ? out : json(out);
}

export const OPTIONS = preflight;
