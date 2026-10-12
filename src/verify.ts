// Server-verified runs (api/run). The server picks the seed; after every hall and mini-game the client sends
// its action log, and the server replays it with the same simulation (src/sim) to count score and tenge itself.
// The leaderboard and the claimable tenge balance only ever see the server's numbers.
// Without the API (offline, or no Redis configured) the game still plays; scores then stay local.
import { apiUrl } from './api';
import { run, type RunMode } from './run';
import { track } from './idos';
import { profile } from './storage';
import { go } from './ui';
import type { Action } from './sim/hall';
import type { Tap } from './sim/mini';

const post = async (body: unknown) => {
  const r = await fetch(apiUrl('/api/run'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
};

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

export interface FinishResult { total: number; rank?: number }

export const verify = {
  id: null as string | null,
  // Steps go out one after another, in the order they were played.
  chain: Promise.resolve() as Promise<unknown>,
  mismatch: false,

  step(body: Record<string, unknown>, check?: (r: any) => void) {
    const id = this.id;
    if (!id) return;
    this.chain = this.chain
      .then(() => post({ ...body, runId: id, key: profile.key }))
      .then((r) => check?.(r))
      .catch((e) => console.warn('[verify]', body.op, e));
  },

  hall(wave: number, log: Action[], local: number) {
    track('hall_complete', { mode: run.mode, hall: run.halls[wave] ?? wave }, local);
    this.step({ op: 'hall', wave, log }, (r) => {
      // The client and the server ran the same code; a difference means a determinism bug.
      if (r.stars && r.score !== local) {
        this.mismatch = true;
        console.warn('[verify] hall score differs', { local, server: r.score });
      }
    });
  },

  shashu(wave: number, taps: Tap[]) { this.step({ op: 'interlude', kind: 'shashu', wave, taps }); },
  betashar(wave: number, taps: number[]) { this.step({ op: 'interlude', kind: 'betashar', wave, taps }); },

  /** Ends the run on the server, which submits the total to the leaderboard. Null when unverified. */
  async finish(): Promise<FinishResult | null> {
    if (!this.id) return null;
    const id = this.id;
    this.id = null;
    await this.chain;
    try {
      return await post({ op: 'finish', runId: id, key: profile.key });
    } catch (e) {
      console.warn('[verify] finish', e);
      return null;
    }
  },

  async balance(): Promise<number | null> {
    try {
      return (await withTimeout(post({ op: 'balance', key: profile.key }), 4000)).balance;
    } catch {
      return null;
    }
  },
};

/** Start a toi: reset the run, ask the server for a verified seed, then open the first hall. */
export async function startToi(mode: RunMode, hall = 0) {
  run.reset(mode, hall);
  track('run_start', { mode });
  verify.id = null;
  verify.chain = Promise.resolve();
  if (mode !== 'tutorial') {
    try {
      const r = await withTimeout(post({
        op: 'start', mode, halls: run.halls, key: profile.key,
        player: { id: profile.id, name: profile.name, wallet: profile.wallet },
      }), 3000);
      verify.id = r.runId;
      run.seed = r.seed;
    } catch {
      // Offline or not configured: an unverified toi with a local seed.
    }
  }
  go('hall');
}
