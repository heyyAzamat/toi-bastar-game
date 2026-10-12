// iDos Games engine (@idosgames/core): the player's platform account, event analytics and the
// title's own leaderboard. Optional by design: the SDK is lazy-loaded after the first frame, every call
// is fire-and-forget, and the game plays exactly the same when the platform is unreachable.
// The title's config (leaderboard `toi_score`, analytics events) lives in the iDos dashboard.
import type { IDosGamesClient } from '@idosgames/core';
import { profile } from './storage';

const TITLE = '2YIKIAN5';
const BOARD = 'toi_score';
// {id}-dev.idos.games is the title's sandbox copy; everything else (prod address, Vercel) is prod.
const titleID = () => (/-dev\.idos\.games$/i.test(location.hostname) ? `${TITLE}-DEV` : TITLE);

let ready: Promise<IDosGamesClient | null> | null = null;

/** Sign the player in once (guest account keyed to this device). Null when the platform is unreachable. */
export function idos(): Promise<IDosGamesClient | null> {
  ready ??= (async () => {
    try {
      const { createIDosGamesClient } = await import('@idosgames/core');
      const client = createIDosGamesClient({ titleID: titleID(), appVersion: '1.2.0' });
      const auto = await client.auth.autoLogin();
      if (!auto.ok && !(await client.auth.loginWithDeviceID()).ok) return null;
      void syncName(client);
      return client;
    } catch (e) {
      console.warn('[idos]', e);
      return null;
    }
  })();
  return ready;
}

/** Log a gameplay event to the title's analytics (batched by the SDK). */
export function track(name: string, params?: Record<string, string | number>, value?: number) {
  void idos().then((c) => c?.analytics.logEvent(name, params, value));
}

/**
 * Post a verified total to the iDos leaderboard (best score per player) and return the player's
 * rank there (from the top list). Called only with the server's replayed total, never the client's own number.
 */
export async function postScore(total: number): Promise<number | null> {
  const c = await idos();
  if (!c || total < 1) return null;
  await syncName(c);
  const sub = await c.leaderboard.submitScore(BOARD, Math.round(total));
  if (!sub.ok) return null;
  // The server ranks the top list; the player's own row carries the rank (null outside the top 100).
  const top = await c.leaderboard.getLeaderboard(BOARD);
  const me = c.auth.context?.userID;
  return (top.ok && top.data.TopUsers?.find((u) => u.UserID === me)?.Rank) || null;
}

/** Show the player's in-game name on the platform (its leaderboard rows), once per name change. */
async function syncName(c: IDosGamesClient) {
  let synced: string | null = null;
  try { synced = localStorage.getItem('idos-name'); } catch {}
  // The default name stays the platform's generated one, so every new player isn't "TOISHY".
  if (!profile.name || profile.name === 'TOISHY' || synced === profile.name) return;
  if ((await c.user.changeUsername(profile.name)).ok) {
    try { localStorage.setItem('idos-name', profile.name); } catch {}
  }
}
