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

export { json } from './http.js';

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

// Rate limits and nonces live in kv.ts (Upstash Redis, or memory in dev).
export { bump, useOnce } from './kv.js';
