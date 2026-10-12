// TENGE on devnet: a Token-2022 token (0 decimals). Tenge earned in tois is kept locally until the player claims
// it; the server mints it to their wallet (api/tenge-claim), but never more than it counted itself by replaying
// the player's verified tois (api/run).
import { apiUrl } from './api';
import { activeProvider } from './solana';
import { profile, saveProfile } from './storage';
import { track } from './idos';

export const TENGE_MINT = (import.meta.env.VITE_TENGE_MINT as string | undefined) || null;
export const DEVNET = 'https://api.devnet.solana.com';
export const MAX_CLAIM = 200;

export const tengeEnabled = () => !!TENGE_MINT;

/** Must match api/tenge-claim.ts. */
const claimMessage = (wallet: string, amount: number, ts: number) => `Toi Bastar: claim ${amount} TENGE to ${wallet} at ${ts}`;

export async function onchainTenge(wallet: string): Promise<number> {
  if (!TENGE_MINT) return 0;
  const g = globalThis as any;
  if (!g.Buffer) g.Buffer = (await import('buffer')).Buffer;
  const { Connection, PublicKey } = await import('@solana/web3.js');
  const conn = new Connection(DEVNET, 'confirmed');
  const res = await conn.getParsedTokenAccountsByOwner(new PublicKey(wallet), { mint: new PublicKey(TENGE_MINT) });
  return res.value.reduce((s, a) => s + Number(a.account.data.parsed.info.tokenAmount.uiAmount ?? 0), 0);
}

export type ClaimResult = { ok: true; sig: string; amount: number } | { ok: false; reason: 'no-wallet' | 'nothing' | 'off' | 'limit' | 'rejected' | 'error'; detail?: string };

export async function claimTenge(want: number): Promise<ClaimResult> {
  const p = activeProvider();
  if (!TENGE_MINT) return { ok: false, reason: 'off' };
  if (!p || !profile.wallet) return { ok: false, reason: 'no-wallet' };
  const amount = Math.min(MAX_CLAIM, Math.floor(profile.coins), Math.floor(want));
  if (amount < 1) return { ok: false, reason: 'nothing' };
  const ts = Date.now();
  let sigB64: string;
  try {
    const r = await p.signMessage(new TextEncoder().encode(claimMessage(profile.wallet, amount, ts)), 'utf8');
    const sig = r instanceof Uint8Array ? r : r.signature;
    let bin = '';
    sig.forEach((b) => (bin += String.fromCharCode(b)));
    sigB64 = btoa(bin);
  } catch (e: any) {
    return { ok: false, reason: 'rejected', detail: String(e?.message ?? e) };
  }
  try {
    const r = await fetch(apiUrl('/api/tenge-claim'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ wallet: profile.wallet, amount, ts, signature: sigB64, key: profile.key }),
    });
    const body = await r.json().catch(() => ({}));
    if (r.status === 429) return { ok: false, reason: 'limit' };
    if (r.status === 402) return { ok: false, reason: 'nothing' };
    if (r.status === 503) return { ok: false, reason: 'off' };
    if (!r.ok) return { ok: false, reason: 'error', detail: body.detail ?? body.error ?? `HTTP ${r.status}` };
    profile.coins -= amount;
    saveProfile();
    track('tenge_claim', undefined, amount);
    return { ok: true, sig: body.sig, amount };
  } catch (e: any) {
    return { ok: false, reason: 'error', detail: String(e?.message ?? e) };
  }
}
