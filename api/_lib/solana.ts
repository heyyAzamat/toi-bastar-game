// Server-side Solana helpers shared by the API functions (files under api/_lib are not routes).
// The authority keypair (TENGE mint authority + Toi Estelygi collection authority) lives only in
// TOI_AUTHORITY_SECRET on the server; the client never sees it.
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { ed25519 } from '@noble/curves/ed25519';
import bs58 from 'bs58';

export const RPC = process.env.SOLANA_RPC ?? 'https://api.devnet.solana.com';
export const connection = () => new Connection(RPC, 'confirmed');

export function authority(): Keypair | null {
  const raw = process.env.TOI_AUTHORITY_SECRET;
  if (!raw) return null;
  try {
    const bytes = raw.trim().startsWith('[') ? Uint8Array.from(JSON.parse(raw)) : bs58.decode(raw.trim());
    return Keypair.fromSecretKey(bytes);
  } catch {
    return null;
  }
}

export const tengeMint = () => (process.env.TENGE_MINT ? new PublicKey(process.env.TENGE_MINT) : null);
export const collectionAddress = () => process.env.ESTELYGI_COLLECTION ?? null;

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export function isWallet(s: unknown): s is string {
  if (typeof s !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)) return false;
  try {
    return PublicKey.isOnCurve(new PublicKey(s).toBytes());
  } catch {
    return false;
  }
}

/** The wallet signed exactly this message (ed25519 over UTF-8 bytes). */
export function verifySignature(wallet: string, message: string, signatureB64: string): boolean {
  try {
    const sig = Uint8Array.from(Buffer.from(signatureB64, 'base64'));
    return ed25519.verify(sig, new TextEncoder().encode(message), new PublicKey(wallet).toBytes());
  } catch {
    return false;
  }
}

// --- Rate limits: Upstash Redis when configured, else per-instance memory (dev) ----------------

const KV_URL = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const memory = new Map<string, { n: number; exp: number }>();

/** Adds `amount` to a counter that resets after `ttl` seconds; returns the new total. */
export async function bump(key: string, amount: number, ttl: number): Promise<number> {
  if (KV_URL && KV_TOKEN) {
    const r = await fetch(`${KV_URL}/pipeline`, {
      method: 'POST',
      headers: { authorization: `Bearer ${KV_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify([['INCRBY', key, amount], ['EXPIRE', key, ttl, 'NX']]),
    });
    const [inc] = await r.json();
    return Number(inc.result);
  }
  const now = Date.now();
  const cur = memory.get(key);
  const n = (cur && cur.exp > now ? cur.n : 0) + amount;
  memory.set(key, { n, exp: cur && cur.exp > now ? cur.exp : now + ttl * 1000 });
  return n;
}

/** One-time nonce: false if this signature was already used (replay). */
export async function useOnce(key: string, ttl: number): Promise<boolean> {
  return (await bump(`once:${key}`, 1, ttl)) === 1;
}
